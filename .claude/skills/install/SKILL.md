---
description: Install Skill — set up kiro-dashboard from scratch: Track A local development, Track B fresh-AWS-account production install (CDK creates Cognito/ECR/VPC/Glue; what must pre-exist; first-deploy order; verification).
---

# Install Skill

## Trigger

Use when the user asks to:
- "설치", "설치해줘", "install", "set up the project"
- `/install`, "처음부터 구축", "신규 계정에 배포"
- Onboarding a new developer or standing up a fork in a new AWS account

Pick the track first: **A** = run the app locally for development.
**B** = stand up the full production stack in an AWS account.
Upgrading an existing deployment is NOT this skill — use `release`/`deploy`.

---

## Track A: Local development

```bash
git clone https://github.com/whchoi98/kiro-dashboard.git
cd kiro-dashboard
bash scripts/setup.sh   # checks node 18+/npm/docker/aws, installs app+infra
                        # deps, copies .env.example → .env.local, tsc check
# edit .env.local — the values that matter for live data:
#   ATHENA_DATABASE / ATHENA_OUTPUT_BUCKET / GLUE_TABLE_NAME
#   IDENTITY_STORE_ID / S3_REPORT_PREFIX (see .env.example comments)
npm run dev             # http://localhost:3000
```

Notes:
- Local pages that read AWS (Athena, S3, IdentityStore, Bedrock) need
  credentials in the ambient chain (SSO/instance role). **They use YOUR
  IAM identity, not the ECS task role** — `/infra-cost` in particular may
  show 'unknown' rows locally if your identity lacks the read permissions
  the task role has. That is not a bug.
- There is no local Cognito — auth only exists behind CloudFront
  (Lambda@Edge). Local dev serves pages unauthenticated.
- Gate before committing anything: `npx jest && npm run build`
  (`npm run lint` is BROKEN — no ESLint config).

---

## Track B: Fresh AWS account production install

### What must pre-exist (CDK will NOT create these)

| Prerequisite | Why |
|--------------|-----|
| Kiro enterprise **User Activity Report delivery** to an S3 bucket you own | The data source. Configure in the Kiro admin console; CSVs land daily at 02:00 UTC. See https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/ |
| **Athena results bucket** (may be the same bucket) | `ATHENA_RESULTS_BUCKET_NAME`; must exist before first query |
| **IAM Identity Center** enabled, its `IDENTITY_STORE_ID` (`d-…`) | User directory for name/email resolution |
| AWS credentials with admin-ish rights, Docker, node 18+, `aws` CLI, CDK | Build + deploy tooling |
| (optional) ACM certificate **in us-east-1** + DNS control | Only if using `CUSTOM_DOMAIN` |

### What CDK creates for you (do NOT pre-create)

VPC (new `10.254.0.0/16` by default — or set `EXISTING_VPC_ID` to reuse
one), Cognito User Pool + Hosted UI (self-signup disabled), ECR repo
`kiro-dashboard`, ECS cluster/service/task role, ALB, CloudFront +
Lambda@Edge auth, the edge-auth SSM parameter (us-east-1), and — when
`ATHENA_DATA_BUCKET_NAME` is set — the `KiroDashboardCatalog` stack, which
registers the `titanlog.user_report` Glue table (no manual Glue crawler
needed). With Kiro's standard delivery layout it also registers
`by_user_analytic`; a fully custom `S3_REPORT_PREFIX` without a
`user_report` segment needs `BY_USER_ANALYTIC_PREFIX` set explicitly, else
that table is skipped (synth-time warning, `/productivity` stays empty).

### Steps

