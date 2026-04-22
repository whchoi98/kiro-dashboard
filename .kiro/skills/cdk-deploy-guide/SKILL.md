---
name: cdk-deploy-guide
description: Guide for deploying and managing the Kiro Dashboard CDK infrastructure. Use when deploying stacks, modifying infrastructure, or troubleshooting ECS/CloudFront issues.
---

# CDK Deploy Guide

## Stack Architecture

```
NetworkStack → SecurityStack → EcsStack → CdnStack
```

| Stack | Resources |
|-------|-----------|
| KiroDashboardNetwork | VPC (2 AZ, 1 NAT GW), SSM VPC endpoints |
| KiroDashboardSecurity | ALB SG (CloudFront prefix list), ECS SG, Cognito UserPool |
| KiroDashboardEcs | Fargate service (ARM64), ALB, ECR, Auto Scaling 1-4 |
| KiroDashboardCdn | CloudFront → ALB with X-Custom-Secret header |

## Deploy Commands

```bash
cd infra
npx cdk synth          # Synthesize all stacks
npx cdk diff           # Preview changes
npx cdk deploy --all   # Deploy all stacks
npx cdk deploy KiroDashboardEcs  # Deploy single stack
```

## Docker Build & Push

```bash
# Build for ARM64
docker build --platform linux/arm64 -t kiro-dashboard .

# Tag and push to ECR
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-northeast-2.amazonaws.com
docker tag kiro-dashboard:latest <ecr-uri>:latest
docker push <ecr-uri>:latest

# Force new ECS deployment
aws ecs update-service --cluster kiro-dashboard-cluster --service <service-name> --force-new-deployment --region ap-northeast-2
```

## Key Environment Variables (ECS)

| Variable | Value |
|----------|-------|
| AWS_REGION | us-east-1 |
| ATHENA_DATABASE | titanlog |
| ATHENA_OUTPUT_BUCKET | s3://whchoi01-titan-q-log/athena-results/ |
| GLUE_TABLE_NAME | user_report |
| IDENTITY_STORE_ID | d-90663be888 |
| HOSTNAME | 0.0.0.0 |

## Troubleshooting

- **Health check failing**: Check `/api/health` endpoint, verify HOSTNAME=0.0.0.0
- **CloudFront 403**: Verify X-Custom-Secret header matches between CdnStack and EcsStack
- **Athena query errors**: Check Task Role has Athena/S3/Glue permissions and correct region
