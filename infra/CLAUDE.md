# infra/ — AWS CDK Infrastructure

## Role

AWS CDK TypeScript로 정의된 kiro-dashboard 인프라. 4개의 독립 스택으로 구성됩니다.

## Stack Composition

| Stack Name | File | Description |
|-----------|------|-------------|
| `KiroDashboardNetwork` | `lib/network-stack.ts` | VPC, subnets, NAT gateway |
| `KiroDashboardSecurity` | `lib/security-stack.ts` | Security groups, Cognito user pool |
| `KiroDashboardEcs` | `lib/ecs-stack.ts` | ECR repo, ECS cluster, Fargate task, ALB |
| `KiroDashboardCdn` | `lib/cdn-stack.ts` | CloudFront distribution, custom header secret |

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
| `NEXTAUTH_URL` | _(set per deployment)_ | NextAuth base URL |
| `NEXTAUTH_SECRET` | _(set securely)_ | NextAuth signing secret |

**To change env vars:** edit `infra/lib/ecs-stack.ts` and run `npx cdk deploy KiroDashboardEcs`.

## IAM Permissions (ECS Task Role)

The Fargate task role grants:
- `AmazonAthenaFullAccess`
- `AmazonS3FullAccess`
- `AWSGlueConsoleFullAccess`
- `identitystore:ListUsers`, `identitystore:DescribeUser` (inline)
- `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream` (inline)

## Security Architecture

- ALB is NOT directly public-accessible — requires `X-Custom-Secret` HTTP header
- CloudFront injects the secret header; direct ALB access returns 403
- The secret is auto-generated as `${stackName}-secret-${account}` in EcsStack
- CdnStack receives `customSecret` via cross-stack reference from EcsStack

## Health Check

ECS container health check: `GET http://localhost:3000/api/health` → expect HTTP 200
ALB target group health check: `GET /api/health` every 30s

## CDK Conventions

- All stacks accept `env` from `bin/app.ts` (account + region)
- Cross-stack resources pass through constructor props (VPC, security groups, ALB)
- Use `RemovalPolicy.DESTROY` for dev/non-production resources
- Log group retention: `ONE_MONTH`
