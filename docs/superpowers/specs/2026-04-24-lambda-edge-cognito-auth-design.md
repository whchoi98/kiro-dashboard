# CloudFront Lambda@Edge + Cognito Authentication Design

**Date**: 2026-04-24
**Status**: Approved
**Author**: WooHyung Choi + Claude

---

## Summary

Replace the app-level NextAuth.js authentication with CloudFront Lambda@Edge + Cognito Hosted UI authentication. All auth logic moves to the CDN edge — unauthenticated requests never reach ALB/ECS, reducing compute cost and simplifying the application code.

## Current State

- CloudFront → ALB (X-Custom-Secret header) → ECS Fargate (Next.js 14)
- Cognito UserPool exists in SecurityStack (`kiro-dashboard-users`)
- NextAuth.js + Cognito Provider configured in app (`lib/auth.ts`)
- Auth is NOT enforced: no `getServerSession()` calls or Next.js middleware
- Custom login page at `app/login/page.tsx`

## Target State

- CloudFront → Lambda@Edge (Viewer Request, JWT validation) → ALB → ECS
- Cognito Hosted UI for login (replaces custom login page)
- Public Cognito client + PKCE flow (no client secret)
- NextAuth.js completely removed from the application

---

## Architecture

```
User Browser
    │
    ▼
CloudFront Distribution (ap-northeast-2)
    │
    ├─ [Lambda@Edge: Viewer Request] (us-east-1)
    │     │
    │     ├─ Valid JWT in cookie? ──────→ Pass to ALB origin + inject X-User-Email header
    │     │
    │     ├─ Path /auth/callback? ─────→ Exchange auth code for tokens → set cookies → redirect
    │     │
    │     ├─ Path /auth/logout? ───────→ Clear cookies → redirect to Cognito logout endpoint
    │     │
    │     └─ No/expired JWT? ──────────→ Generate PKCE verifier → redirect to Cognito Hosted UI
    │
    ▼
ALB (X-Custom-Secret validation) → ECS Fargate (Next.js)
```

### Authentication Flow (detailed)

1. User accesses CloudFront URL
2. Lambda@Edge checks `id_token` cookie
3. If no valid JWT → generate PKCE `code_verifier` + `code_challenge`, store verifier in temporary cookie, redirect to Cognito Hosted UI with `code_challenge`
4. User authenticates on Cognito Hosted UI
5. Cognito redirects to `/auth/callback?code=xxx&state=yyy`
6. Lambda@Edge exchanges auth code + code_verifier for tokens via Cognito `/oauth2/token`
7. Lambda@Edge validates the received `id_token`
8. Sets HttpOnly cookies (`id_token`, `access_token`, `refresh_token`)
9. Redirects to original URL (from `state` parameter)
10. Subsequent requests: Lambda validates JWT from cookie, passes through with user info headers

### Token Refresh Flow

1. Lambda@Edge finds expired `id_token` but valid `refresh_token` in cookies
2. Calls Cognito `/oauth2/token` with `grant_type=refresh_token`
3. Receives new `id_token` + `access_token`
4. Sets updated cookies
5. Passes request through to origin

---

## Lambda@Edge Function

### Specification

| Property | Value |
|----------|-------|
| Runtime | Node.js 20.x |
| Trigger | CloudFront Viewer Request |
| Deploy Region | us-east-1 (automatic via CDK EdgeFunction) |
| Timeout | 5 seconds |
| Memory | 128 MB |
| Bundle Size | ~60KB (well under 1MB limit) |

### Dependencies

| Package | Bundled Size | Purpose |
|---------|-------------|---------|
| `aws-jwt-verify` | ~50KB | Cognito JWT signature + claims validation, JWKS caching |
| Auth handler code | ~10KB | PKCE flow, cookie handling, routing |
| `@aws-sdk/client-ssm` | 0 (runtime) | Config loading from SSM (included in Node.js 20.x runtime) |

### Configuration Loading

Lambda@Edge does not support environment variables. Configuration is loaded from SSM Parameter Store (us-east-1) on cold start and cached in module-level variables.

