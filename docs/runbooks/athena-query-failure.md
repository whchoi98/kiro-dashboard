# Runbook: Athena Query Failure

**Service**: kiro-dashboard
**Owner**: Platform Team
**Last Updated**: 2026-04-22
**Severity**: P2

---

## Symptoms

- Dashboard pages show empty data or "Error loading data" messages
- API routes return `500` with error body `{"error": "Query FAILED: ..."}`
- CloudWatch logs show `Query FAILED` or `Query CANCELLED` from `lib/athena.ts`

## Impact

Dashboard displays stale or no data. AI analysis via `/analyze` may also fail if it depends on Athena queries for context. Users can still access the application but see incomplete analytics.

## Prerequisites

- [ ] AWS CLI configured (account: 120443221648, region: us-east-1 for Athena)
- [ ] Access to Athena workgroup: `primary`
- [ ] Access to S3 bucket: `whchoi01-titan-q-log`

## Diagnosis

### Step 1: Check Recent Athena Query History

```bash
aws athena list-query-executions \
  --work-group primary \
  --region us-east-1 \
  --max-items 5 \
  --query 'QueryExecutionIds' --output text | \
tr '\t' '\n' | \
xargs -I{} aws athena get-query-execution \
  --query-execution-id {} \
  --region us-east-1 \
  --query 'QueryExecution.{id:QueryExecutionId,state:Status.State,reason:Status.StateChangeReason,query:Query}' \
  --output table
```

### Step 2: Check Glue Catalog Availability

```bash
aws glue get-table \
  --database-name titanlog \
  --name user_report \
  --region us-east-1 \
  --query 'Table.{name:Name,location:StorageDescriptor.Location,columns:StorageDescriptor.Columns[].Name}'
```

If this fails with `EntityNotFoundException`, the Glue table was deleted or renamed.

### Step 3: Check S3 Data Availability

```bash
# Check source data exists
aws s3 ls s3://whchoi01-titan-q-log/ --region us-east-1 | head -10

# Check Athena results bucket is writable
aws s3 ls s3://whchoi01-titan-q-log/athena-results/ --region us-east-1 | tail -5
```

### Step 4: Check ECS Task Role Permissions

```bash
# Get task role ARN from running task
TASK_ARN=$(aws ecs list-tasks \
  --cluster kiro-dashboard-cluster \
  --desired-status RUNNING \
  --region ap-northeast-2 \
  --query 'taskArns[0]' --output text)

aws ecs describe-tasks \
  --cluster kiro-dashboard-cluster \
  --tasks "$TASK_ARN" \
  --region ap-northeast-2 \
  --query 'tasks[0].taskDefinitionArn'
```

Verify the task role has Athena, S3, and Glue permissions (see `infra/CLAUDE.md` for expected policy).

## Resolution

### Option A: Transient Athena Throttling

Athena may throttle queries during high concurrency. Wait 2-3 minutes and retry:

```bash
# Test with a simple query
aws athena start-query-execution \
  --query-string "SELECT COUNT(*) FROM titanlog.user_report LIMIT 1" \
  --result-configuration OutputLocation=s3://whchoi01-titan-q-log/athena-results/ \
  --region us-east-1
```

### Option B: Glue Table Schema Change

If the Glue table schema changed (columns renamed/removed):

1. Compare current schema with expected schema in `docs/kiro-user-activity-report-schema.md`
2. Update API route SQL queries to match new column names
3. Update `types/dashboard.ts` interfaces if needed
4. Redeploy

### Option C: S3 Data Missing

If source data is missing or moved:

1. Check with the data team if the S3 path changed
2. Update `ATHENA_OUTPUT_BUCKET` env var in `infra/lib/ecs-stack.ts` if the results path changed
3. Redeploy with `npx cdk deploy KiroDashboardEcs`

### Option D: IAM Permission Issue

If the task role lacks required permissions after a CDK change:

```bash
cd infra
npx cdk deploy KiroDashboardEcs --require-approval broadening
```

## Verification

```bash
# Test API health
curl -s https://<cloudfront-domain>/api/health

# Test a data endpoint
curl -s "https://<cloudfront-domain>/api/metrics?period=7d"
# Expected: JSON array with metric data
```

## Post-Incident

- [ ] Document which query failed and why in a GitHub issue
- [ ] If a date format issue, verify correct table format (user_report: YYYY-MM-DD, by_user_analytic: MM-DD-YYYY)
- [ ] If a schema change, update `docs/kiro-user-activity-report-schema.md`
- [ ] Consider adding Athena query timeout or retry logic to `lib/athena.ts`
