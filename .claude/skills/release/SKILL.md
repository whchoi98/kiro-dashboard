# Release Skill

## Trigger

Use when the user asks to:
- "deploy to AWS", "AWS에 배포해줘"
- "build and push", "빌드하고 푸시"
- "release", "릴리스"
- `/release`, `/deploy`

## Release Workflow

### Prerequisites

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Set CDK environment
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=ap-northeast-2
```

### Step 1: Build

```bash
cd /home/ec2-user/my-project/kiro-dashboard
npm run build
```

Verify: build completes without TypeScript errors.

### Step 2: Docker Build

```bash
docker build -t kiro-dashboard .
```

Verify: image builds successfully. Check image size.

### Step 3: ECR Push

```bash
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR_REGION=ap-northeast-2
ECR_REPO="$AWS_ACCOUNT.dkr.ecr.$ECR_REGION.amazonaws.com/kiro-dashboard"

# Login to ECR
aws ecr get-login-password --region $ECR_REGION \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT.dkr.ecr.$ECR_REGION.amazonaws.com"

# Tag and push
docker tag kiro-dashboard:latest "$ECR_REPO:latest"
docker push "$ECR_REPO:latest"
```

### Step 4: CDK Deploy

```bash
cd infra
npx cdk deploy --all --require-approval never
```

Or deploy only the ECS stack if only app code changed:
```bash
npx cdk deploy KiroDashboardEcs --require-approval never
```

### Step 5: ECS Service Update (Force New Deployment)

If CDK deploy doesn't trigger a new task (e.g., only image changed):
```bash
aws ecs update-service \
  --cluster kiro-dashboard-cluster \
  --service kiro-dashboard-service \
  --force-new-deployment \
  --region ap-northeast-2
```

### Step 6: Verify Deployment

```bash
# Check ECS service stability
aws ecs wait services-stable \
  --cluster kiro-dashboard-cluster \
  --services kiro-dashboard-service \
  --region ap-northeast-2

# Health check via ALB or CloudFront
curl -s https://<cloudfront-domain>/api/health
```

## Rollback

If the new deployment is unhealthy:
```bash
# Force previous task version by updating service with older image
aws ecs update-service \
  --cluster kiro-dashboard-cluster \
  --service kiro-dashboard-service \
  --task-definition kiro-dashboard:<previous-revision> \
  --region ap-northeast-2
```

## Notes

- Only the `KiroDashboardEcs` stack needs redeploy for app code changes
- CDK infra changes (network, security, CDN) require full `--all` deploy
- NEXTAUTH_SECRET must be set to a secure value in ecs-stack.ts before production deploy
