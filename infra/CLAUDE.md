# infra/ — AWS CDK Infrastructure

## Role

AWS CDK TypeScript로 정의된 kiro-dashboard 인프라. 5개의 스택으로 구성됩니다.

## Stack Composition

| Stack Name | File | Region | Description |
|-----------|------|--------|-------------|
| `KiroDashboardNetwork` | `lib/network-stack.ts` | ap-northeast-2 | VPC, subnets, NAT gateway |
| `KiroDashboardSecurity` | `lib/security-stack.ts` | ap-northeast-2 | Security groups, Cognito user pool, EdgeAuthClient |
| `KiroDashboardEcs` | `lib/ecs-stack.ts` | ap-northeast-2 | ECR repo, ECS cluster, Fargate task, ALB |
| `KiroDashboardCdn` | `lib/cdn-stack.ts` | ap-northeast-2 | CloudFront + Lambda@Edge + SSM config + Cognito callback |
| `KiroDashboardEdgeLambda` | _(auto-generated)_ | us-east-1 | Lambda@Edge function (created by `cloudfront.experimental.EdgeFunction`) |

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
| `S3_REPORT_PREFIX` | `q-user-log/AWSLogs/120443221648/KiroLogs/user_report/us-east-1/` | S3 prefix for user_report CSV files (model-usage API) |

**To change env vars:** edit `infra/lib/ecs-stack.ts` and run `npx cdk deploy KiroDashboardEcs`.

## IAM Permissions (ECS Task Role)

The Fargate task role uses least-privilege inline policies:
- **AthenaQuery**: `athena:StartQueryExecution`, `GetQueryExecution`, `GetQueryResults`, `StopQueryExecution`, `GetWorkGroup` — scoped to account workgroups
- **S3DataAccess**: `s3:GetObject`, `ListBucket`, `GetBucketLocation`, `PutObject` — scoped to `whchoi01-titan-q-log` bucket and `athena-results/` prefix
- **GlueCatalog**: `glue:GetTable`, `GetTables`, `GetDatabase`, `GetPartitions` — scoped to `titanlog` database
- **IdentityStore**: `identitystore:ListUsers`, `DescribeUser` (inline)
- **Bedrock**: `bedrock:InvokeModel`, `InvokeModelWithResponseStream` (inline, scoped to foundation models)

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

## CDK Conventions

- All stacks accept `env` from `bin/app.ts` (account + region)
- Cross-stack resources pass through constructor props (VPC, security groups, ALB)
- Use `RemovalPolicy.DESTROY` for dev/non-production resources
- Log group retention: `ONE_MONTH`
