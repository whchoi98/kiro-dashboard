# ADR-0006: Lambda@Edge Auth Callback Self-Heal and Open-Redirect Guard

**Date**: 2026-07-18
**Status**: Accepted
**Deciders**: whchoi98

---

## Context

After the custom domain (`kirodashboard.whchoi.net`) went live, users hit **"Authentication failed"** on the first login attempt; reloading the URL then let them in silently. Production Lambda@Edge logs showed Cognito `/oauth2/token` returning `400 invalid_grant` / `invalid_request` — the authorization `code` and the PKCE `code_verifier` cookie did not line up (a stale/reused code, or a verifier cookie clobbered by a concurrent unauthenticated request). The app-client config was correct (public client, code+PKCE, both callback URLs whitelisted), so this was not a configuration fault.

The callback handler (`infra/lambda/edge-auth/index.ts`) responded to any exchange failure with a hard `502 "Authentication failed"` — a dead end. Yet a fresh authorize round-trip succeeds almost immediately via the active Cognito session (exactly what a manual reload did). Separately, a background security review flagged that the `state`→return-path decode fed a `Location` header after only a `startsWith('/')` check, allowing `/\evil.com`-style protocol-relative open redirects.

## Decision

- **Self-heal once.** On a missing code/verifier or a token-exchange rejection, the callback redirects back to the original in-app path to re-initiate auth instead of returning 502. A short-lived `auth_retry` cookie (maxAge 120s, path `/`) guards against a redirect loop: if it is already set, the callback shows a friendly Korean 401 page and clears the guard so a future fresh attempt can self-heal again. On success, `auth_retry` and `pkce_verifier` are cleared.
- **Same-origin return path.** The `state`-decoded path is validated with the URL API against a throwaway origin; only a same-origin `pathname[+search+hash]` is accepted, and backslashes/control chars/schemes are rejected up front. Never emit host/scheme into `Location`.

## Consequences

### Positive

- The transient PKCE mismatch no longer surfaces to the user — the flow completes on the same navigation that previously dead-ended, matching the manual-reload workaround automatically.
- Open-redirect vector closed (verified: `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:`, control chars all fall back to `/`).

### Negative

- A genuinely broken auth setup now costs one extra authorize round-trip before the 401 page appears (bounded to one retry by `auth_retry`).
- Does not remove the root cause of the verifier/code mismatch (concurrent-request clobbering); it makes the flow resilient to it. A deeper fix (gating auth-initiation to document navigations) is noted as a future option.

### Neutral

- Requires a Lambda@Edge redeploy (`KiroDashboardCdn`, which must deploy with `KiroDashboardEcs` due to the shared synth-time `X-Custom-Secret`); edge replication takes several minutes and the old version's `DELETE_FAILED` is benign.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| Keep the hard 502 | Dead-ends the user on a transient failure that self-corrects on reload |
| Infinite auto-retry | Redirect loop when auth is genuinely broken; bounded to one retry instead |
| `startsWith('/')`-only path check | Allows `/\evil.com` protocol-relative open redirect (flagged by security review) |
