# app/api/ — API Routes

## Role

Next.js App Router API route handlers. All routes connect to Athena via `lib/athena.ts` and resolve the Glue table via `lib/glue.ts`.

## All 19 Endpoints

| Endpoint | File | Description |
|----------|------|-------------|
| `GET /api/health` | `health/route.ts` | ECS health check — returns `{ status: "ok" }` |
| `GET /api/metrics` | `metrics/route.ts` | Overview metrics: total users, messages, conversations, credits |
| `GET /api/users` | `users/route.ts` | User list with activity rankings (masked) |
| `GET /api/trends` | `trends/route.ts` | Daily/weekly usage trend time series |
| `GET /api/credits` | `credits/route.ts` | Credit consumption breakdown per user/period (masked) |
| `GET /api/engagement` | `engagement/route.ts` | Engagement metrics: retention, active days, session depth |
| `GET /api/productivity` | `productivity/route.ts` | Productivity metrics: code accepted, inline suggestions, guarded acceptance rates, credits-per-accepted-line KPI (masked) |
| `GET /api/analyze` | `analyze/route.ts` | Bedrock AI streaming analysis (SSE / ReadableStream) |
| `GET /api/idc-users` | `idc-users/route.ts` | IAM Identity Center user list via IdentityStore SDK + dormancy grading and directory→activity funnel (masked) |
| `GET /api/user-detail` | `user-detail/route.ts` | Single-user credit/message detail from `user_report` (via `resolveTableName()`, masked) |
| `GET /api/model-usage` | `model-usage/route.ts` | AI model message distribution — reads S3 CSV directly via `lib/uar-s3.ts` (masked) |
| `GET /api/user-model-usage` | `user-model-usage/route.ts` | Per-user model mix for the user detail panel — S3-direct like `model-usage`; `force-dynamic`; validates `userid` against `/^[a-f0-9-]{36}$/` (400 otherwise, before any S3 call) |
| `GET /api/release-notes` | `release-notes/route.ts` | One CHANGELOG.md section for the sidebar version badge dialog — no AWS calls; markdown is webpack-inlined at build time via `lib/release-notes.ts` |
| `GET /api/client-dist` | `client-dist/route.ts` | Client distribution breakdown (IDE version, OS, etc.) |
| `GET /api/subscription` | `subscription/route.ts` | Subscription tier mix + overage governance (tier trend, watchlist; masked) |
| `GET /api/adoption` | `adoption/route.ts` | New-user inflow & activation — reads S3 CSV directly via `lib/uar-s3.ts` (header-name based `new_user` parsing; masked) |
| `GET /api/dev-activity` | `dev-activity/route.ts` | Legacy deep metrics: TestGen/DocGen/Transform/InlineChat/CodeFix from `by_user_analytic` (masked) |
| `GET /api/rollout` | `rollout/route.ts` | Client rollout: per-`Client_Type` daily/cumulative adoption, IDE/CLI overlap segments, per-user pickup lag, tier × client matrix (masked) |
| `GET /api/ingest-health` | `ingest-health/route.ts` | Report delivery & freshness: S3 file inventory, date × client delivery matrix, header drift, Athena↔CSV row parity, legacy column instrumentation |

## Common Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | 90 | Lookback window in days |
| `userId` | string | — | Filter by specific user (normalized, no IdC prefix) |
| `startDate` | string | — | ISO date range start (YYYY-MM-DD) |
| `endDate` | string | — | ISO date range end (YYYY-MM-DD) |

## Route Pattern

```typescript
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));

    const tableName = await resolveTableName();  // from lib/glue.ts

    // Resolve the window HERE, not in Athena. Result reuse matches on the query
    // string, so an engine-resolved window is permanently unreusable.
    const isoFloor = isoDateLiteral(days, Date.now());  // from lib/athena-window.ts

    const sql = `
      SELECT ... FROM "${tableName}"
      WHERE date >= ${isoFloor}
    `;

    const rows = await executeQuery(sql);         // from lib/athena.ts
    return NextResponse.json(transformedData);
  } catch (error) {
    if (isMissingTableError(error)) {             // from lib/athena.ts
      // Fresh account whose Glue catalog isn't provisioned yet — degrade to
      // an empty-but-well-shaped payload so the page renders an empty table.
      return NextResponse.json(emptyPayload);
    }
    console.error('[api/endpoint]', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
```

