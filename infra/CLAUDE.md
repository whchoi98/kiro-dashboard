# infra/ — AWS CDK Infrastructure

## Role

AWS CDK TypeScript로 정의된 kiro-dashboard 인프라. 6개의 스택으로 구성됩니다 (옵트-인 Catalog 스택 포함).

## Stack Composition

| Stack Name | File | Region | Description |
|-----------|------|--------|-------------|
| `KiroDashboardNetwork` | `lib/network-stack.ts` | ap-northeast-2 | VPC, subnets, NAT gateway |
| `KiroDashboardSecurity` | `lib/security-stack.ts` | ap-northeast-2 | Security groups, Cognito user pool, EdgeAuthClient |
| `KiroDashboardEcs` | `lib/ecs-stack.ts` | ap-northeast-2 | ECR repo, ECS cluster, Fargate task, ALB |
| `KiroDashboardCdn` | `lib/cdn-stack.ts` | ap-northeast-2 | CloudFront + Lambda@Edge + SSM config + Cognito callback |
| `KiroDashboardEdgeLambda` | _(auto-generated)_ | us-east-1 | Lambda@Edge function (created by `cloudfront.experimental.EdgeFunction`) |
| `KiroDashboardCatalog` | `lib/catalog-stack.ts` | us-east-1 (via `ATHENA_REGION`) | **Opt-in.** Glue database + `user_report` + legacy `by_user_analytic` tables over a fork-owned S3 bucket. Only instantiated when `ATHENA_DATA_BUCKET_NAME` is set — maintainer deploys keep their existing 5-stack topology. The `by_user_analytic` prefix is derived from `S3_REPORT_PREFIX` (swap the `user_report` segment) or set explicitly via `BY_USER_ANALYTIC_PREFIX`. |

## Deployment Order

CDK resolves dependencies automatically, but the logical order is:

```
NetworkStack → SecurityStack → EcsStack → CdnStack
```

Deploy all at once:
```bash
export CDK_DEFAULT_ACCOUNT=<aws-account-id>
export CDK_DEFAULT_REGION=ap-northeast-2
cd infra
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/us-east-1  # Required for Lambda@Edge (one-time)
npx cdk deploy --all
```

Before ANY CDK deploy read docs/runbooks/production-deploy.md Traps — EXISTING_VPC_ID and the shell AWS_REGION override both produce near-identical VPC-lookup failures.

## ECS Task Environment Variables

Defined in `lib/ecs-stack.ts` — `taskDefinition.addContainer(...)` environment block:

| Variable | Value | Description |
|----------|-------|-------------|
| `HOSTNAME` | `0.0.0.0` | Bind address for Next.js |
| `AWS_REGION` | `us-east-1` | Athena/Glue/Bedrock region |
| `ATHENA_DATABASE` | `titanlog` | Glue database name |
| `ATHENA_OUTPUT_BUCKET` | `s3://whchoi01-titan-q-log/athena-results/` | Athena result output |
| `GLUE_TABLE_NAME` | `user_report` | Primary Glue table |
| `IDENTITY_STORE_ID` | `d-90663be888` | IAM Identity Center store ID |
| `S3_REPORT_PREFIX` | `q-user-log/AWSLogs/<deploy-account>/KiroLogs/user_report/us-east-1/` | S3 prefix for user_report CSV files (model-usage API) — account-derived default, matches CatalogStack |
| `S3_DATA_BUCKET` | _(only when `ATHENA_DATA_BUCKET_NAME` is set)_ | UAR data bucket for `/api/model-usage` in two-bucket deployments |
| `NEXTAUTH_URL` | '' (empty) | Legacy NextAuth leftover — but load-bearing: app/(overview)/page.tsx uses it as the server-side fetch base, falling back to http://localhost:3000; keep it empty |
| `NEXTAUTH_SECRET` | (Secrets Manager NextAuthSecret) | Legacy NextAuth leftover, still created and injected by ecs-stack.ts; unused by app code |

All values above are the defaults — overridable per deploy via the env vars
documented in `.env.deploy.example` (read by `bin/app.ts`), except `HOSTNAME`
and `AWS_REGION`, which are hardcoded literals in `infra/lib/ecs-stack.ts`
(changing the runtime region requires editing `EcsStack`; `ATHENA_REGION`
only relocates the Catalog stack). When
only `ATHENA_DATA_BUCKET_NAME` is set, the Athena results bucket defaults to
that same bucket rather than the maintainer's.

