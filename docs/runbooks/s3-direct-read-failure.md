# Runbook: S3-Direct Read Failure (model-usage / adoption)

**Service**: kiro-dashboard
**Owner**: whchoi98
**Last Updated**: 2026-07-18
**Severity**: P3

---

## Symptoms

- `/model-usage` or `/adoption` renders empty (no chart data, empty tables) while Athena-backed pages (`/users`, `/trends`, `/credits`) work normally.
- `/api/model-usage` or `/api/adoption` returns `{"error":"Failed to fetch model usage data"}` (500) or a well-shaped empty payload despite data existing in S3.
- Response times over ~30 s on these two endpoints only.

These endpoints do NOT use Athena/Glue — they list and read UAR CSVs directly from S3 via `lib/uar-s3.ts` (see ADR-0004). `docs/runbooks/athena-query-failure.md` does not apply.

## Impact

Model Usage and New Users/Adoption menus show no data. All other dashboard pages are unaffected.

## Prerequisites

- [ ] AWS console access (account: 120443221648)
- [ ] AWS CLI configured
- [ ] ECS cluster access: `kiro-dashboard-cluster` (ap-northeast-2); UAR bucket is in us-east-1

## Diagnosis

### Step 1: Check the container env that drives bucket/prefix resolution

```bash
TASK=$(aws ecs list-tasks --cluster kiro-dashboard-cluster \
  --region ap-northeast-2 --query 'taskArns[0]' --output text)
aws ecs describe-task-definition \
  --task-definition $(aws ecs describe-tasks --cluster kiro-dashboard-cluster \
    --tasks "$TASK" --region ap-northeast-2 \
    --query 'tasks[0].taskDefinitionArn' --output text) \
  --region ap-northeast-2 \
  --query 'taskDefinition.containerDefinitions[0].environment[?name==`S3_REPORT_PREFIX`||name==`S3_DATA_BUCKET`||name==`ATHENA_OUTPUT_BUCKET`||name==`AWS_REGION`]'
```

The bucket is `S3_DATA_BUCKET` if set, otherwise the bucket inside `ATHENA_OUTPUT_BUCKET`. An empty `S3_REPORT_PREFIX` makes both endpoints return empty payloads by design (check app logs for `bucket or prefix not configured`).

### Step 2: Verify objects exist under the expected prefix

```bash
# Substitute bucket/prefix from Step 1; keys are <prefix>YYYY/MM/DD/*.csv
aws s3api list-objects-v2 --bucket whchoi01-titan-q-log \
  --prefix "q-user-log/AWSLogs/120443221648/KiroLogs/user_report/us-east-1/$(date +%Y/%m)/" \
  --region us-east-1 --query 'KeyCount'
```

`KeyCount: 0` for the current month means the UAR delivery stopped or the prefix is wrong (a prefix missing the `KiroLogs/` segment silently yields an empty dashboard).

### Step 3: Check application logs for S3 errors

```bash
aws logs tail /ecs/kiro-dashboard --since 30m --region ap-northeast-2 \
  | grep -E "model-usage|adoption"
```

`AccessDenied` → task role lost `s3:GetObject`/`s3:ListBucket` on the data bucket (policy documented in `infra/CLAUDE.md`). Timeouts → cross-region latency; see Step 4.

### Step 4: Confirm latency class

```bash
time curl -s -o /dev/null "https://<cloudfront-domain>/api/model-usage?days=90"
```

1-4 s is normal (month-prefix parallel listing). ~20 s indicates a regression to per-day sequential listing — check that `lib/uar-s3.ts` `listReportFiles` is intact (`tests/api/model-usage-listing.test.ts` pins the contract).

## Resolution

### Option A: Fix env misconfiguration

Correct `S3_REPORT_PREFIX`/`S3_DATA_BUCKET` in `.env.deploy`, then redeploy the ECS stack (`cd infra && npx cdk deploy KiroDashboardEcs`). The correct maintainer prefix includes the `KiroLogs/` segment.

### Option B: Restore task-role S3 permissions

Re-deploy `KiroDashboardEcs` (the stack owns the task-role policy) or re-attach the S3 read statements listed in `infra/CLAUDE.md`.

## Verification

```bash
curl -s "https://<cloudfront-domain>/api/model-usage?days=7" | head -c 200
curl -s "https://<cloudfront-domain>/api/adoption?days=7" | head -c 200
# Expected: JSON with non-empty distribution / trend fields within a few seconds
```

## Post-Incident

- [ ] Create GitHub issue / ticket with root cause
- [ ] Update this runbook if steps were wrong or incomplete
- [ ] Consider ADR if an architectural change is needed