## Key Conventions

- SQL columns are **always lowercase**
- UserId normalization uses `NORMALIZE_USERID` from `lib/athena.ts`:
  ```sql
  REGEXP_REPLACE(userid, '^d-[a-z0-9]+\.', '')
  ```
- `user_report` table uses `YYYY-MM-DD` date format
- `by_user_analytic` table uses `MM-DD-YYYY` date format — cast accordingly
- **No route may resolve its own date window.** Import from `@/lib/athena-window`:
  `isoDateLiteral` for `user_report` (`'YYYY-MM-DD'`, a quoted string, because that
  column is string-compared) and `buaDateLiteral` for `by_user_analytic` (`DATE
  'YYYY-MM-DD'`, because `DATE_PARSE(date, '%m-%d-%Y')` yields a timestamp and
  comparing it to a quoted string is a type error). `CURRENT_DATE`/`DATE_ADD` in a
  route silently disables Athena result reuse for that route, so
  `tests/api/date-literal-audit.test.ts` bans both phrases across every
  `app/api/**/route.ts` (`/api/analyze` exempt — the model writes that SQL at
  runtime). When one handler builds two adjacent windows, read the clock **once**
  and derive both floors from it, as `metrics/route.ts` does; two reads can straddle
  00:00 UTC and leave a one-day hole between the periods
- The `analyze` endpoint uses `BedrockRuntimeClient` with response streaming (ReadableStream). Its system prompt lives in `lib/analyze-prompt.ts`, **not** in the route — Next.js type-checks `route.ts` against a fixed export list, so exporting a helper from it fails the build with `not assignable to type 'never'`. The answer language comes from the request body's `locale` (LLM output language is not `t()`); the locale only ever indexes a literal `LANGUAGE_RULE` record, never interpolates into prompt text
- Routes whose response depends on a query param must **not** be `force-static`: Next.js prerenders them once with an EMPTY `searchParams`, silently baking the default branch into the response. `/api/release-notes` shipped Korean notes for every locale this way; it is `force-dynamic` and pinned by `tests/lib/release-notes.test.ts`
- The `idc-users` endpoint uses `IdentityStoreClient` from `lib/identity.ts` — no Athena
- The `model-usage` and `adoption` endpoints read S3 CSV files directly via `lib/uar-s3.ts` — dynamic model columns and the late-appended `new_user`/`user_email` columns cannot be queried safely through Glue/Athena due to OpenCSVSerDe positional mapping (header-name CSV parsing sidesteps this). The bucket is `S3_DATA_BUCKET` when set (two-bucket deployments), falling back to the bucket in `ATHENA_OUTPUT_BUCKET`. Listing is month-prefix parallel (perf: one call per day cost ~20s cross-region)
- The `dev-activity` endpoint queries `by_user_analytic` (unqualified, MM-DD-YYYY dates) like `productivity`
- The `productivity` endpoint queries `by_user_analytic` unqualified — `executeQuery` supplies the database from `ATHENA_DATABASE`, so never prefix table names with a database in SQL. Its credits-per-line KPI additionally reads `user_report` via `resolveTableName()` in a **separately guarded** helper, so a missing `user_report` nulls only that card
- Derived rates over `by_user_analytic` columns are typed `number | null` and gated on `MIN_RATE_DENOMINATOR` — 39 of the 44 legacy metric columns are the literal `'0'` in every row, so returning `0` would assert a measurement nobody made. `null` renders as "not instrumented"
- The `ingest-health` endpoint reads S3 objects via `lib/uar-s3.ts` **and** queries both Athena tables, each in its own try/catch. Its delivery matrix has only `delivered: true|false` — Kiro publishes no expected-file count, so a missing file is not a failure signal
- User-facing routes (users, credits, productivity, user-detail, idc-users) return masked identifiers via `lib/mask.ts`
- Authentication is handled by Lambda@Edge at the CDN layer — no auth middleware in API routes

## Adding a New Endpoint

1. Create `app/api/<name>/route.ts`
2. Export an async `GET` (or `POST`) handler
3. Update this file's endpoint table above
4. Add corresponding TypeScript interface to `types/dashboard.ts`
5. Add i18n labels if the endpoint feeds a UI page