**To change env vars:** edit `infra/lib/ecs-stack.ts` (or export the
`.env.deploy` overrides) and run `npx cdk deploy KiroDashboardEcs`.

## IAM Permissions (ECS Task Role)

The Fargate task role uses least-privilege inline policies:
- **AthenaQuery**: `athena:StartQueryExecution`, `GetQueryExecution`, `GetQueryResults`, `StopQueryExecution`, `GetWorkGroup` — scoped to account workgroups
- **S3DataAccess**: `s3:GetObject`, `ListBucket`, `GetBucketLocation`, `PutObject` — scoped to `whchoi01-titan-q-log` bucket and `athena-results/` prefix — NOTE: the PutObject grant also persists lib/first-seen.ts's idc-first-seen.json ledger under athena-results/; any future lifecycle/expiry rule on that prefix must exclude this key or all new-registrant stamps are silently wiped
- **GlueCatalog**: `glue:GetTable`, `GetTables`, `GetDatabase`, `GetPartitions` — scoped to `titanlog` database
- **IdentityStore**: `identitystore:ListUsers`, `DescribeUser` (inline)
- **Bedrock**: `bedrock:InvokeModel`, `InvokeModelWithResponseStream` (inline, scoped to foundation models)

## Custom Domain (CNAME)

Set both in `.env.deploy` (see `.env.deploy.example`):

```
CUSTOM_DOMAIN=kirodashboard.whchoi.net
CUSTOM_DOMAIN_CERT_ARN=arn:aws:acm:us-east-1:<account>:certificate/<id>   # must be us-east-1
```

CdnStack then (a) adds the alternate domain name + ACM cert to the distribution and
(b) whitelists `https://<domain>/auth/callback` on the Cognito app client. Both are
required because the edge function derives `redirect_uri` from the request **Host
header** — a served domain missing from the Cognito CallbackURLs fails with Cognito's
"An error was encountered with the requested page" (`redirect_mismatch`).

**IMPORTANT:** once a custom domain is live, `CUSTOM_DOMAIN`/`CUSTOM_DOMAIN_CERT_ARN`
must stay set on every subsequent deploy — deploying without them removes the alias
and resets the Cognito whitelist back to only the cloudfront.net URL.

## Lambda@Edge Authentication

- `infra/lambda/edge-auth/` contains the Lambda@Edge function (TypeScript, esbuild-bundled)
- Handles Cognito PKCE auth flow at CloudFront Viewer Request level
- Config loaded from SSM Parameter Store (`/kiro-dashboard/edge-auth/config` in us-east-1)
- JWT validation via `aws-jwt-verify`, tokens stored as HttpOnly cookies
- Injects `X-User-Email` / `X-User-Name` headers for the downstream Next.js app
- CdnStack uses `AwsCustomResource` to write SSM config and update Cognito callback URLs post-deploy

## Security Architecture

- ALB is NOT directly public-accessible — requires `X-Custom-Secret` HTTP header
- CloudFront injects the secret header; direct ALB access returns 403
- The secret is generated via `crypto.randomUUID()` at CDK synth time (non-deterministic)
- CdnStack receives `customSecret` via cross-stack reference from EcsStack
- Lambda@Edge authenticates all requests before they reach the origin (except `/api/health`)

## Health Check

ECS container health check: `GET http://localhost:3000/api/health` → expect HTTP 200
ALB target group health check: `GET /api/health` every 30s

## Service Autoscaling

- Service autoscaling: min 1 / max 4 tasks, target-tracking on 70% CPU (ecs-stack.ts autoScaleTaskCount) — this is why in-process caches are per-task and a scale-out pays cold-cache latency (see lib/CLAUDE.md "Result caching")

## CDK Conventions

- All stacks accept `env` from `bin/app.ts` (account + region)
- Cross-stack resources pass through constructor props (VPC, security groups, ALB)
- Use `RemovalPolicy.DESTROY` for dev/non-production resources
- Log group retention: `ONE_MONTH`