```bash
# 1. Clone + install
git clone https://github.com/whchoi98/kiro-dashboard.git
cd kiro-dashboard
npm install && (cd infra && npm install)

# 2. Deploy-time env — every account value lives here (git-ignored)
cp .env.deploy.example .env.deploy
# edit: CDK_DEFAULT_ACCOUNT, ATHENA_DATA_BUCKET_NAME, S3_REPORT_PREFIX,
#       ATHENA_RESULTS_BUCKET_NAME, IDENTITY_STORE_ID
#       (+ CUSTOM_DOMAIN/CUSTOM_DOMAIN_CERT_ARN together, if used)

# 3. Load env and pin regions (shell AWS_REGION silently overrides CDK)
set -a; source .env.deploy; set +a
export AWS_REGION=$CDK_DEFAULT_REGION AWS_DEFAULT_REGION=$CDK_DEFAULT_REGION

# 4. Bootstrap BOTH regions — us-east-1 is required for Lambda@Edge
cd infra
npx cdk bootstrap
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/us-east-1

# 5. Deploy everything (5-6 stacks; Ecs+Cdn must always ship together)
npx cdk deploy --all
cd ..

# 6. First image — the repo exists only after step 5.
#    The Fargate task is pinned to ARM64 (ecs-stack.ts runtimePlatform):
#    on an x86_64 host you MUST cross-build or the task dies with an
#    exec-format error (needs docker buildx + QEMU binfmt).
docker build --platform linux/arm64 -t kiro-dashboard .
ECR=$CDK_DEFAULT_ACCOUNT.dkr.ecr.$CDK_DEFAULT_REGION.amazonaws.com
aws ecr get-login-password --region $CDK_DEFAULT_REGION \
  | docker login --username AWS --password-stdin "$ECR"
docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:latest"
docker push "$ECR/kiro-dashboard:latest"

# 7. Start the service on the pushed image
SERVICE=$(aws ecs list-services --cluster kiro-dashboard-cluster \
  --region $CDK_DEFAULT_REGION --query 'serviceArns[0]' --output text)
aws ecs update-service --cluster kiro-dashboard-cluster --service "$SERVICE" \
  --force-new-deployment --region $CDK_DEFAULT_REGION
aws ecs wait services-stable --cluster kiro-dashboard-cluster \
  --services "$SERVICE" --region $CDK_DEFAULT_REGION

# 8. Create the first login user (self-signup is disabled by design).
#    Pool id comes from the SecurityStack output (pool name is
#    'kiro-dashboard-users').
POOL=$(aws cloudformation describe-stacks --stack-name KiroDashboardSecurity \
  --region $CDK_DEFAULT_REGION \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue | [0]" \
  --output text)
aws cognito-idp admin-create-user --user-pool-id "$POOL" \
  --username admin@example.com --user-attributes \
  Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --region $CDK_DEFAULT_REGION
```

### First-install traps

- **The deploy region is effectively pinned to `ap-northeast-2`.**
  `infra/lib/cdn-stack.ts` hardcodes `cognitoRegion = 'ap-northeast-2'`
  when building the Hosted UI domain for the edge auth config — deploying
  the stacks to any other region leaves login pointing at a Cognito domain
  that does not exist. Change that constant too if you truly need another
  region.
- **If step 5 hangs on `KiroDashboardEcs`** waiting for service
  stabilization: the service has no image yet. Run steps 6 (build/push)
  from a second shell — the deployment then converges. Don't cancel.
- **The empty dashboard is normal on day one.** Data appears after Kiro's
  next 02:00 UTC report delivery into your bucket; there is no on-demand
  generation. `/ingest-health` shows what has arrived.
- **`EXISTING_VPC_ID` is for existing environments.** A fresh account
  omits it (new VPC is created). An environment ALREADY deployed against
  an imported VPC must keep setting it forever — omitting it replaces the
  network layer (full outage). NetworkStack warns at synth time.
- **Custom domain**: both `CUSTOM_DOMAIN` and `CUSTOM_DOMAIN_CERT_ARN`
  (us-east-1 cert) or neither; point a DNS CNAME at the `CloudFrontURL`
  output. An unlisted domain fails Cognito redirect.
- **EdgeLambda old-version `DELETE_FAILED`** on later deploys is benign
  (replicated-function GC lag).

### Verify

```bash
# Stack outputs — note CloudFrontURL
aws cloudformation describe-stacks --stack-name KiroDashboardCdn \
  --region $CDK_DEFAULT_REGION --query 'Stacks[0].Outputs' --output table

# Unauthenticated request 302s to the Cognito Hosted UI.
# The CloudFrontURL output already includes https:// — use it verbatim.
curl -s -o /dev/null -w '%{http_code}\n' <CloudFrontURL-output-value>/

# Task healthy on your pushed digest
aws ecs describe-tasks --cluster kiro-dashboard-cluster --region $CDK_DEFAULT_REGION \
  --tasks $(aws ecs list-tasks --cluster kiro-dashboard-cluster \
    --region $CDK_DEFAULT_REGION --query 'taskArns[0]' --output text) \
  --query 'tasks[0].{health:healthStatus,image:containers[0].imageDigest}'
```

Then log in via the browser with the step-8 user (temporary password from
the invite email) and check `/ingest-health` for report arrival.

### After install

Day-2 operations live elsewhere: `deploy` skill (ship changes),
`release` skill (version upgrades), `docs/runbooks/` (failure modes).
