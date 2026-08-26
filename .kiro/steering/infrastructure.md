# Infrastructure Rules

- CDK lives in `infra/` with its own `package.json` — never mix it with app dependencies
- Stack graph: `KiroDashboardNetwork` → `KiroDashboardSecurity` → `KiroDashboardEcs` → `KiroDashboardCdn`, plus the opt-in `KiroDashboardCatalog` (created only when `ATHENA_DATA_BUCKET_NAME` is set)
- Pass cross-stack values through props, never `Fn.importValue`
- Regions: `ap-northeast-2` for CDK/serving, `us-east-1` for Athena/S3/Identity Store/Bedrock. This box exports `AWS_REGION=us-east-1`, so pass `--region ap-northeast-2` on every `aws` call and pin `AWS_REGION`/`AWS_DEFAULT_REGION` after sourcing `.env.deploy`
- ECS Fargate: ARM64, 512 CPU / 1024 MB, auto-scale 1–4 at 70% CPU. Always set `HOSTNAME=0.0.0.0` for Next.js standalone
- Docker: multi-stage `node:20-alpine`, `output: 'standalone'`. `CHANGELOG.md` is a required build-context input — keep the `!CHANGELOG.md` re-include *after* the `*.md` exclusion in `.dockerignore`
- `X-Custom-Secret` is regenerated on every synth, so `KiroDashboardEcs` and `KiroDashboardCdn` must be deployed in a **single** command; deploying Ecs alone returns 403 for all traffic
- Redeploying an existing environment requires `EXISTING_VPC_ID`; without it CDK synthesizes a new VPC and forces ALB/ECS/CloudFront replacement
- New ECS env vars must be added to `infra/lib/ecs-stack.ts` **and** `.env.example` / `.env.deploy.example`
- Keep the task role least-privilege; `/infra-cost` relies on the read-only `InfraReadOnly` policy
- Deploy procedure, verification, and rollback: `/cdk-deploy-guide` skill, with `docs/runbooks/production-deploy.md` as the authority
