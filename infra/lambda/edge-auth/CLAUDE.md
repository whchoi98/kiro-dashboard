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
2. `/api/health` passes through without auth
3. `/auth/callback` exchanges authorization code for tokens (PKCE)
4. `/auth/logout` clears cookies, redirects to Cognito logout endpoint
5. All other paths: validate `id_token` cookie via JWKS → if valid, inject `X-User-Email`/`X-User-Name` headers → forward to origin
6. If token invalid, attempt refresh via `refresh_token` cookie
7. If refresh fails, redirect to Cognito Hosted UI authorize endpoint with PKCE challenge

## Constraints

- **No environment variables** — Lambda@Edge does not support env vars; config loaded from SSM
- **1MB bundle limit** (Viewer Request) — `@aws-sdk/*` marked as external (available in Node.js 20.x runtime), only `aws-jwt-verify` (~50KB) is bundled
- **us-east-1 only** — Lambda@Edge functions must be in us-east-1; CDK handles cross-region deployment
- **`require('https')` in auth.ts** — inline require avoids esbuild bundling Node.js built-in

## Dependencies

- `aws-jwt-verify` — Cognito JWT/JWKS validation with automatic key caching
- `@aws-sdk/client-ssm` — SSM GetParameter (runtime-provided, not bundled)
