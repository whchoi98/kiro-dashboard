# Security Rules

- Never hardcode secrets, API keys, or credentials in source code
- Use environment variables for all sensitive configuration (NEXTAUTH_SECRET, COGNITO_CLIENT_SECRET, etc.)
- Do not expose AWS account IDs, Identity Store IDs, or S3 bucket names in client-side code
- Validate `userid` parameter format with regex before using in SQL queries (prevent injection)
- ECS Task Role should follow least-privilege — avoid FullAccess managed policies
- CloudFront → ALB uses X-Custom-Secret header for origin access control — do not expose this value
