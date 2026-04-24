# Runbook: ECS Deployment Failure

**Service**: kiro-dashboard
**Owner**: Platform Team
**Last Updated**: 2026-04-22
**Severity**: P1

---

## Symptoms

- `aws ecs wait services-stable` times out after deployment
- ECS tasks show `STOPPED` status with error in events
- CloudFront returns 503 or health check failures
- ALB target group shows unhealthy targets

## Impact

Dashboard is fully or partially unavailable. Users see 503 errors or stale cached pages.

## Prerequisites

- [ ] AWS CLI configured (account: 120443221648, region: ap-northeast-2)
- [ ] Access to ECS cluster: `kiro-dashboard-cluster`
- [ ] Access to CloudWatch Logs: `/ecs/kiro-dashboard`

## Diagnosis

### Step 1: Check ECS Service Status

```bash
aws ecs describe-services \
  --cluster kiro-dashboard-cluster \
  --services kiro-dashboard-service \
  --region ap-northeast-2 \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount,events:events[0:5]}'
```

Look for: `runningCount < desiredCount`, or repeated "has started N tasks" / "has stopped N tasks" cycling.

### Step 2: Check Stopped Task Reason

```bash
aws ecs list-tasks \
  --cluster kiro-dashboard-cluster \
  --desired-status STOPPED \
  --region ap-northeast-2 \
  --query 'taskArns[0:3]' --output text | \
xargs -I{} aws ecs describe-tasks \
  --cluster kiro-dashboard-cluster \
  --tasks {} \
  --region ap-northeast-2 \
  --query 'tasks[].{reason:stoppedReason,exitCode:containers[0].exitCode,status:lastStatus}'
```

Common reasons:
- `Essential container in task exited` — app crash, check logs
- `CannotPullContainerError` — ECR image missing or wrong tag
- `ResourceNotFoundException` — task definition references deleted secret

### Step 3: Check Application Logs

```bash
aws logs tail /ecs/kiro-dashboard --since 30m --region ap-northeast-2
```

Look for: unhandled exceptions, missing environment variables, port binding failures.

### Step 4: Check ALB Target Health

```bash
TG_ARN=$(aws elbv2 describe-target-groups \
  --region ap-northeast-2 \
  --query 'TargetGroups[?starts_with(TargetGroupName, `EcsSt`)].TargetGroupArn' \
  --output text)

aws elbv2 describe-target-health \
  --target-group-arn "$TG_ARN" \
  --region ap-northeast-2
```

Look for: `unhealthy` status with reason `Target.FailedHealthChecks` or `Target.ResponseCodeMismatch`.

## Resolution

### Option A: Fix and Redeploy

If the issue is a code bug or missing env var:

1. Fix the issue in the codebase
2. Rebuild and push: `docker build -t kiro-dashboard . && docker push <ECR_REPO>:latest`
3. Force new deployment:
```bash
aws ecs update-service \
  --cluster kiro-dashboard-cluster \
  --service kiro-dashboard-service \
  --force-new-deployment \
  --region ap-northeast-2
```

### Option B: Rollback to Previous Task Definition

If the previous version was working:

```bash
# List recent task definition revisions
aws ecs list-task-definitions \
  --family-prefix kiro-dashboard \
  --sort DESC \
  --max-items 5 \
  --region ap-northeast-2

# Rollback to specific revision
aws ecs update-service \
  --cluster kiro-dashboard-cluster \
  --service kiro-dashboard-service \
  --task-definition kiro-dashboard:<previous-revision-number> \
  --region ap-northeast-2
```

### Option C: ECR Image Issue

If the image tag is missing or corrupt:

```bash
# Check available images
aws ecr describe-images \
  --repository-name kiro-dashboard \
  --region ap-northeast-2 \
  --query 'imageDetails | sort_by(@, &imagePushedAt) | [-3:].[imageTags[0], imagePushedAt]'
```

Retag a known good image as `latest` and force redeploy.

## Verification

```bash
# Wait for service stability
aws ecs wait services-stable \
  --cluster kiro-dashboard-cluster \
  --services kiro-dashboard-service \
  --region ap-northeast-2

# Health check
curl -s https://<cloudfront-domain>/api/health
# Expected: {"status":"ok"}
```

## Post-Incident

- [ ] Document root cause in a GitHub issue
- [ ] Update this runbook if steps were missing or incorrect
- [ ] Consider ADR if the failure reveals an architectural gap