SSM parameter: `/kiro-dashboard/edge-auth/config`

```json
{
  "userPoolId": "ap-northeast-2_xxxxxxx",
  "clientId": "xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "cognitoDomain": "kiro-dashboard-{account}.auth.ap-northeast-2.amazoncognito.com",
  "cognitoRegion": "ap-northeast-2"
}
```

### Request Routing

| Path | Action |
|------|--------|
| `/auth/callback` | Exchange authorization code for tokens, set cookies, redirect to original URL |
| `/auth/logout` | Clear all auth cookies, redirect to Cognito `/logout` endpoint |
| `/api/health` | Pass through without auth (ECS health check) |
| `*` (all others) | Validate JWT cookie; pass through if valid, redirect to Cognito if not |

### Cookie Design

| Cookie | Purpose | Attributes |
|--------|---------|------------|
| `id_token` | User identity JWT (email, name) | `Secure; HttpOnly; SameSite=Lax; Path=/` |
| `access_token` | Cognito access token | `Secure; HttpOnly; SameSite=Lax; Path=/` |
| `refresh_token` | Silent token refresh | `Secure; HttpOnly; SameSite=Lax; Path=/` |
| `pkce_verifier` | PKCE code_verifier (temporary) | `Secure; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=300` |

### User Info Forwarding

For authenticated requests, Lambda@Edge injects custom headers before forwarding to the ALB origin:

| Header | Source | Example |
|--------|--------|---------|
| `X-User-Email` | `id_token.email` claim | `user@example.com` |
| `X-User-Name` | `id_token.name` claim | `WooHyung Choi` |

The app can read these headers for user display without any auth library.

---

## CDK Infrastructure Changes

### SecurityStack

**Keep existing:**
- UserPool (`kiro-dashboard-users`)
- UserPoolClient (`DashboardClient`) — backward compatibility
- Security groups, CfnOutputs

**Add:**
- `EdgeAuthClient`: new public UserPoolClient for Lambda@Edge
  - `generateSecret: false` (public client)
  - OAuth: `authorizationCodeGrant: true`
  - Scopes: `openid`, `email`, `profile`
  - `callbackUrls`: `['https://placeholder.cloudfront.net/auth/callback']` (updated by CdnStack post-deploy)
  - `logoutUrls`: `['https://placeholder.cloudfront.net']`
- Export `userPool` object and `edgeClient.userPoolClientId` as stack props

### CdnStack

**New Props:**
```typescript
export interface CdnStackProps extends cdk.StackProps {
  alb: elbv2.ApplicationLoadBalancer;
  customSecret: string;
  userPool: cognito.IUserPool;          // NEW
  edgeClientId: string;                  // NEW
  userPoolDomain: string;                // NEW (e.g., 'kiro-dashboard-{account}')
}
```

**Add:**

1. **EdgeFunction** (`cloudfront.experimental.EdgeFunction`)
   - Automatically deploys to us-east-1
   - Code: `infra/lambda/edge-auth/index.ts`
   - Bundled with esbuild, `@aws-sdk/*` marked as external

2. **SSM Parameter** (us-east-1, via `AwsCustomResource`)
   - Path: `/kiro-dashboard/edge-auth/config`
   - Value: JSON with userPoolId, clientId, cognitoDomain, cognitoRegion
   - Written after SecurityStack resources are available

3. **Cognito Callback URL Update** (via `AwsCustomResource`)
   - Executes after CloudFront Distribution is created
   - Updates `EdgeAuthClient` callbackUrls with actual CF distribution domain
   - Updates logoutUrls similarly

4. **Distribution modification**
   - Add `edgeLambdas` to `defaultBehavior`:
     ```typescript
     edgeLambdas: [{
       functionVersion: edgeFunction.currentVersion,
       eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
     }]
     ```

### bin/app.ts

