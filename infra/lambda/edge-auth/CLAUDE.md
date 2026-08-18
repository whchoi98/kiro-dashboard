# infra/lambda/edge-auth/ — Lambda@Edge Cognito Auth

## Role

CloudFront Viewer Request Lambda@Edge function. Authenticates all requests via Cognito PKCE flow before they reach the ALB/ECS origin. Deployed to us-east-1 by CDK `cloudfront.experimental.EdgeFunction`.

## Files

| File | Description |
|------|-------------|
| `index.ts` | Entry point handler — routes `/api/health`, `/auth/callback`, `/auth/logout`, all others |
| `auth.ts` | JWT validation (`aws-jwt-verify`), PKCE generation, token exchange/refresh via Cognito `/oauth2/token` |
| `config.ts` | SSM Parameter Store config loader — reads `/kiro-dashboard/edge-auth/config` from us-east-1, caches in module-level variable |
| `cookies.ts` | Cookie parsing from CloudFront headers, serialization with HttpOnly/Secure/SameSite, token cookie builders |
| `types.ts` | `EdgeAuthConfig`, `TokenSet`, `CookieMap` interfaces |
| `package.json` | `aws-jwt-verify` as production dep; `@aws-sdk/client-ssm` and `@types/aws-lambda` as dev deps |

## Auth Flow

1. Request arrives at CloudFront → Lambda@Edge (Viewer Request)
2. `/api/health` passes through without auth — and it is the ONLY exempt path (index.ts): /manifest.webmanifest and the three PWA icon PNGs are behind Cognito too. Add-to-home-screen works because Safari fetches them with session cookies; if a device ever shows a screenshot icon instead of the Kiro icon, add those 4 paths to the passthrough. Standalone installs keep a separate cookie store and re-auth on first launch (see app/CLAUDE.md Auth).
3. `/auth/callback` exchanges the authorization code for tokens (PKCE), then 302s to the original path (carried in `state`)
4. `/auth/logout` clears cookies, redirects to Cognito logout endpoint
5. All other paths: validate `id_token` cookie via JWKS → if valid, inject `X-User-Email`/`X-User-Name` headers → forward to origin
6. If token invalid, attempt refresh via `refresh_token` cookie
7. If refresh fails, redirect to Cognito Hosted UI authorize endpoint with PKCE challenge (`redirect_uri` built from the request `Host`, so every served domain must be a Cognito CallbackURL)

### Callback resilience & safety (see ADR-0006)

- **Self-heal once**: if the token exchange is rejected (Cognito `invalid_grant`/`invalid_request` — code↔`pkce_verifier` mismatch from a stale/reused code or a verifier cookie clobbered by a concurrent request) or the code/verifier is missing, the callback re-initiates auth by 302-ing to the original path instead of dead-ending. An `auth_retry` cookie (maxAge 120s) bounds this to **one** retry; a second consecutive failure returns a friendly Korean 401 page and clears the guard. Success clears both `auth_retry` and `pkce_verifier`. This automates the "reload and it works" behavior (fresh authorize succeeds via the active Cognito session).
- **Open-redirect guard**: the `state`-decoded return path is validated with the URL API against a throwaway origin — only a same-origin `pathname[+search+hash]` is accepted; backslashes, control chars, and schemes are rejected (blocks `/\evil.com`-style protocol-relative redirects). Never emit a host/scheme into `Location`.

## Constraints

- **No environment variables** — Lambda@Edge does not support env vars; config loaded from SSM
- **1MB bundle limit** (Viewer Request) — `@aws-sdk/*` marked as external (available in Node.js 20.x runtime), only `aws-jwt-verify` (~50KB) is bundled
- **us-east-1 only** — Lambda@Edge functions must be in us-east-1; CDK handles cross-region deployment
- **`require('https')` in auth.ts** — inline require avoids esbuild bundling Node.js built-in

## Dependencies

- `aws-jwt-verify` — Cognito JWT/JWKS validation with automatic key caching
- `@aws-sdk/client-ssm` — SSM GetParameter (runtime-provided, not bundled)

## Ops

- Edge logs live in us-east-1 REPLICATED log groups: aws logs tail "/aws/lambda/us-east-1.<function-name>" --region <viewer-region> — see docs/runbooks/auth-failure.md for the full flow
- Redeploy: cd infra && npx cdk deploy KiroDashboardEdgeLambda KiroDashboardCdn (Lambda@Edge version replication takes minutes; old-version DELETE_FAILED is benign)
