---
description: Deploy Skill — Path A (image-only) / Path B (CDK) deploy with real resource names, traps, verification, rollback. The authority for procedure detail is docs/runbooks/production-deploy.md.
---

# Deploy Skill

## Trigger

Use when the user asks to:
- "배포", "배포해줘", "deploy", "deploy to AWS"
- `/deploy`
- As the final step of `/release` (version upgrade → deploy)

**Authority**: `docs/runbooks/production-deploy.md` holds the full trap list
(Traps 1–8). This skill is the executable fast path; when they disagree, the
runbook wins and this skill must be corrected.

## Real Resource Names (none guessable)

| Thing | Value |
|-------|-------|
| Account / region | `120443221648` / `ap-northeast-2` (CDK); Athena/Bedrock use `us-east-1` |
| ECS cluster | `kiro-dashboard-cluster` |
| ECS service | CDK-generated (`KiroDashboardEcs-Service…`) — **always look it up**, never hardcode |
| ALB | `kiro-dashboard-alb` (lowercase — `contains('Kiro')` matches nothing) |
| CloudFront | `EYIGNKS7E8VUM` → `d1n3t9phsfh9bp.cloudfront.net` |
| Custom domain | `kirodashboard.whchoi.net` |
| ECR | `120443221648.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard` |

**Region trap**: this box exports `AWS_REGION=us-east-1`. Pass
`--region ap-northeast-2` explicitly on EVERY aws CLI call; for CDK, export
`AWS_REGION`/`AWS_DEFAULT_REGION` to `ap-northeast-2` after sourcing
`.env.deploy` (runbook Trap 5 — the wrong-region error is indistinguishable
from a wrong `EXISTING_VPC_ID`).

## Step 0: Preflight (both paths)

```bash
cd /home/ec2-user/my-project/kiro-dashboard
npx jest          # the real gate (npm run lint is BROKEN — no ESLint config)
npm run build     # type check + prod build
```

Both must pass before any push. Never deploy a tree that differs from the
commit you claim to deploy — `git status` must be clean.

## Step 1: Choose Path A or B

Decide from `cdk diff`, **never** from the changed-file list. Two delta
kinds never on their own justify a CDK deploy:

1. `X-Custom-Secret` — regenerated per synth in `infra/lib/ecs-stack.ts`,
   so it differs on EVERY diff.
2. EdgeLambda `Code.S3Key` hash + new Version — appears whenever anything
   under `infra/lambda/edge-auth/` changed since the last deploy, including
   doc-only edits (the whole directory is the asset).

- No `infra/` changes since the last deploy → **Path A**, skip `cdk diff`.
- `infra/` touched → run `cdk diff` (with Path B env setup below). If
  Network + Security show "no differences" and the only Ecs/Cdn deltas are
  the two phantoms → **Path A**. Anything else → **Path B**.

## Path A: image-only (app code, docs, tests)

```bash
# Fargate task is pinned to ARM64. This box is aarch64 so a plain build is
# native-correct; from an x86_64 host use --platform linux/arm64 (buildx).
docker build -t kiro-dashboard .

ECR=120443221648.dkr.ecr.ap-northeast-2.amazonaws.com
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin "$ECR"

SHA=$(git rev-parse --short HEAD)
docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:latest"
docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:$SHA"
docker push "$ECR/kiro-dashboard:latest"
docker push "$ECR/kiro-dashboard:$SHA"
# On a version release, ALSO tag with the version (e.g. 1.12.0). `latest`
# alone leaves rollback without a named target — during the v1.8.0→v1.9.0
# hop, two distinct builds briefly claimed one version and only per-commit/
# per-version tags disambiguated them.

SERVICE=$(aws ecs list-services --cluster kiro-dashboard-cluster \
  --region ap-northeast-2 --query 'serviceArns[0]' --output text)
aws ecs update-service --cluster kiro-dashboard-cluster --service "$SERVICE" \
  --force-new-deployment --region ap-northeast-2
aws ecs wait services-stable --cluster kiro-dashboard-cluster \
  --services "$SERVICE" --region ap-northeast-2
```

## Path B: CDK (infra/ changes — IAM, env vars, stacks)

Push a fresh image first (Path A build/push steps) if app code changed too.

```bash
set -a; source .env.deploy; set +a        # Trap 1: EXISTING_VPC_ID mandatory
export AWS_REGION=ap-northeast-2 AWS_DEFAULT_REGION=ap-northeast-2  # Trap 5
cd infra && npx cdk diff                  # review; Network/Security MUST be "no differences"
npx cdk deploy --all                      # Trap 2: Ecs + Cdn in ONE command (one synth)
```

- Deploying `KiroDashboardEcs` alone bricks all traffic (secret mismatch → 403).
- Add `--require-approval never` only when the diff intentionally broadens IAM.
- EdgeLambda old-version `DELETE_FAILED` ("replicated function") is benign.
- Missing `CUSTOM_DOMAIN`/`CUSTOM_DOMAIN_CERT_ARN` in the env removes the
  alias and re-breaks the domain (`redirect_mismatch`) — both live in `.env.deploy`.

## Step 2: Verify (never skip)

```bash
# 1. Running task pulls the digest you pushed, and is HEALTHY
TASK=$(aws ecs list-tasks --cluster kiro-dashboard-cluster \
  --region ap-northeast-2 --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster kiro-dashboard-cluster --tasks "$TASK" \
  --region ap-northeast-2 \
  --query 'tasks[0].{health:healthStatus,image:containers[0].imageDigest}'

# 2. Health endpoint 200 via ALB (CloudFront always 302s pre-auth)
SECRET=$(aws cloudfront get-distribution-config --id EYIGNKS7E8VUM \
  --query "DistributionConfig.Origins.Items[0].CustomHeaders.Items[?HeaderName=='X-Custom-Secret'].HeaderValue | [0]" \
  --output text)
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Custom-Secret: $SECRET" \
  "http://kiro-dashboard-alb-1956720821.ap-northeast-2.elb.amazonaws.com/api/health"

# 3. Edge auth chain intact (302 to Cognito)
curl -s -o /dev/null -w '%{http_code}\n' https://d1n3t9phsfh9bp.cloudfront.net/

# 4. Feature assertion: curl the page/API the deploy shipped (via ALB +
#    secret header) and grep for a string only the new build renders.
```

Report the digest, health status, and feature assertion to the user. If any
check fails, do NOT report success — roll back or investigate.

## Rollback

```bash
# Image-only: repoint `latest` at the previous tag and force a new deployment.
# Self-contained — rollback usually happens in a fresh session.
ECR=120443221648.dkr.ecr.ap-northeast-2.amazonaws.com
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin "$ECR"
docker pull "$ECR/kiro-dashboard:<prev-tag>"   # per-version or per-sha tag
docker tag  "$ECR/kiro-dashboard:<prev-tag>" "$ECR/kiro-dashboard:latest"
docker push "$ECR/kiro-dashboard:latest"
SERVICE=$(aws ecs list-services --cluster kiro-dashboard-cluster \
  --region ap-northeast-2 --query 'serviceArns[0]' --output text)
aws ecs update-service --cluster kiro-dashboard-cluster --service "$SERVICE" \
  --force-new-deployment --region ap-northeast-2
```

CDK deploys: `git checkout <prev>` under `infra/` and redeploy `--all`
(the secret rotates again, consistently).

## Post-deploy

- Record the new digest + commit + ECR tags (they are the rollback anchor).
- If `/infra-cost` shows every row 'unknown' after an image-only deploy, the
  image likely outran an IAM change — CDK-deploy Ecs+Cdn, then redeploy the
  image (runbook Trap 8).
