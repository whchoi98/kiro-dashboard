# app/api/ — API Routes

## Role

Next.js App Router API route handlers. All routes connect to Athena via `lib/athena.ts` and resolve the Glue table via `lib/glue.ts`.

## All 11 Endpoints

| Endpoint | File | Description |
|----------|------|-------------|
| `GET /api/health` | `health/route.ts` | ECS health check — returns `{ status: "ok" }` |
| `GET /api/metrics` | `metrics/route.ts` | Overview metrics: total users, messages, conversations, credits |
| `GET /api/users` | `users/route.ts` | User list with activity rankings (masked) |
| `GET /api/trends` | `trends/route.ts` | Daily/weekly usage trend time series |
| `GET /api/credits` | `credits/route.ts` | Credit consumption breakdown per user/period (masked) |
| `GET /api/engagement` | `engagement/route.ts` | Engagement metrics: retention, active days, session depth |
| `GET /api/productivity` | `productivity/route.ts` | Productivity metrics: code accepted, inline suggestions (masked) |
| `GET /api/analyze` | `analyze/route.ts` | Bedrock AI streaming analysis (SSE / ReadableStream) |
| `GET /api/idc-users` | `idc-users/route.ts` | IAM Identity Center user list via IdentityStore SDK (masked) |
| `GET /api/user-detail` | `user-detail/route.ts` | Single-user detail from `by_user_analytic` table (masked) |
| `GET /api/client-dist` | `client-dist/route.ts` | Client distribution breakdown (IDE version, OS, etc.) |

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

    const sql = `
      SELECT ... FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
    `;

    const rows = await executeQuery(sql);         // from lib/athena.ts
    return NextResponse.json(transformedData);
  } catch (error) {
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
- The `analyze` endpoint uses `BedrockRuntimeClient` with response streaming (ReadableStream)
- The `idc-users` endpoint uses `IdentityStoreClient` from `lib/identity.ts` — no Athena
- User-facing routes (users, credits, productivity, user-detail, idc-users) return masked identifiers via `lib/mask.ts`
- Authentication is handled by Lambda@Edge at the CDN layer — no auth middleware in API routes

## Adding a New Endpoint

1. Create `app/api/<name>/route.ts`
2. Export an async `GET` (or `POST`) handler
3. Update this file's endpoint table above
4. Add corresponding TypeScript interface to `types/dashboard.ts`
5. Add i18n labels if the endpoint feeds a UI page
