---
description: Full deployment — build → Docker → ECR push → ECS update
---

Run the full deployment pipeline for kiro-dashboard to AWS.

```bash
cd /home/ec2-user/my-project/kiro-dashboard

echo "=== Step 1: Verify AWS credentials ==="
aws sts get-caller-identity

echo ""
echo "=== Step 2: Next.js build ==="
npm run build

echo ""
echo "=== Step 3: Docker build ==="
docker build -t kiro-dashboard .

echo ""
echo "=== Step 4: ECR push ==="
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR_REGION=ap-northeast-2
ECR_REPO="$AWS_ACCOUNT.dkr.ecr.$ECR_REGION.amazonaws.com/kiro-dashboard"

aws ecr get-login-password --region $ECR_REGION \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT.dkr.ecr.$ECR_REGION.amazonaws.com"

docker tag kiro-dashboard:latest "$ECR_REPO:latest"
docker push "$ECR_REPO:latest"

echo ""
echo "=== Step 5: CDK deploy ==="
export CDK_DEFAULT_ACCOUNT=$AWS_ACCOUNT
export CDK_DEFAULT_REGION=$ECR_REGION
cd infra && npx cdk deploy KiroDashboardEcs --require-approval never

echo ""
echo "=== Step 6: Wait for ECS stability ==="
aws ecs wait services-stable \
  --cluster kiro-dashboard-cluster \
  --services kiro-dashboard-service \
  --region $ECR_REGION

echo ""
echo "=== Deployment complete ==="
```

After each step, verify success before proceeding. If any step fails, stop and report the error with context.

If only app code changed (no CDK infra changes), use `KiroDashboardEcs` deploy only.
If CDK infra changed, use `--all` flag instead.
