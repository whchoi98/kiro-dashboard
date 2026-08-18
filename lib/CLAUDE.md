# lib/ — Shared AWS Service Clients

## Role

AWS SDK v3 클라이언트 및 공유 유틸리티. API 라우트에서 직접 임포트하여 사용합니다.

## Files

| File | Role |
|------|------|
| `athena.ts` | Athena query executor + helper constants; `executeQuery` is memoized via `query-cache.ts` |
| `query-cache.ts` | `TtlMemo` — in-process TTL memo with single-flight coalescing behind `executeQuery`; bounds retention by BOTH `maxEntries` and a `maxWeight`/`weigh` total (an `admit` per-entry cap alone multiplies with the entry cap). Plus the pure helpers `utcDayStamp`, `queryCacheKey`, `readIntEnv`, `detachIfArray`. Lives here (not in a `route.ts`) because Next rejects non-handler route exports and Jest only collects `*.test.ts` |
| `glue.ts` | Glue table name resolver |
| `identity.ts` | IAM Identity Center user listing (with data masking) |
| `mask.ts` | Data masking utilities for user identifiers |
| `i18n.tsx` | Korean/English i18n context provider |
| `freshness.ts` | Pure helpers for the report-freshness banner — `latestReportDate` (max valid `YYYY-MM-DD`), `nextReportEtaMs` (next 02:00 UTC strictly after now), `REPORT_HOUR_UTC`, `formatInstantKst` (display-only UTC→KST, fixed +9 — used by /ingest-health timestamps); consumed by `app/components/ui/FreshnessBanner.tsx` and `app/ingest-health/page.tsx` |
| `first-seen.ts` | S3 first-seen ledger for the IdC new-registrant badge — pure `applyLedger` (self-seeds all-null on first run so nobody is falsely badged) + `withinNewRegistrantWindow` (7-day window, `NEW_REGISTRANT_DAYS`), and `loadLedger`/`saveLedger` IO against `<ATHENA_OUTPUT_BUCKET>/idc-first-seen.json` (the only task-role-writable prefix); consumed by `/api/idc-users`. NOTE: any future S3 lifecycle/expiry rule on the athena-results prefix must exclude idc-first-seen.json or all first-seen stamps are silently wiped (failure direction is safe — badges vanish). |
| `table-sort.ts` | Type-aware table comparator — `compareByKey<T>(key, kind: 'string'|'number', dir)`; missing values (null/undefined/''/NaN) always sort last regardless of direction; consumed by the IdC user table's column sorting |
| `idc-users.ts` | The full IdC directory assembly extracted from `/api/idc-users` (IdentityStore walk + Athena activity stats + first-seen ledger + dormancy/funnel + masking) — `getIdcUsersPayload(days)`; shared by the route (thin wrapper) and the analyze chatbot's `list_idc_users` tool. Its SQL is covered by tests/api/date-literal-audit.test.ts |
| `version.ts` | Exports `APP_VERSION` from `package.json` (shown in Sidebar footer; sync enforced by `tests/structure/version-sync.test.ts`) |
| `uar-s3.ts` | Shared UAR S3 helpers — bucket/prefix resolution, month-prefix parallel `listReportObjects(days)` (size + `lastModified`) with the `listReportFiles(days)` key-only wrapper, `readCsvFromS3`, `parseCsv`, the metadata helpers `parseCsvHeaders`, `countCsvRows`, `reportDateFromKey`, `clientTypeFromKey`, plus the model-column helpers `isModelColumn`, `prettifyModelName`, `normalizeUserId`; used by `/api/model-usage`, `/api/user-model-usage`, `/api/adoption`, and `/api/ingest-health` |
| `useChatStream.ts` | Client chat hook against `/api/analyze` SSE agent — 12-turn history cap, AbortController race guard, optimistic assistant message; shared by /analyze page and FloatingChat |
| `changelog-md.ts` | Markdown subset parser for CHANGELOG.md (`parseChangelog`, `splitLocales`) — version sections, category headings, paragraphs, bullet lists, fenced code, pipe tables. Extracted from `ChangelogClient.tsx` because Jest only collects `*.test.ts`, so `.tsx` logic is untestable (same rationale as `chat-scroll.ts`). Blocks are one ordered array, NOT separate paras/items arrays — that split silently reordered interleaved content |
| `chat-scroll.ts` | Stick-to-bottom helper for streaming chat (`isNearBottom`, `PIN_THRESHOLD_PX`) — auto-follow only while the user is pinned to the bottom; used by `ChatPanel` |
| `theme.tsx` | `ThemeProvider` + `useTheme()` — dark/light via `light` class on `<html>` (palette override in globals.css), persisted as `localStorage['kiro-theme']`, default dark |
| `chart-theme.ts` | `useChartTheme()` — tick/tooltip colors for Recharts props (CSS variables can't reach SVG attrs/inline styles); DARK values match the original chart hexes |
| `export-report.ts` | Client exporters for AI answers — Markdown blob download (title/date/question labels follow a `locale` param, default `'ko'`); PDF via `html2canvas-pro` (NOT `html2canvas` — Tailwind v4 oklab/oklch colors) + `jspdf` DOM capture, dynamic imports |
| `analyze-prompt.ts` | Bedrock system prompt for `/api/analyze` — `buildSystemPrompt(locale)`, `resolveLocale`, `AnalyzeLocale`. Documents the three tools: `query_athena` (Athena SQL), `lookup_users` (user resolution), and `list_idc_users` (directory + dormancy + new-registrant flag). Explains masking policy: names/emails/orgs are masked (e.g., 'Jo********', 'ad***@wh*******'), userId (UUID) is stable. Lives here, not in the route, because Next.js rejects non-handler exports from a `route.ts`. The language rule is appended LAST (recency) so an English answer survives Korean tool results; `locale` indexes a literal record and is never interpolated (prompt-injection guard) |
| `release-notes.ts` | **SERVER-ONLY.** Picks one CHANGELOG.md section for the sidebar version badge dialog — `releaseSections(locale)` (memoized per locale), `currentReleaseNotes`, `findReleaseSection`, `isReleaseSection`. Imports `../CHANGELOG.md` as a webpack `asset/source` string (see `next.config.js`); must never call `readFileSync` — `output: 'standalone'` ships no markdown. Excludes `[Unreleased]`, which otherwise parses as the newest release. Importing this from a client component would inline ~50KB of both language trees into every page bundle |
| `athena-window.ts` | Explicit SQL date-window literals + result-reuse knobs — `windowFloor(days, nowMs)`, `isoDateLiteral` (quoted, for `user_report.date` string compares), `buaDateLiteral` (`DATE '…'`, for `DATE_PARSE(by_user_analytic.date)` timestamp compares), `RESULT_REUSE_MAX_AGE_MINUTES`, `resultReuseEnabled(env)`. Pure and clock-injected so the 00:00 UTC boundary is testable; `getUTC*` math only. Throws on a non-integer/negative `days` rather than interpolating `NaN` into a WHERE clause (a silently empty dashboard). Every Athena route imports from here — pinned by `tests/api/date-literal-audit.test.ts` |
| `nav-state.ts` | Sidebar nav-item state machine — `navItemState`, `nextPendingHref`, `navItemClassName`, `isNavigatingClick`, `NavItemState`, `NavClickModifiers`, `PENDING_NAV_TIMEOUT_MS`. Exists because `usePathname()` only updates when a transition COMMITS, so clicking the slow `/` route changed nothing on screen and the click looked ignored ("멈칫"). `active` beats `pending` so a stale pending href can't keep pulsing a committed route; `nextPendingHref` returns `null` for a re-tap of the current route (no transition ⇒ nothing would ever clear it). The pending purple is **opaque** — see the contrast note below. Pure/here, not in `Sidebar.tsx`, because Jest only collects `*.test.ts` |
| `skeleton-layout.ts` | Loading-skeleton block shapes + policy — `skeletonLayout(variant)`, `showSkeleton(loading, hasData)`, `dimWhileRefetching`, `pageBodyOpacityClass`, `SKELETON_VARIANTS`, `SkeletonBlock`, `SkeletonVariant`. Variants are coarse *silhouettes* (`overview`/`chart`/`split`/`ranked`/`table`) so a new page reuses one instead of growing a bespoke shape. `showSkeleton` is false when `hasData` — a `days` change must not blank settled numbers — and `dimWhileRefetching` is its exact complement, so the two are never on together. Rendered by `app/components/ui/PageSkeleton.tsx` |
| `model-colors.ts` | `modelColor(name)` — stable series color per AI model name via djb2 hash over a 10-color palette (Kiro purple first); `Auto` is fixed to a muted gray as a router pseudo-model. Name-derived, NOT index-derived: the model set is dynamic, so an index palette would recolor every series when the ranking changed. Theme-invariant (inline styles don't participate in the light-mode palette override) |

---

## athena.ts

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `executeQuery(sql)` | `async (string) => Record<string, string>[]` | Runs an Athena query and returns all rows as key-value records. Memoized per `(UTC day, SQL)` — see the caching section below |
| `executeQueryUncached(sql)` | `async (string) => Record<string, string>[]` | The raw Athena round trip, bypassing the memo |
| `queryMemo` | `TtlMemo<Record<string,string>[]>` | The memo instance; `.stats()` for hit/miss/coalesce counters, `.clear()` to drop entries |
| `NORMALIZE_USERID` | `string` | SQL snippet: `REGEXP_REPLACE(userid, '^d-[a-z0-9]+\.', '')` |
| `safeFloat(val)` | `(string) => number` | Parse float, return 0 on NaN |
| `safeInt(val)` | `(string) => number` | Parse int, return 0 on NaN |
| `pollDelayMs(attempt)` | `(number) => number` | Sleep after status check `attempt + 1`: `150, 300, then 500` forever. Ramps UP to the historical fixed 500ms and is capped there — never backoff |
| `POLL_DELAY_RAMP_MS` / `POLL_DELAY_CAP_MS` | `readonly number[]` / `number` | The ramp steps and the 500ms ceiling |
| `isMissingTableError(err)` | `(unknown) => boolean` | True when an error means the Glue table/database doesn't exist yet (Athena `TABLE_NOT_FOUND`/`COLUMN_NOT_FOUND`, "does not exist", Glue `EntityNotFoundException`) — API routes use it to return 200 + empty payload instead of a 500 on fresh accounts |

**Environment Variables Used:**
- `AWS_REGION` — Athena client region (default: `us-east-1`)
- `ATHENA_DATABASE` — Glue database name (default: `titanlog`)
- `ATHENA_OUTPUT_BUCKET` — S3 path for query results
- `ATHENA_QUERY_CACHE_TTL_MS` — result memo TTL (default `60000`; `0` disables)
- `ATHENA_QUERY_CACHE_MAX_ENTRIES` — retained entry cap (default `200`)
- `ATHENA_QUERY_CACHE_MAX_ROWS` — per-result retention cap (default `20000`)
- `ATHENA_QUERY_CACHE_MAX_TOTAL_ROWS` — rows across ALL entries; the real memory bound (default `50000`)
- `ATHENA_RESULT_REUSE` — server-side result reuse, 60 min (default on; `0` disables)

**Polling:** `executeQuery` polls until `SUCCEEDED`, `FAILED`, or `CANCELLED`,
sleeping `pollDelayMs(attempt)` **between** checks — `150ms → 300ms → 500ms, then
500ms forever` (`POLL_DELAY_RAMP_MS`, `POLL_DELAY_CAP_MS`). Handles pagination via
`NextToken`.

The direction is a ramp **UP to** the old fixed 500ms, and 500 is the **ceiling,
not the floor** — see the anti-backoff note below. Honest scope: detection
overshoot is set by whichever interval is in force when the query finishes, so
this helps only queries completing inside the first ~450ms and does nothing for
the 1-3s engine-planning case (which still lands in the 500ms cap). Worth
~50-350ms on fast queries for +2 `GetQueryExecution` calls per long query. An
interval small enough to cut the 1-3s case would roughly double API call volume
against an account-shared Athena rate limit. Result reuse has since landed and cut
reused queries to ~240-380ms, which moves them INTO the range the ramp helps —
that is the intended sequencing, and it also weakens the case for a smaller
interval, because the remaining slow queries are the genuine cache misses.
Pinned by `tests/lib/athena-poll.test.ts`
(schedule) and `tests/lib/athena-poll-loop.test.ts` (loop wiring: first check at
t+0, FAILED/CANCELLED throw without sleeping, no `MaxResults`).

#### Two measured non-problems — do not "optimize" these

Both of these read as obvious wins and are not. They were checked against the
code and the AWS contract, and both proposed fixes are no-ops or regressions:

- **There is no pre-first-check delay, and do NOT add backoff.**
  `GetQueryExecutionCommand` is awaited at the TOP of the `while (true)` body and
  the sleep is the LAST statement, so the first status check already fires at t+0
  and a query that is already `SUCCEEDED` sleeps zero milliseconds. Adding "an
  immediate first check" changes nothing. Adding *backoff* is strictly worse:
  these queries run ~1-3s and completion is detected one interval late on
  average, so any interval above 500ms detects completion LATER than the fixed
  500ms it replaced. That is why `POLL_DELAY_CAP_MS === 500` and
  `pollDelayMs` is monotonic but capped — the ramp only ever undercuts the old
  interval. `tests/lib/athena-poll.test.ts` fails if someone raises the cap.
- **Do not add `MaxResults` to `GetQueryResults`.** Omitting it already returns
  the largest page (up to the 1000-row service maximum) and therefore the fewest
  round trips; setting it could only add pagination calls. At this data scale
  (`user_report` ~323 rows, `by_user_analytic` ~541, `/api/users` caps at
  `LIMIT 100`) the `while (nextToken)` loop never executes at all.

Poll overshoot also does not accumulate the way it appears to: every multi-query
route uses `Promise.all`, so the loops run concurrently and the cost is `max()`,
not `sum()`.

### Result caching

Kiro reports land **once daily at 02:00 UTC**, so query results are immutable
for ~24h. A 60s-old answer therefore cannot be staler than the source, which is
already up to 24h old — caching costs no correctness here.

- **Key** is `(UTC day, SQL string)`, not the SQL alone. Route SQL now interpolates
  literal dates from `lib/athena-window.ts`, and those literals roll at 00:00 UTC —
  the same instant as the memo's `utcDayStamp` key, so key and SQL window move
  together. The day stamp makes every entry self-invalidate at 00:00 UTC.
- **The day boundary is 00:00 UTC, NOT the 02:00 UTC report drop.** Offsetting the
  stamp to 02:00 to "match ingest" is a correctness regression, not a fix: the
  key's job is to track the SQL *window*, and the window comes from Athena's
  `CURRENT_DATE`, which rolls at 00:00 UTC. With an 02:00 stamp, 01:59Z would
  reuse the entry minted at 20:00Z the previous evening whose 90-day floor was a
  day earlier — a one-day-stale window for two hours every day. The cost of 00:00
  is one extra query per distinct key per day, between 00:00 and 02:00. Pinned by
  `tests/lib/query-cache.test.ts`.
- **`/api/ingest-health` is carved out** and calls `executeQueryUncached` for both
  of its queries. It is the report-freshness monitor, so a 60s-stale row count is
  not merely imprecise but meaningless — its own header comment says freezing it
  at whatever it first saw is "the one thing it must never do". Pinned by
  `tests/lib/query-cache.test.ts`, which reads the route off disk.
- **Single-flight**: concurrent callers with identical SQL share one execution,
  so a `Promise.all` fan-out cannot start duplicate Athena queries.
- **Rejections are never cached** — a throttle or a not-yet-provisioned Glue
  table must not be pinned for the TTL, since routes degrade those to a 200.
- **Callers get a copy** of the row array, so an in-place `rows.sort()` in a
  future route cannot corrupt the shared entry.
- **No HTTP cache headers, no route config.** Caching sits *below* the route
  layer deliberately. The Next-native alternatives were each measured and
  rejected — recorded so nobody re-litigates them:
  - `export const revalidate = N` on a route that reads `req.url` leaves the route
    dynamic with **zero** caching. Inert work that reads as a fix in review.
  - The same line on a route that does *not* read `req.url` flips it to static and
    permanently bakes build-time data — the force-static trap in a new costume,
    still live in Next 14.2.35. That trap shipped Korean release notes to English
    users and is now pinned by a test.
  - `Cache-Control: s-maxage=…` on the data routes buys nothing: the CloudFront
    distribution attaches Managed-CachingDisabled (Min/Max/DefaultTTL all 0) and
    **MaxTTL=0 clamps s-maxage to zero**. An `/api/*` cache behavior additionally
    needs the query string in the cache key first — the managed policy's
    `QueryStringBehavior=none` would make `?days=7` and `?days=90` serve each
    other's data, a correctness bug rather than a missed optimization.
- **Per-task, not shared.** Each Fargate task has its own memo, so a warm task
  and a cold task can differ by up to one TTL. Bounded by the same 24h
  immutability argument. It is also **cold on every new task**, so the first click
  after a deploy or a scale-out still pays full Athena latency — this memo does
  not fix the first-visit or post-deploy stall.
- **`admit` does NOT bound memory; `maxWeight` does.** The two caps *multiply*:
  `maxEntries: 200` × `ATHENA_QUERY_CACHE_MAX_ROWS: 20000` permits ~4M retained
  row objects, and a 44-column `by_user_analytic` row retains ~3.4KB measured, so
  ~13 GB against a `memoryLimitMiB: 1024` task. `admit` refuses one oversized
  result; the running total (`weigh` + `maxWeight`, default
  `ATHENA_QUERY_CACHE_MAX_TOTAL_ROWS` = 50000 ≈ 170 MiB) is what actually holds.
  Fixed-SQL routes cannot reach the bound, but **`/api/analyze` can**: its
  `query_athena` tool runs LLM-authored SQL through the same memo, minting
  arbitrarily many distinct keys per chat session, and its `rows.slice(0, 200)`
  truncates only what reaches the model — the memo already retains the full
  result. `lib/identity.ts` needs no total budget because its key space is
  identity store ids (4 × 50k users is a real ceiling, not an open one).

### Athena result reuse (shipped — date literals landed first)

The server-side complement to this memo is `ResultReuseConfiguration` on
`StartQueryExecutionCommand`. It is shared across **all** Fargate tasks in a way a
per-task memo structurally cannot be, which is what makes it the fix for the case
the memo explicitly does not cover: a cold task (fresh deploy, scale-out) paying
full Athena latency on its first click.

Both halves are in place, in the order that was non-negotiable:

1. Route SQL interpolates explicit date literals from `lib/athena-window.ts` —
   `isoDateLiteral` for `user_report` (`YYYY-MM-DD`, string-compared) and
   `buaDateLiteral` for `by_user_analytic` (`MM-DD-YYYY` read via
   `DATE_PARSE(date, '%m-%d-%Y')`, so the right-hand side must be `DATE '…'`, not
   a quoted string — comparing a timestamp to a string is an Athena type error).
2. `executeQueryUncached` then sends `ResultReuseByAgeConfiguration` with
   `MaxAgeInMinutes: 60`, spread in only when `ATHENA_RESULT_REUSE !== '0'` so the
   kill switch leaves the request byte-identical to the pre-reuse one.

**Reuse without the literals is a provable no-op**, which is why the ordering
mattered. Measured live in this account, same SQL, reuse flag the only variable:

| Request | DataScanned | Execution |
|---------|-------------|-----------|
| literal window, no reuse flag | 100304 B | 808 ms |
| literal window, reuse flag | **0 B** | **242 ms** |
| literal window, reuse flag (again) | 0 B | 384 ms |

End to end through the app with the memo disabled (`ATHENA_QUERY_CACHE_TTL_MS=0`,
so every call is a real round trip), `/api/metrics?days=90` went 2.17s → 1.07s.

Use `60`, not `1440`: `/api/analyze` runs LLM-authored SQL that still resolves its
own window, and an hour bounds how far such a result can predate the newest
02:00 UTC report.

The hit signal is `ResultReuseInformation.ReusedPreviousResult` from
`GetQueryExecution` — confirmed populated in this account, verified against the
live v1.9.0 deploy (hits report `ReusedPreviousResult: true` alongside 0 bytes
scanned; misses report `false` alongside 100304). `DataScannedInBytes` agrees with
it and is the cheaper thing to eyeball, but the boolean is the authoritative field.

Read it via `--query 'QueryExecution.Statistics'` and inspect the whole object.
Projecting straight to `Statistics.ResultReuseInformation` in a nested
`--query {...}` multi-select renders it in a way that reads as absent, which is
easy to mistake for "the field is null in this account" — it is not.

Two operational notes: announce before deploying that Athena bytes-scanned will
drop sharply — that is a cache hit, not data loss. And ensure any S3 lifecycle
rule on the `athena-results/` prefix expires no sooner than `MaxAgeInMinutes`, or
reuse silently degrades with no error.

`/api/ingest-health` uses `executeQueryUncached`, so reuse never applies to the
freshness monitor — but its SQL carries literals too, because
`tests/api/date-literal-audit.test.ts` holds every route to the rule (a route that
keeps `CURRENT_DATE` is permanently unreusable while looking fine in review).

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
| `resolveUserDetails(userIds)` | `async (string[]) => Map<string, UserDetail>` | Resolves user IDs to masked display details (directory snapshot cached 1h) |
| `resolveUsernames(userIds)` | `async (string[]) => Map<string, string>` | Resolves user IDs to masked usernames (cached 1h) |
| `identityDirectoryCache` | `TtlMemo<Map<string, UserDetail>>` | The directory snapshot cache behind `resolveUserDetails`; `.stats()` / `.clear()` |

All returned values (displayName, email, username, organization) are automatically masked via `lib/mask.ts`.

**Environment Variables Used:**
- `IDENTITY_STORE_ID` — IAM Identity Center store ID (e.g., `d-90663be888`)
- `IDENTITY_DIRECTORY_CACHE_TTL_MS` — directory snapshot TTL (default `3600000`; `0` disables)
- `IDENTITY_DIRECTORY_CACHE_MAX_USERS` — per-snapshot retention cap (default `50000`)
- `AWS_REGION`

### Directory snapshot cache

`resolveUserDetails` walks the **entire** directory with `do/while` `ListUsers`
pagination. 10 of the 19 API routes call it and an Overview load fans out to six
of them at once, so a single page view used to pay six full directory walks —
while its sibling `resolveUsernames` had a 1h cache all along.

The cached unit is the **directory**, not the requested ids. Callers pass wildly
different id sets, but every one of them triggers the same *unfiltered*
`ListUsers` walk, so keying on the id set would miss on nearly every call while
doing identical work. One key per identity store id (there is one per deployment)
means later callers do zero AWS I/O.

Reuses `TtlMemo` from `query-cache.ts`, which supplies the properties that make
this safe rather than merely fast: **single-flight coalescing** (the six
concurrent Overview routes share one in-flight walk even on a cold task — the
TTL alone would not do this) and **rejections are never cached** (a throttle or
IAM denial is retried next request instead of pinning an hour of masked ids). The
`admit` bound caps retained users because an entry cap bounds *count*, not bytes.
1h is generous because directory membership is far more stable than activity
data; until a new user appears they render as a masked id, the same fallback
already used for any id missing from the directory. Covered by
`tests/lib/identity-cache.test.ts`.

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
