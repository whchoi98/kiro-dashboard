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
| `version.ts` | Exports `APP_VERSION` from `package.json` (shown in Sidebar footer; sync enforced by `tests/structure/version-sync.test.ts`) |
| `uar-s3.ts` | Shared UAR S3 helpers — bucket/prefix resolution, month-prefix parallel `listReportObjects(days)` (size + `lastModified`) with the `listReportFiles(days)` key-only wrapper, `readCsvFromS3`, `parseCsv`, the metadata helpers `parseCsvHeaders`, `countCsvRows`, `reportDateFromKey`, `clientTypeFromKey`, plus the model-column helpers `isModelColumn`, `prettifyModelName`, `normalizeUserId`; used by `/api/model-usage`, `/api/user-model-usage`, `/api/adoption`, and `/api/ingest-health` |
| `useChatStream.ts` | Client chat hook against `/api/analyze` SSE agent — 12-turn history cap, AbortController race guard, optimistic assistant message; shared by /analyze page and FloatingChat |
| `changelog-md.ts` | Markdown subset parser for CHANGELOG.md (`parseChangelog`, `splitLocales`) — version sections, category headings, paragraphs, bullet lists, fenced code, pipe tables. Extracted from `ChangelogClient.tsx` because Jest only collects `*.test.ts`, so `.tsx` logic is untestable (same rationale as `chat-scroll.ts`). Blocks are one ordered array, NOT separate paras/items arrays — that split silently reordered interleaved content |
| `chat-scroll.ts` | Stick-to-bottom helper for streaming chat (`isNearBottom`, `PIN_THRESHOLD_PX`) — auto-follow only while the user is pinned to the bottom; used by `ChatPanel` |
| `theme.tsx` | `ThemeProvider` + `useTheme()` — dark/light via `light` class on `<html>` (palette override in globals.css), persisted as `localStorage['kiro-theme']`, default dark |
| `chart-theme.ts` | `useChartTheme()` — tick/tooltip colors for Recharts props (CSS variables can't reach SVG attrs/inline styles); DARK values match the original chart hexes |
| `export-report.ts` | Client exporters for AI answers — Markdown blob download (title/date/question labels follow a `locale` param, default `'ko'`); PDF via `html2canvas-pro` (NOT `html2canvas` — Tailwind v4 oklab/oklch colors) + `jspdf` DOM capture, dynamic imports |
| `analyze-prompt.ts` | Bedrock system prompt for `/api/analyze` — `buildSystemPrompt(locale)`, `resolveLocale`, `AnalyzeLocale`. Lives here, not in the route, because Next.js rejects non-handler exports from a `route.ts`. The language rule is appended LAST (recency) so an English answer survives Korean tool results; `locale` indexes a literal record and is never interpolated (prompt-injection guard) |
| `release-notes.ts` | **SERVER-ONLY.** Picks one CHANGELOG.md section for the sidebar version badge dialog — `releaseSections(locale)` (memoized per locale), `currentReleaseNotes`, `findReleaseSection`, `isReleaseSection`. Imports `../CHANGELOG.md` as a webpack `asset/source` string (see `next.config.js`); must never call `readFileSync` — `output: 'standalone'` ships no markdown. Excludes `[Unreleased]`, which otherwise parses as the newest release. Importing this from a client component would inline ~50KB of both language trees into every page bundle |
| `model-colors.ts` | `modelColor(name)` — stable series color per AI model name via djb2 hash over a 10-color palette (Kiro purple first); `Auto` is fixed to a muted gray as a router pseudo-model. Name-derived, NOT index-derived: the model set is dynamic, so an index palette would recolor every series when the ranking changed. Theme-invariant (inline styles don't participate in the light-mode palette override) |

---

## athena.ts

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `executeQuery(sql)` | `async (string) => Record<string, string>[]` | Runs an Athena query and returns all rows as key-value records |
| `NORMALIZE_USERID` | `string` | SQL snippet: `REGEXP_REPLACE(userid, '^d-[a-z0-9]+\.', '')` |
| `safeFloat(val)` | `(string) => number` | Parse float, return 0 on NaN |
| `safeInt(val)` | `(string) => number` | Parse int, return 0 on NaN |
| `isMissingTableError(err)` | `(unknown) => boolean` | True when an error means the Glue table/database doesn't exist yet (Athena `TABLE_NOT_FOUND`/`COLUMN_NOT_FOUND`, "does not exist", Glue `EntityNotFoundException`) — API routes use it to return 200 + empty payload instead of a 500 on fresh accounts |

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

## uar-s3.ts — model column helpers

| Export | Type | Description |
|--------|------|-------------|
| `isModelColumn(col)` | `(string) => boolean` | `col.endsWith('_messages') && col !== 'total_messages'` |
| `prettifyModelName(col)` | `(string) => string` | `claude_sonnet_4_5_messages` → `Claude Sonnet 4.5` |
| `normalizeUserId(userid)` | `(string) => string` | Strips the IAM Identity Center `d-xxxx.` prefix (the JS twin of `NORMALIZE_USERID`) |

**`total_messages` also ends in `_messages`.** Never test the suffix without the
exclusion — including it double-counts every row and outweighs every real model.
These helpers were duplicated in `/api/model-usage` and would have drifted once
`/api/user-model-usage` copied them, so both routes import from here and
`tests/api/user-model-usage.test.ts` fails on a local `function isModelColumn`.

---

## Conventions

- All SDK clients are instantiated at module level (not per-request) for connection reuse
- Region defaults to `process.env.AWS_REGION ?? 'us-east-1'`
- ECS task role provides IAM permissions — no explicit credentials needed in code
- Never hardcode AWS credentials or secrets in lib files
