# Runbook: Authentication / Custom-Domain Login Failure

**Service**: kiro-dashboard
**Owner**: whchoi98
**Last Updated**: 2026-07-18
**Severity**: P1 (no one can log in)

---

## Symptoms

One of:

1. **"An error was encountered with the requested page."** — shown by the **Cognito Hosted UI** right after redirect to login. This is Cognito's `redirect_mismatch`: the domain the user came from is not in the app client's CallbackURLs.
2. **"Authentication failed"** (legacy) or the **"로그인에 실패했습니다" 401 page** (current) — returned by Lambda@Edge `/auth/callback`. Means the token exchange was rejected (Cognito `invalid_grant`/`invalid_request`). With the self-heal (ADR-0006) the 401 page appears only after **two** consecutive failures.
3. Login "works only after a reload" — the transient PKCE mismatch that the self-heal now auto-recovers; if users still report it, the deployed edge function may predate ADR-0006.

## Impact

All users on the affected domain are blocked from the dashboard until resolved. Symptom 1 blocks the whole domain; symptom 2 may be intermittent.

## Prerequisites

- [ ] AWS console access (account: 120443221648, region: ap-northeast-2; Lambda@Edge logs in us-east-1 / viewer region)
- [ ] AWS CLI configured
- [ ] Cognito user pool `ap-northeast-2_x8xs5lVeO`, app client `4frmnmi28o32mdart7pp29tk81`

## Diagnosis

### Step 1: Which symptom? Check the served domain vs Cognito CallbackURLs

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id ap-northeast-2_x8xs5lVeO \
  --client-id 4frmnmi28o32mdart7pp29tk81 \
  --region ap-northeast-2 \
  --query "UserPoolClient.{Callbacks:CallbackURLs,Logout:LogoutURLs,Secret:ClientSecret!=null,Flows:AllowedOAuthFlows}"
```

Every domain the CloudFront distribution serves (default `*.cloudfront.net` **and** any custom domain) must have `https://<domain>/auth/callback` in `CallbackURLs` and `https://<domain>` in `LogoutURLs`. `Secret` must be `false` (public PKCE client), `Flows` must include `code`. **If a served domain is missing → symptom 1 (redirect_mismatch).**

### Step 2: Read the actual token-endpoint error (symptom 2)

```bash
LG=$(aws logs describe-log-groups --region ap-northeast-2 \
  --log-group-name-prefix "/aws/lambda/us-east-1.KiroDashboardEdgeLambda" \
  --query "logGroups[0].logGroupName" --output text)
aws logs filter-log-events --region ap-northeast-2 --log-group-name "$LG" \
  --start-time $(( ($(date +%s) - 3600) * 1000 )) \
  --filter-pattern '"Token exchange failed"' --query "events[*].message" --output text
```

`invalid_grant`/`invalid_request` = code↔PKCE verifier mismatch (stale/reused code or clobbered verifier cookie) — self-heal (ADR-0006) recovers this automatically on retry. Persistent failure every attempt points elsewhere (e.g. app-client secret enabled, or `redirect_uri` mismatch between authorize and token).

### Step 3: Confirm the auth flow initiates

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://kirodashboard.whchoi.net/
# Expect: 302  https://kiro-dashboard-...amazoncognito.com/oauth2/authorize?...redirect_uri=<this domain>/auth/callback
```

## Resolution

### Option A: Re-whitelist the domain on the Cognito client (symptom 1, hotfix)

Fetch the full client config, add the domain to `CallbackURLs`/`LogoutURLs`, and update (preserving all other fields):

```bash
aws cognito-idp describe-user-pool-client --user-pool-id ap-northeast-2_x8xs5lVeO \
  --client-id 4frmnmi28o32mdart7pp29tk81 --region ap-northeast-2 --output json > client.json
# edit client.json: add https://<domain>/auth/callback to CallbackURLs and https://<domain> to LogoutURLs;
# drop ClientSecret/CreationDate/LastModifiedDate, then:
aws cognito-idp update-user-pool-client --region ap-northeast-2 --cli-input-json file://client.json
```

**Expected outcome**: login on the domain reaches the Cognito page and completes.

> ⚠ **This is a hotfix.** The durable fix is `CUSTOM_DOMAIN`/`CUSTOM_DOMAIN_CERT_ARN` in `.env.deploy` so `CdnStack` manages the whitelist. **Deploying `KiroDashboardCdn` without those vars set resets the whitelist to the cloudfront.net URL only** — re-breaking custom-domain login. Always keep them set (see `infra/CLAUDE.md`).

### Option B: Redeploy the edge function (symptom 2, if it predates the self-heal)

```bash
cd infra && set -a; source ../.env.deploy; set +a
npx cdk deploy KiroDashboardEcs KiroDashboardCdn --require-approval never
```

Must deploy Ecs+Cdn together (shared synth-time `X-Custom-Secret`). Edge replication takes several minutes; the old Lambda version's `DELETE_FAILED` ("replicated function") is benign.

## Verification

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://kirodashboard.whchoi.net/api/health   # 200
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://kirodashboard.whchoi.net/   # 302 -> cognito
```

Then complete a real browser login on the affected domain — no "Authentication failed" / redirect_mismatch page.

## Post-Incident

- [ ] Confirm `.env.deploy` has `CUSTOM_DOMAIN` + `CUSTOM_DOMAIN_CERT_ARN` so the whitelist survives the next deploy
- [ ] If token-exchange failures persist after self-heal, investigate verifier-cookie clobbering (gate auth-initiation to document navigations)
- [ ] Update this runbook if steps were wrong or incomplete
