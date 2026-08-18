# Runbook: Production Deploy

**Service**: kiro-dashboard
**Owner**: whchoi98
**Last Updated**: 2026-07-18
**Severity**: P2 (a bad deploy takes the dashboard down)

---

## Symptoms

Not an incident runbook — this is the standard procedure for shipping a new version, plus the traps that cause outages when skipped.

## Impact

A deploy executed without `EXISTING_VPC_ID` (Trap 1) replaces the entire network layer: every security group, target group, and subnet attachment is re-created and the service goes down.

## Prerequisites

- [ ] AWS CLI configured for account 120443221648
- [ ] Docker running
- [ ] `.env.deploy` present (copy from `.env.deploy.example`; git-ignored)
- [ ] Tests green: `npx jest` (there is no committed ESLint config — `next lint` hangs on an interactive prompt; rely on `npm run build` for type checks)

## Procedure

### Path A: App-code-only change (no `infra/` diff) — fast path

Skips CDK entirely, so the CloudFront/ALB secret does not rotate.

```bash
cd /home/ec2-user/my-project/kiro-dashboard
npx jest && npm run build
docker build -t kiro-dashboard .

ECR=120443221648.dkr.ecr.ap-northeast-2.amazonaws.com
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin "$ECR"
docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:latest"
docker push "$ECR/kiro-dashboard:latest"

# Service name is CDK-generated — always look it up
SERVICE=$(aws ecs list-services --cluster kiro-dashboard-cluster \
  --region ap-northeast-2 --query 'serviceArns[0]' --output text)
aws ecs update-service --cluster kiro-dashboard-cluster --service "$SERVICE" \
  --force-new-deployment --region ap-northeast-2
aws ecs wait services-stable --cluster kiro-dashboard-cluster \
  --services "$SERVICE" --region ap-northeast-2
```

### Path B: Infra change (`infra/` diff) — CDK deploy

```bash
cd /home/ec2-user/my-project/kiro-dashboard
set -a; source .env.deploy; set +a   # Trap 1: MUST export EXISTING_VPC_ID
export AWS_REGION=ap-northeast-2 AWS_DEFAULT_REGION=ap-northeast-2  # Trap 5
cd infra && npx cdk diff             # review before deploying — see Traps
npx cdk deploy --all                 # Trap 2: Ecs + Cdn in ONE command
```

Push a fresh image first (Path A steps 1-3) if app code changed too.

### Choosing the path

Do not decide from the changed-file list — run `cdk diff` and read it:

- Network + Security "no differences", and the **only** Ecs/Cdn delta is the
  `X-Custom-Secret` value → Path A. The secret is regenerated every synth
  (Trap 2), so it always differs and never on its own justifies a CDK deploy.
- Anything else → Path B.

Verified on the v1.5.0 → v1.6.0 upgrade (2026-07-29): app-only, Path A.

## Traps

1. **`EXISTING_VPC_ID` is mandatory on this account.** The stacks were created against imported VPC `vpc-005338aca7ac5fb96`. Without the env var, `NetworkStack` synthesizes a brand-new VPC (10.254.0.0/16) and `cdk diff` shows SG/target-group/subnet **replace** across Security and Ecs — deploying that is a full outage. `.env.deploy` pins it; verify with `cdk diff` showing no Network/Security changes before `deploy --all`.

2. **`X-Custom-Secret` rotates every synth** (`crypto.randomUUID()` in `infra/lib/ecs-stack.ts`). The ALB listener rule (Ecs stack) and the CloudFront origin header (Cdn stack) must carry the SAME value, so any CDK deploy that touches one must deploy both **in one `cdk deploy` invocation** (one synth). Deploying `KiroDashboardEcs` alone bricks all traffic with 403s until Cdn is deployed with the same secret.

3. **EdgeLambda `DELETE_FAILED` is benign.** Deploying `KiroDashboardEdgeLambda` publishes a new Lambda@Edge version; CloudFormation then fails to delete the old version ("replicated function") up to three times and finishes with "Update successful. One or more resources could not be deleted." AWS garbage-collects edge replicas hours later. Do not roll back for this.

4. **`--require-approval never` is unnecessary** when the diff has no IAM/SG broadening — plain `cdk deploy --all` proceeds non-interactively and fails fast if approval would be required, which is the safer default.

5. **`AWS_REGION` in your shell silently overrides `.env.deploy`.** The CDK CLI derives `CDK_DEFAULT_REGION` from the resolved credential chain *before* running `bin/app.ts`, so sourcing `.env.deploy` is not enough — an exported `AWS_REGION=us-east-1` (as on the VSCode server host) sends the VPC context lookup to the wrong region and `cdk diff` fails with:

   ```
   [Error at /KiroDashboardNetwork] Could not find any VPCs matching
   {"account":"120443221648","region":"us-east-1","filter":{"vpc-id":"vpc-005338aca7ac5fb96"}}
   ```

   The VPC exists — just in `ap-northeast-2`. Export `AWS_REGION` and `AWS_DEFAULT_REGION` to match `CDK_DEFAULT_REGION` before any `cdk` command. Symptom looks identical to a missing/wrong `EXISTING_VPC_ID`, so check the region in the error message first.

6. **`.dockerignore` filters the build context, so it can starve a build-time read.** `/changelog` is `force-static` and reads `CHANGELOG.md` from disk during `npm run build`; the blanket `*.md` in `.dockerignore` kept that file out of the *builder* stage, and the page shipped empty across releases without a single error (fixed in 1.6.1 with `!CHANGELOG.md` plus an unguarded read). When adding any build-time file read, confirm the file survives the context: `docker build --progress=plain -f - . <<< $'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN ls -la <file>'`. `tests/structure/changelog-build-input.test.ts` guards this specific case.

7. **athena-results/ now holds a PERSISTENT object.** s3://<results-bucket>/athena-results/idc-first-seen.json is the new-registrant first-seen ledger (lib/first-seen.ts), not query scratch. Any lifecycle/expiry rule on the prefix must exclude it — deletion silently wipes all first-seen stamps (failure direction is safe: badges vanish, none appear falsely; re-seed from IdentityStore + registration times if needed).

## Verification

```bash
# New task runs the pushed image digest
TASK=$(aws ecs list-tasks --cluster kiro-dashboard-cluster \
  --region ap-northeast-2 --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster kiro-dashboard-cluster --tasks "$TASK" \
  --region ap-northeast-2 --query 'tasks[0].containers[0].imageDigest'

# Edge auth chain intact (302 to Cognito Hosted UI)
curl -s -o /dev/null -w "%{http_code}\n" https://d1n3t9phsfh9bp.cloudfront.net/

# After a CDK deploy: CloudFront and ALB carry the SAME secret
# (compare CloudFront origin custom header vs ALB listener rule condition)
```

## Rollback

Image-only deploys: push the previous image tag/digest and `--force-new-deployment` again. CDK deploys: `git checkout <prev>` in `infra/` and redeploy `--all` (the secret rotates again, consistently).

## Post-Incident

- [ ] Update this runbook if steps were wrong or incomplete
- [ ] Record deploy in CHANGELOG.md `[Unreleased]` when it ships user-visible change
