# lib/ — Shared AWS Service Clients

## Role

AWS SDK v3 클라이언트 및 공유 유틸리티. API 라우트에서 직접 임포트하여 사용합니다.

## Files

| File | Role |
|------|------|
| `athena.ts` | Athena query executor + helper constants |
| `glue.ts` | Glue table name resolver |
| `identity.ts` | IAM Identity Center user listing (with data masking) |
| `mask.ts` | Data masking utilities for user identifiers |
| `i18n.tsx` | Korean/English i18n context provider |

---

## athena.ts

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `executeQuery(sql)` | `async (string) => Record<string, string>[]` | Runs an Athena query and returns all rows as key-value records |
| `NORMALIZE_USERID` | `string` | SQL snippet: `REGEXP_REPLACE(userid, '^d-[a-z0-9]+\.', '')` |
| `safeFloat(val)` | `(string) => number` | Parse float, return 0 on NaN |
| `safeInt(val)` | `(string) => number` | Parse int, return 0 on NaN |

**Environment Variables Used:**
- `AWS_REGION` — Athena client region (default: `us-east-1`)
- `ATHENA_DATABASE` — Glue database name (default: `titanlog`)
- `ATHENA_OUTPUT_BUCKET` — S3 path for query results

**Polling:** `executeQuery` polls every 500ms until `SUCCEEDED`, `FAILED`, or `CANCELLED`. Handles pagination via `NextToken`.

---

## glue.ts

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `resolveTableName()` | `async () => string` | Returns the active Glue table name from env or Glue API |

**Environment Variables Used:**
- `GLUE_TABLE_NAME` — Primary table name (default: `user_report`)
- `AWS_REGION`

---

## identity.ts

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `resolveUserDetails(userIds)` | `async (string[]) => Map<string, UserDetail>` | Resolves user IDs to masked display details |
| `resolveUsernames(userIds)` | `async (string[]) => Map<string, string>` | Resolves user IDs to masked usernames (cached 1h) |

All returned values (displayName, email, username, organization) are automatically masked via `lib/mask.ts`.

**Environment Variables Used:**
- `IDENTITY_STORE_ID` — IAM Identity Center store ID (e.g., `d-90663be888`)
- `AWS_REGION`

Uses `IdentityStoreClient` from `@aws-sdk/client-identitystore`.

---

## mask.ts

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `maskText(text)` | `(string) => string` | Shows first 2 chars, replaces rest with `*` |
| `maskEmail(email)` | `(string) => string` | Masks both local part and domain after first 2 chars |

Examples: `maskText("John")` → `"Jo**"`, `maskEmail("admin@whchoi.net")` → `"ad***@wh*******"`

---

## i18n.tsx

React context for Korean/English language switching.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `I18nProvider` | Component | Wraps the app with language context |
| `useI18n()` | Hook | Returns `{ locale, setLocale, t }` |

**Usage:**
```tsx
const { t, locale } = useI18n();
// t('key') returns Korean or English string based on current locale
```

**Adding Translations:**
Edit the `translations` object in `lib/i18n.tsx` to add new keys under both `ko` and `en`.

---

## Conventions

- All SDK clients are instantiated at module level (not per-request) for connection reuse
- Region defaults to `process.env.AWS_REGION ?? 'us-east-1'`
- ECS task role provides IAM permissions — no explicit credentials needed in code
- Never hardcode AWS credentials or secrets in lib files