```typescript
// SecurityStack now exports edgeClientId
const securityStack = new SecurityStack(app, 'KiroDashboardSecurity', {
  env,
  vpc: networkStack.vpc,
});

new CdnStack(app, 'KiroDashboardCdn', {
  env,
  alb: ecsStack.alb,
  customSecret: ecsStack.customSecret,
  userPool: securityStack.userPool,
  edgeClientId: securityStack.edgeClientId,
  userPoolDomain: `kiro-dashboard-${env.account}`,
});
```

### Deployment Order

Same as existing: `NetworkStack → SecurityStack → EcsStack → CdnStack`

Single command: `npx cdk deploy --all`

CdnStack internal ordering (CloudFormation dependency resolution):
1. AwsCustomResource writes SSM config (depends on SecurityStack outputs)
2. EdgeFunction created (standalone, reads SSM at runtime)
3. CloudFront Distribution created (depends on EdgeFunction)
4. AwsCustomResource updates Cognito callback URL (depends on Distribution)

---

## Application Code Changes

### Files to Remove

| File | Reason |
|------|--------|
| `lib/auth.ts` | NextAuth config — replaced by Lambda@Edge |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth handler — no longer needed |
| `app/login/page.tsx` | Custom login page — Cognito Hosted UI replaces it |

### Dependencies to Remove

| Package | Reason |
|---------|--------|
| `next-auth` | No longer used |
| `@auth/core` (if present) | NextAuth dependency |

### Files to Modify

| File | Change |
|------|--------|
| `app/layout.tsx` | Remove `SessionProvider` wrapper |
| `package.json` | Remove `next-auth` dependency |

### Files to Add (Optional)

| File | Purpose |
|------|---------|
| `lib/user.ts` | Helper to read `X-User-Email` / `X-User-Name` from request headers |

### Documentation Updates

| File | Change |
|------|--------|
| `lib/CLAUDE.md` | Remove `auth.ts` entry, add `user.ts` if created |
| `app/CLAUDE.md` | Remove login page, update auth description |
| `app/api/CLAUDE.md` | Remove `[...nextauth]` endpoint, note auth is at CDN edge |
| `infra/CLAUDE.md` | Add EdgeFunction, SSM, AwsCustomResource descriptions |

---

## Security

| Control | Description |
|---------|-------------|
| JWT Validation | Cognito JWKS public key verification via `aws-jwt-verify` (caches JWKS) |
| PKCE | Prevents authorization code interception (code_challenge + code_verifier) |
| HttpOnly Cookies | Tokens inaccessible to JavaScript (prevents XSS theft) |
| Secure Flag | Cookies only sent over HTTPS |
| SameSite=Lax | Prevents CSRF by blocking cross-origin POST requests with cookies |
| X-Custom-Secret | ALB-level defense remains (blocks direct ALB access) |
| Self-signup Disabled | Only admin-created Cognito users can authenticate |
| Edge Enforcement | Unauthenticated requests blocked before reaching ALB/ECS |

---

## New Files Structure

```
infra/
  lambda/
    edge-auth/
      index.ts          # Lambda@Edge handler (auth routing)
      auth.ts           # JWT validation, token exchange, PKCE
      config.ts         # SSM config loader with caching
      cookies.ts        # Cookie parsing and serialization
      types.ts          # TypeScript interfaces
  lib/
    cdn-stack.ts        # Modified: EdgeFunction + AwsCustomResources
    security-stack.ts   # Modified: EdgeAuthClient
  bin/
    app.ts              # Modified: pass Cognito props to CdnStack
```

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SSM cold-start latency | ~100ms on first request after Lambda cold start | Acceptable for internal dashboard; SSM is in same region (us-east-1) as Lambda@Edge |
| Cognito Hosted UI UX | Less customizable than custom login page | Cognito supports basic branding (logo, CSS); sufficient for internal tool |
| Lambda@Edge 5s timeout | Token exchange HTTP call must complete in time | Cognito token endpoint is fast (~200ms); well within limit |
| JWKS rotation | If Cognito rotates keys, cached JWKS becomes stale | `aws-jwt-verify` handles JWKS rotation automatically with background refresh |
| Cookie size | Multiple JWTs may approach CloudFront header limits | Cognito JWTs are typically 1-2KB each; within CloudFront 10KB cookie limit |
