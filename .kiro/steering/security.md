# Security Rules

- Never hardcode secrets, API keys, or credentials — the `preToolUse` secret-scan hook blocks the obvious shapes (AKIA keys, private keys, JWTs, literal password/token assignments) and must not be worked around
- Sensitive configuration comes from environment variables only (`ATHENA_OUTPUT_BUCKET`, `IDENTITY_STORE_ID`, `S3_DATA_BUCKET`, …); ECS values are set in `infra/lib/ecs-stack.ts` and mirrored into `.env.example` / `.env.deploy.example`
- Authentication is **edge-only**: CloudFront + Lambda@Edge with Cognito PKCE. There is no NextAuth and no `lib/auth.ts` — do not add app-level session code without discussing the design first
- Mask every user identifier server-side with `lib/mask.ts` (names, emails, organizations → first 2 characters). `User_Email` from the report is deliberately unused; identity comes from IAM Identity Center via `lib/identity.ts`
- Validate `userid` format with a regex before it reaches SQL, and never interpolate raw request input into a query string
- Do not expose AWS account IDs, Identity Store IDs, or S3 bucket names in client-side code
- `X-Custom-Secret` (CloudFront → ALB origin control) must never be logged or returned in a response
- ECS task role stays least-privilege — no `*FullAccess` managed policies; `/infra-cost` uses the read-only `InfraReadOnly` policy
- The prompt-logging bucket (`s3://whchoi01-titan-q-prompt/`) holds plaintext prompts and code context and is **not** masked. Any feature reading it needs route-level access control designed first
- IAM Identity Center `ListUsers` is a workforce directory, never a licensed-seat roster — do not label it as one
