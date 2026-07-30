# Changelog

[![English](https://img.shields.io/badge/lang-English-blue.svg)](#english)
[![한국어](https://img.shields.io/badge/lang-한국어-red.svg)](#한국어)

---

# English

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.9.0] - 2026-07-30

Finishes the menu-latency work 1.8.0 started. 1.8.0 fixed the missing *feedback*
(the click now highlights in 38 ms) but explicitly did not shorten the wait, and
recorded the reason: the real fix was blocked behind a prerequisite. This release
does the prerequisite and then the fix.

### Added

- **Athena server-side result reuse** — the item 1.8.0 recorded as deliberately
  deferred. This is the piece that helps a **cold** Fargate task: 1.8.0's memo is
  per-task, so the first click after a deploy or scale-out still paid full Athena
  latency. Reuse is shared across tasks.
  - Landed in the order 1.8.0 called non-negotiable, because reuse before literals
    is a no-op. **Step 1:** every Athena route now interpolates an explicit date
    literal from the new `lib/athena-window.ts` (`isoDateLiteral` for
    `user_report`'s string-compared `YYYY-MM-DD`; `buaDateLiteral` for
    `by_user_analytic`, where `DATE_PARSE` yields a timestamp and so needs `DATE
    '…'`). 14 route files. **Step 2:** `ResultReuseByAgeConfiguration` with
    `MaxAgeInMinutes: 60`, behind `ATHENA_RESULT_REUSE` (`0` disables).
  - Measured live on identical SQL with the memo disabled, reuse flag the only
    variable: **100 304 bytes / 808 ms → 0 bytes / 242 ms**, then 0 bytes / 384 ms.
    End to end, `/api/metrics?days=90` went **2.17 s → 1.07 s**.
  - `MaxAgeInMinutes` is 60, not 1440: `/api/analyze` runs LLM-authored SQL that
    still resolves its own window, and an hour bounds how far such a result can
    predate the newest 02:00 UTC report.
  - The window math is `getUTC*` only and takes `nowMs` as a parameter, so the
    00:00 UTC boundary is testable without fake timers — and it rolls on the same
    instant as Athena's `CURRENT_DATE` and as the memo's `utcDayStamp`. A handler
    building two adjacent windows reads the clock **once** (`metrics/route.ts`);
    two reads could straddle midnight and leave a one-day hole between periods.
  - The kill switch **omits** the config key rather than sending `Enabled: false`,
    so a rollback is byte-identical to the pre-reuse request.
  - `tests/api/date-literal-audit.test.ts` reads every `app/api/**/route.ts` off
    disk and fails on `CURRENT_DATE` or `DATE_ADD` (`/api/analyze` exempt). The
    failure mode is textual and invisible to a functional test: the query string
    stays stable, only the engine knows the window moved.

### Fixed

- **A documented cache-hit signal that does not exist.** `lib/CLAUDE.md` recorded
  `ResultReuseInformation.ReusedPreviousResult` as "confirmed populated in this
  account — do not infer hits from `DataScannedInBytes === 0`". The opposite is
  true: `GetQueryExecution` returns `ResultReuseInformation: null` on every
  execution here, including confirmed hits (0 bytes scanned, 3× faster). A monitor
  or test built on that field would have reported reuse as broken while it worked.
- **`app/api/CLAUDE.md`'s route template taught the banned pattern.** Its copy-paste
  snippet used `DATE_ADD(… CURRENT_DATE)`, which the new audit test rejects — so
  the documented way to add an endpoint would have failed the build.

## [1.8.0] - 2026-07-29

Menu-transition latency work. The user-visible complaint was that clicking a
sidebar item stalls for a moment before anything happens. Two of the four
diagnoses that opened this work turned out to be wrong and were dropped rather
than implemented; what is recorded below is what measurement supported.

### Added

- **The clicked sidebar item now highlights immediately.** This was the actual
  cause of the perceived stall: the highlight was derived from `usePathname()`,
  which only updates when a route transition *commits*. `/` is the one
  dynamically-rendered route, so clicking it moved nothing on screen — not the
  page, not even the nav highlight — until every Athena query finished. Measured
  on the real build: first visual feedback at **38 ms** instead of nothing for
  **2621 ms**.
  - State machine in `lib/nav-state.ts`. `active` beats `pending`, so a stale
    pending href cannot keep pulsing a committed route; a re-tap of the current
    route records nothing, because with no transition there is nothing to clear
    it. A 10s ceiling absorbs transitions that end without a commit (failed RSC
    fetch, Back mid-flight) — pulsing forever is a worse lie than no feedback.
  - Items stay `<Link>`, preserving Next's prefetch, which is what makes the 13
    prerendered routes feel instant.
- **One loading skeleton, shared by both loading paths** —
  `app/components/ui/PageSkeleton.tsx`, with shapes and policy in
  `lib/skeleton-layout.ts`. It shows only on the *first* load: a `days` dropdown
  change keeps the settled numbers on screen instead of blanking them.
- **A loading boundary for `/` only**, scoped by an `app/(overview)/` route group
  (which adds no URL segment). Browser-verified that the 13 prerendered siblings
  never paint it, and their prefetch payloads are unchanged. `/`'s own prefetch
  went from an 80-byte stub to 5474 bytes referencing the loading chunk.
- **Athena result memo** (`lib/query-cache.ts`) behind `executeQuery`, keyed on
  `(UTC day, SQL)` with single-flight coalescing. Safe for one domain reason
  only: Kiro reports land once daily at 02:00 UTC, so a 60s-old answer cannot be
  staler than a source already up to 24h old. Every bound is an env kill switch.
- **IdentityStore directory snapshot cache** (1h). `resolveUserDetails` walked the
  entire directory on every call and 10 of the 19 routes call it, so one Overview
  load paid six full walks — while its sibling `resolveUsernames` had a cache all
  along.

### Fixed

- **`/api/ingest-health` was being served stale rows by the new memo.** It is the
  report-freshness monitor, so freezing it at whatever it first saw is the one
  thing it must never do. Both queries now bypass the cache.
- **The Overview server component fetched in three sequential waves**, adding two
  Athena round trips directly to the navigation stall. Now one `Promise.all` of
  six: **2.7s instead of 7.5s**.
- **`/users` fetched the same endpoint twice** (`limit=10` and `limit=100`). The
  top-10 list is now derived from the 100-row result.
- **`OverviewClient` fabricated a client-type distribution when its API failed** —
  a hard-coded 60/25/15 split that nobody measured. Removed; it now falls back to
  empty, matching the server component.
- **The pending nav highlight was unreadable in light mode.** `bg-[#9046FF]/70`
  over the white sidebar is 2.88:1 for the label, and `animate-pulse` dragged it
  to ~1.65:1 — the item the user just clicked became the least readable one. The
  purple is now opaque (4.66:1 light / 7.64:1 dark).
- **The skeleton was nearly invisible on all 12 gated pages.** It rendered inside
  the pre-existing `opacity-50` refetch wrapper, and CSS opacity composites down
  a subtree, so its own `animate-pulse` multiplied to 0.25 — about a 5/255 delta
  against the page background. Dimming is now `pageBodyOpacityClass(loading,
  hasData)`, mutually exclusive with showing a skeleton.
- **A Cmd/Ctrl-click on a nav item left a phantom highlight pulsing for 10s.**
  Next invokes `onClick` before deciding to navigate and then skips navigation
  for modified clicks, so this document never transitioned and nothing cleared
  the pending state.
- **The query memo's memory bound was overstated in its own comment.** The
  per-entry row cap multiplies with the entry cap (200 × 20 000 ≈ 4M rows ≈
  13 GB against a 1024 MiB task). `/api/analyze` is the reachable path — it runs
  LLM-authored SQL through the same memo. Bounded now by a running total
  (`ATHENA_QUERY_CACHE_MAX_TOTAL_ROWS`, default 50 000 ≈ 170 MiB).

### Changed

- **Athena poll interval ramps `150 → 300 → 500 ms`, capped at 500.** This is
  deliberately *not* backoff: these queries finish in ~1-3s and completion is
  detected one interval late on average, so any interval above the old fixed
  500 ms would detect completion *later* than the code it replaced. The old value
  is the ceiling, so no query is ever slower than before. A test fails if anyone
  raises the cap.

### Not done (recorded so it is not mistaken for an oversight)

- **Athena server-side result reuse** is the multi-second win here and is
  deliberately deferred: it is a provable no-op until the route SQL stops using
  `CURRENT_DATE`. Measured live — the `CURRENT_DATE` query scanned the full
  100 304 bytes on both consecutive runs; with an explicit date literal it went
  100 304 → 0 bytes. Shipping reuse alone would look like a fix and change nothing.
  *(Done in 1.9.0. The `ReusedPreviousResult: false`/`true` readings
  originally cited here were wrong — that field is null in this account.)*
- **Two proposed optimizations were measured and rejected as regressions**, not
  skipped: adding poll backoff (slower for the dominant case, above) and setting
  `MaxResults` on `GetQueryResults` (omitting it already returns the largest page
  and therefore the fewest round trips).
- The memo is **per-Fargate-task and cold on every new task**, so the first click
  after a deploy or a scale-out still pays full Athena latency. This work does
  not fix the first-visit or post-deploy stall.

## [1.7.0] - 2026-07-29

### Added

- **The sidebar version badge is now clickable and opens the release notes for
  the running build.** It was a link to `/changelog`; it is now a button opening
  a dialog that shows only the current version's section, with history chips
  deep-linking to `/changelog#v{version}` for older releases. New endpoint
  `GET /api/release-notes`. Escape closes the dialog, focus moves to the close
  button, and body scroll locks while it is open.
  - `CHANGELOG.md` is **imported**, not read: `next.config.js` maps it to a
    webpack `asset/source` rule so it is inlined as a build-time string. A
    `readFileSync` here would crash every request — `output: 'standalone'`
    ships only `public/` and `.next/`, no markdown. (The `/changelog` page gets
    away with a read solely because `force-static` runs it at build time.)
  - Block rendering moved to `app/components/ui/ChangelogBlocks.tsx` and is now
    shared by `/changelog` and the dialog, so the v1.6.1 bold/code-fence/table
    fixes cannot regress in one surface only.
  - The dialog fetches one section over HTTP instead of importing the parser,
    keeping ~50KB of both-language markdown out of every page's client bundle.
- **Per-user AI model usage statistics in the user detail panel.** Selecting a
  user now shows their model mix: a stacked 100%-width bar, primary model,
  distinct model count, per-model message counts with percentages, and a
  client-type split when the user appears under more than one `Client_Type`.
  New endpoint `GET /api/user-model-usage`.
  - Reads the UAR CSVs from S3 directly rather than through Athena, because the
    `{model}_messages` columns are dynamic and OpenCSVSerDe maps positionally
    (ADR-0004). It fetches independently of the panel's Athena-backed
    `/api/user-detail` call, so an S3 problem degrades one card instead of
    emptying the panel.
  - Distinguishes **three** zero-looking states — S3 env not configured, reports
    that carry no model columns at all, and a user who genuinely sent no model
    messages. Collapsing them into one "no data" would assert a measurement
    nobody made.
  - Model colors are derived from the model NAME (djb2 hash over a fixed
    palette, `lib/model-colors.ts`), not from position in a list: the model set
    grows over time, so an index-based palette would recolor every series
    whenever the ranking changed.

### Fixed

- **AI analysis answered in Korean even with the UI language set to English.**
  The Bedrock system prompt had `Use Korean for analysis reports` hardcoded, and
  the locale never left the client — LLM output language is not something `t()`
  can cover, since `t()` only translates strings we author. The locale now
  travels client → request body → system prompt.
  - The language rule is appended **last** in the prompt: the model weights the
    closing instruction most heavily, so an English answer survives Korean tool
    results and Korean column labels.
  - The locale only ever **indexes** a literal `LANGUAGE_RULE` record; it is
    never interpolated into prompt text, so the request body cannot become a
    prompt-injection channel.
  - The Markdown export header (title / generated / question labels) also
    followed the hardcoded Korean and now follows the active locale.
- **`/api/release-notes` served Korean notes for every locale.** It was
  `force-static`, and Next.js prerenders such routes once while handing the
  handler an **empty** `searchParams` — so `?locale=en` silently fell through to
  the `ko` default and the Korean payload was baked into the build output. Now
  `force-dynamic`, with the parse memoized per locale.

### Changed

- The `/api/analyze` system prompt moved out of the route into
  `lib/analyze-prompt.ts`. Next.js type-checks `route.ts` against a fixed export
  list, so exporting a helper from a route fails the build with
  `Type '(value: unknown) => AnalyzeLocale' is not assignable to type 'never'`.
  A structural test now catches that class of error as a unit failure.
- `isModelColumn`, `prettifyModelName`, and `normalizeUserId` were promoted from
  `/api/model-usage` into `lib/uar-s3.ts` and are shared with the new route.
  **`Total_Messages` also ends in `_messages`**, so the suffix test must always
  be paired with the `total_messages` exclusion; a duplicated copy is exactly how
  that pairing drifts out of one route.

## [1.6.1] - 2026-07-29

### Fixed

- **`/changelog` rendered "No changelog entries available" in every deployed
  image.** `.dockerignore` carried a blanket `*.md`, and `.dockerignore` filters
  the Docker *build context* — not just the runtime image — so `CHANGELOG.md`
  never reached the builder stage that `/changelog` prerenders from. The page's
  `try/catch` then fell back to an empty string, so the build stayed green and
  the failure was silent. Added `!CHANGELOG.md` after the exclusion (Docker
  applies the last matching pattern) and made the read unguarded: a missing
  required build input must fail the build, not ship a blank page.
- `tests/structure/changelog-build-input.test.ts` pins both halves — the
  re-include must exist *and* come after the exclusion, and the page must not
  reintroduce a `catch`.
- **`/changelog` printed bold markers as literal asterisks, flattened fenced
  code into run-on prose, and showed tables as raw `|` pipes.** Harmless while
  entries were plain bullets; the 1.5.0 upgrade guide added all three. The
  renderer now handles bold, fenced code (`<pre>`), and pipe tables.
- **`/changelog` reordered any entry that interleaved paragraphs and bullets.**
  The parser kept `paras` and `items` in separate arrays and rendered every
  paragraph before every bullet, so source order was silently lost. Blocks are
  now a single ordered list. Fenced code is consumed through its closing fence,
  so a `#` comment or `- ` line inside a bash block no longer parses as a
  heading or bullet.

### Changed

- Changelog markdown parsing moved from `app/changelog/ChangelogClient.tsx` to
  `lib/changelog-md.ts`. Jest only collects `*.test.ts` files, so logic inside a
  `.tsx` component cannot be tested — the same reason `lib/chat-scroll.ts` is
  separate from `ChatPanel`. `tests/lib/changelog-md.test.ts` now runs the
  parser against the real `CHANGELOG.md` in both languages; each of the two
  mutations tried (dropping fence handling, dropping table handling) fails 7
  assertions (101 → 125 tests, 18 suites).

## [1.6.0] - 2026-07-29

Driven by a re-reading of the four authoritative Kiro documentation pages
(IDE user activity, CLI user activity, prompt logging, console dashboard),
which are now recorded as the project's reference contract in `CLAUDE.md` and
`docs/kiro-user-activity-report-schema.md`.

### Added

- **`/rollout` — client rollout & cross-client adoption.** Daily actives and
  cumulative adopters per `Client_Type`, IDE-only / CLI-only / both segments,
  and a per-user pickup-lag table. `Client_Type` is the only dimension in
  `user_report` with real cardinality in this account, so it is the one
  rollout question the data can actually answer. The cumulative curve is
  accumulated in JS from each (user, client) pair's `MIN(date)` because
  Athena/Presto rejects `COUNT(DISTINCT …) OVER (ORDER BY …)`. Pickup lag is
  `null` — not `0` — for users first seen on the window's opening date, since
  left-censored history cannot distinguish "adopted both the same day" from
  "we cannot see far enough back".
- **`/ingest-health` — report delivery & freshness monitor.** Latest report
  date, S3 object write time, report lag, a date × client delivery matrix,
  header-drift grouping, an Athena-vs-CSV row parity check, and a legacy
  column instrumentation strip. The matrix has deliberately only two states:
  Kiro writes a CSV *only* for client types that had activity that day and
  publishes no expected-file count, so "no file" and "delivery failed" are
  indistinguishable from the data — an amber "late" state would fire every
  weekend and train operators to ignore the page.
- **Directory user activity grading on the overview** — five dormancy buckets
  (≤7d / 8–30d / 31–60d / 60d+ / no activity) plus a directory → any activity
  → sustained (5+ active days) funnel, with per-user active-days and
  days-since columns. Graded over IAM Identity Center directory users; the
  directory is **not** a Kiro subscription roster (only
  `user-subscriptions:ListUserSubscriptions` is, and it is not granted to the
  task role), so these counts are never presented as licenses or seats.
- **Credits per accepted AI code line** on `/productivity` — `user_report`
  credits ÷ (`chat_aicodelines` + `inline_aicodelines`) over the window where
  both reports overlap, computed as two independent sums rather than a
  (user, date) join because 303 of `by_user_analytic`'s 541 pairs have no
  `user_report` counterpart. Window bounds are read from the data, never
  hardcoded. Rendered as a credit ratio with no currency symbol — Kiro
  publishes no credit→price rate.

### Fixed

- **Legacy acceptance-rate denominators.** `/api/dev-activity` computed
  DocGen's rate over line *additions* only, dropping
  `docgeneration_*lineupdates` from both numerator and denominator, and
  omitted all three `inlinechat_*linedeletions` counters from InlineChat's
  denominator. Both are now summed over the full accepted/rejected/dismissed
  column families, and the top-users accepted-lines total picks up the two
  missing accepted columns.
- **Never-referenced legacy columns surfaced.** `/api/productivity` now
  aggregates `chat_messagesinteracted`, `dev_generatedlines`,
  `dev_acceptanceeventcount`, `codereview_succeededeventcount`, and
  `codereview_failedeventcount`, and derives rates from them behind a
  minimum-denominator guard. Rates return `null`, rendered as "not
  instrumented", rather than a confident `0.0%` — 39 of the legacy report's 44
  metric columns are the literal string `0` in every row in this account.
- **`/api/idc-users` no longer 500s on a missing Glue table.** An
  unprovisioned catalog now grades every directory user as "no activity"
  instead of failing the whole listing, matching the `isMissingTableError`
  degradation every other route already had.

### Changed

- `app/page.tsx` and `OverviewClient.tsx` now import `IdcUsersData` from
  `types/dashboard.ts` instead of each maintaining a local duplicate that
  silently dropped fields the route had started returning.
- **`/api/dev-activity` DocGen and InlineChat rates will differ from the
  numbers v1.5.0 displayed.** The denominators were wrong, not the data, so
  historical figures were overstated (DocGen) and understated (InlineChat).
  Nothing to migrate — but do not treat the shift as a regression.
- `tests/api/route-empty-responses.test.ts` now covers `/api/rollout`,
  `/api/idc-users`, and the two new `/api/productivity` degradation paths
  (97 → 101 tests).

### Upgrading from 1.5.0

**No infrastructure change is required.** This release touches only `app/`,
`lib/`, `types/`, `tests/`, and docs. Verified by `cdk diff` against a live
v1.5.0 deployment: `KiroDashboardNetwork` and `KiroDashboardSecurity` report
"no differences", and the only Ecs/Cdn delta is the `X-Custom-Secret` that
`crypto.randomUUID()` re-rolls on every synth. **Deploying CDK to pick up
v1.6.x would rotate that secret for no benefit** — take the image path.

**Upgrade to 1.6.1, not 1.6.0.** 1.6.0 builds `/changelog` as an empty page
(see the 1.6.1 entry above); everything else in this section applies to both.

```bash
git pull                       # or merge the v1.6.1 tag into your branch
npx jest && npm run build      # expect 18 suites / 125 tests

docker build -t kiro-dashboard .
ECR=<account>.dkr.ecr.<region>.amazonaws.com
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin "$ECR"
docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:1.6.1"
docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:latest"
docker push "$ECR/kiro-dashboard:1.6.1" && docker push "$ECR/kiro-dashboard:latest"

SERVICE=$(aws ecs list-services --cluster kiro-dashboard-cluster \
  --region <region> --query 'serviceArns[0]' --output text)
aws ecs update-service --cluster kiro-dashboard-cluster --service "$SERVICE" \
  --force-new-deployment --region <region>
aws ecs wait services-stable --cluster kiro-dashboard-cluster \
  --services "$SERVICE" --region <region>
```

Tag the image with the version as well as `latest` — `latest` alone leaves a
rollback with no named target.

**Nothing else to do.** Each of these was checked rather than assumed:

- **No new dependencies.** `package-lock.json` is byte-identical to v1.5.0;
  the only `package.json` change is the version string. `npm ci` is harmless
  but unnecessary.
- **No new ECS environment variables.** Every `process.env` key the new code
  reads (`ATHENA_DATABASE`, `ATHENA_OUTPUT_BUCKET`, `GLUE_TABLE_NAME`,
  `IDENTITY_STORE_ID`, `S3_REPORT_PREFIX`, `S3_DATA_BUCKET`, `AWS_REGION`) is
  already set by `EcsStack`.
- **No new IAM permissions.** The new routes need `s3:GetObject` +
  `s3:ListBucket` on the report prefix and `glue:GetTable`, all already
  granted to the task role.
- **No new CloudFront behaviour or cache invalidation.** `CdnStack` declares a
  single catch-all `defaultBehavior` with `CACHING_DISABLED`, so `/rollout`
  and `/ingest-health` are served without configuration.
- **No Dockerfile, Node, or build-flag change** (`node:20-alpine`,
  `output: 'standalone'` unchanged).
- **No new i18n keys removed or renamed** — additive only, so fork
  translations keep working.
- **No sidebar wiring needed** — nav entries and their `nav.rollout` /
  `nav.ingestHealth` keys ship in the same commit.

**If you forked and customized v1.5.0**, two things need attention:

- `IdcUsersData` moved to `types/dashboard.ts`. If your fork imported the local
  copy that used to live in `app/page.tsx` or `OverviewClient.tsx`, switch to
  `import { IdcUsersData } from '@/types/dashboard'`. No field was removed; the
  duplicates were dropping fields the route already returned.
- `/api/productivity`'s `summary` gained four `number | null` rate fields and a
  `creditEfficiency` object. Existing fields are unchanged, so consumers that
  ignore the new keys are unaffected — but any consumer that renders the new
  rates must handle `null` as "not instrumented" rather than coercing to `0`.

**New features stay empty until their data exists**, and they degrade rather
than fail — `isMissingTableError` returns a well-shaped empty payload:

| Feature | Needs | Without it |
|---------|-------|-----------|
| `/rollout` | `Client_Type` populated in `user_report` | empty charts, `dataStart: null` |
| `/ingest-health` | `S3_REPORT_PREFIX` + S3 list/read on the report bucket | `configured: false`, empty inventory |
| Dormancy & funnel | nothing new beyond v1.5.0's `IDENTITY_STORE_ID` | every user graded `never` |
| Credits per line | the legacy `by_user_analytic` table | card reads "unavailable" (`creditsPerLine: null`) |

Rollback is the same image path with the previous tag. `EXISTING_VPC_ID` still
applies to any *future* CDK deploy you make: pin whatever VPC your stacks were
originally created against, or `NetworkStack` synthesizes a new one and
CloudFormation replaces every security group and target group. That trap is not
specific to this upgrade — see `docs/runbooks/production-deploy.md`.

## [1.5.0] - 2026-07-18

### Added

- **Dark/light theme switching** — 다크/라이트 toggle in the sidebar (default
  dark, persisted in `localStorage`, pre-hydration bootstrap so there is no
  flash). Tailwind v4 palette override: `html.light` remaps the color
  variables so components keep their dark-first classes; charts read
  `useChartTheme()` for the colors CSS variables cannot reach. See ADR-0005.
- **NanumSquare font** — self-hosted woff2 (weights 300/400/700/800, OFL
  license) loaded via `next/font/local` and wired into the Tailwind v4 sans
  stack; no runtime CDN dependency behind CloudFront.
- **Follow-up suggestion chips in the chat widget** — after an answer
  completes, the floating widget now shows quick-prompt suggestions as a
  horizontally scrollable chip row above the composer (previously
  page-variant only).
- **Mobile responsive layout** — below 768px the sidebar becomes an
  off-canvas drawer with a fixed hamburger top bar, the chat widget expands
  to a full-screen sheet (drag disabled), and grids/tables/filter rows
  across all 12 dashboard pages stack or scroll instead of overflowing.
  Desktop rendering at `md+` is unchanged.
- **CloudFront custom domain support** — optional `CUSTOM_DOMAIN` +
  `CUSTOM_DOMAIN_CERT_ARN` deploy vars add the distribution alias + ACM
  certificate and whitelist the domain on the Cognito app client (the edge
  auth derives `redirect_uri` from the request Host header). Live at
  `kirodashboard.whchoi.net`.

### Fixed

- **Chat scroll hijack** — the conversation no longer yanks to the bottom on
  every streamed chunk; auto-follow only runs while the user is pinned to
  the bottom (`lib/chat-scroll.ts` stick-to-bottom helper), and the view
  re-bottoms when the suggestion chip row appears at stream end.
- **Cognito `redirect_mismatch` on the custom domain** — accessing the CNAME
  showed Cognito's "An error was encountered with the requested page"
  because the domain was missing from the app client callback whitelist.
- iOS Safari focus auto-zoom on the chat composer (16px input below `md`).
- Chat launcher stacked above modal backdrops — moved below the drawer and
  user-detail panel so it dims and is inert while they are open.
- Body scroll-through behind the open mobile drawer and chat sheet;
  drawer footer (locale switcher, version link) clipped behind mobile
  browser toolbars.
- **Client-side "Application error" crashes on error API payloads** — pages
  that stored an `{ error }` response then read `data?.prop.length`/`.map`
  crashed (optional chaining stops at `prop`, so the terminal access threw).
  Guarded across `/engagement`, `/credits`, `/adoption`, `/model-usage`, and
  the user-detail panel.
- **Login self-heal** — the Lambda@Edge callback auto-retries once (via an
  `auth_retry` cookie) when Cognito rejects the token exchange
  (`invalid_grant`/`invalid_request`, a code↔PKCE-verifier mismatch) instead
  of dead-ending on "Authentication failed"; the `state`→return-path decode
  is hardened against open redirect (same-origin path only). See ADR-0006.

## [1.2.0] - 2026-07-18

### Added

- **Chatbot Agent** — global floating chat widget (structure borrowed from
  claude-code-dashboard): draggable panel available on every page, backed
  by the existing `/api/analyze` Bedrock agent (Athena SQL + IdC lookup
  tools), multi-turn history with a 12-turn cap, stop/new-chat controls.
  The `/analyze` page and the widget now share `lib/useChatStream.ts` and
  the `app/components/chat/` component set.
- **AI analysis export** — completed answers on `/analyze` can be saved as
  Markdown (`.md` download with question/date header) or PDF
  (`html2canvas-pro` + `jspdf` DOM capture — Korean text and dark-theme
  tables render intact; libraries load on demand).
- `EcsDashboardConfig` prop on `EcsStack` so forks can override every
  account-specific env (S3 buckets, Glue database/table, IdC store, report
  prefix) without editing the source. Maintainer defaults unchanged.
- Opt-in `KiroDashboardCatalog` CDK stack that provisions the Glue database
  and `user_report` external table over a fork-owned S3 bucket. Activated by
  setting `ATHENA_DATA_BUCKET_NAME` at `cdk deploy` time.
- `infra/sql/user-report-table.sql` — manual DDL alternative to the opt-in
  Catalog stack.
- README + `.env.example` now document the Kiro User Activity Report
  prerequisite and every CDK-time override env var.
- `.env.deploy.example` template (git-ignored as `.env.deploy`) bundles
  every CDK-time env var in one place so operators can
  `cp .env.deploy.example .env.deploy` → `set -a; source .env.deploy; set +a`
  → `cdk deploy` instead of repeating long `export` blocks at the
  command line.
- Sidebar footer now displays the app version (`v1.1.0`), read from
  `package.json` via `lib/version.ts`. A new `version-sync` test keeps
  `package.json`, `CHANGELOG.md` (both languages), `CLAUDE.md`, and the
  sidebar display in lockstep. The footer links to the new `/changelog` page.
- **Executive** menu (`/exec`) — one-page leadership snapshot composing
  existing APIs: KPI cards, daily active users & credits, model share,
  credits by tier, top credit users.
- **Subscription & Overage** menu (`/subscription`, `/api/subscription`) —
  tier mix (users/credits/messages per `subscription_tier`), tier credit
  share, and an overage governance watchlist (per-user
  `overage_credits_used` vs `overage_cap` utilization).
- **New Users & Adoption** menu (`/adoption`, `/api/adoption`) — daily new
  users (UAR `New_User` flag), active users, cumulative-user trend, and a
  recent-new-users table. Reads CSVs S3-direct with header-name parsing
  because OpenCSVSerDe positional mapping makes the late-appended
  `new_user` column unsafe to query through Athena.
- **Dev Activity Detail** menu (`/dev-activity`, `/api/dev-activity`) —
  five legacy `by_user_analytic` groups previously unused by the
  dashboard: TestGen, DocGen, Transform, InlineChat, CodeFix (events,
  generated vs accepted lines, acceptance rate, daily trend, top users).
- **Changelog** page (`/changelog`) — renders this bilingual file at build
  time (`force-static`), styled version cards with Added/Changed/Fixed
  groups; language follows the KO/EN switcher.
- `lib/uar-s3.ts` — shared UAR S3 helpers (bucket/prefix resolution,
  month-prefix parallel listing, CSV parsing) extracted from the
  model-usage route and reused by `/api/adoption`.

### Performance

- `/api/model-usage` dropped from ~20s to ~1.6s: the per-day sequential
  `ListObjectsV2` loop (90 cross-region round trips) was replaced with
  parallel month-prefix listing plus a date-window filter, with S3
  pagination now handled.

### Fixed

- Dashboard API routes (`/api/users`, `/api/trends`, `/api/credits`,
  `/api/engagement`, `/api/productivity`, `/api/metrics`, `/api/client-dist`)
  no longer surface a 500 when the underlying Glue table does not exist
  yet. They detect missing-table errors via `isMissingTableError` and
  return a 200 with an empty but well-shaped payload, so fresh accounts
  render empty tables instead of an "Application error" crash page.
- `app/users/page.tsx` and `app/trends/page.tsx` additionally gained
  `Array.isArray` guards around API responses to prevent `.map()` TypeErrors
  if any future route regresses to returning `{ error }`.
- `app/api/analyze/route.ts` system prompt no longer embeds the maintainer's
  `whchoi01-titan-q-log` bucket or `d-90663be888` IdC store. It now reads
  `ATHENA_DATABASE` + `ATHENA_OUTPUT_BUCKET` from the environment and tells
  the LLM to normalize any `d-xxxxxxxxxxxx.` prefix generically.
- `app/api/model-usage/route.ts` no longer falls back to the maintainer's
  `q-user-log/AWSLogs/120443221648/...` prefix when `S3_REPORT_PREFIX` is
  unset. Missing bucket/prefix now returns an empty-but-valid payload
  instead of issuing S3 calls against the wrong account.
- New regression test `tests/api/hardcode-audit.test.ts` fails the CI if
  any runtime file under `app/` or `lib/` mentions the maintainer bucket
  or account id again.
- `infra/cdk.json` no longer hardcodes `useExistingVpc=true` /
  `vpcId=vpc-005338aca7ac5fb96` (maintainer's VPC). Default is now
  "create a fresh 10.254.0.0/16 VPC" so a fresh-account `cdk deploy`
  no longer fails VPC lookup. Operators that want to reuse an
  existing VPC can set `EXISTING_VPC_ID` / `VPC_CIDR` — `bin/app.ts`
  feeds them into CDK context.

## [1.1.0] - 2026-04-24

### Added

- Lambda@Edge + Cognito PKCE authentication at CloudFront Viewer Request level, replacing NextAuth.js
- Lambda@Edge function with JWT validation (`aws-jwt-verify`), PKCE flow, token refresh, and HttpOnly cookie management
- SSM Parameter Store config loader (us-east-1) for Lambda@Edge with cold-start caching
- CDK `EdgeFunction` construct with esbuild bundling and cross-region deployment to us-east-1
- `AwsCustomResource` for SSM config writes and Cognito callback URL updates post-deploy
- Public Cognito `EdgeAuthClient` (no client secret) for Lambda@Edge PKCE compatibility
- Server-side data masking for all user identifiers via `lib/mask.ts` — first 2 characters shown, rest replaced with `*`
- Logout menu in sidebar with `/auth/logout` link (Lambda@Edge clears cookies and redirects to Cognito logout)
- Model Usage analysis page with AI model distribution pie chart, Auto vs Manual comparison, daily trend, and per-user model preference table
- `/api/model-usage` endpoint reading S3 CSV files directly for dynamic `{Model_name}_Messages` columns (bypasses Glue OpenCSVSerDe positional mapping limitation)
- `overage_cap` field added to `UserReport` TypeScript interface (was in Glue table but missing from types)

### Changed

- CDK infrastructure expanded from 4 to 5 stacks (`KiroDashboardEdgeLambda` auto-created in us-east-1)
- CdnStack rewritten to include Lambda@Edge, SSM config, and Cognito callback URL management
- SecurityStack updated with EdgeAuthClient UserPoolClient
- User identity resolution (`lib/identity.ts`) now returns masked values for displayName, email, username, organization
- All user-facing API routes (users, credits, productivity, user-detail, idc-users) return masked identifiers

### Removed

- NextAuth.js dependency and configuration (`lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`)
- Custom login page (`app/login/page.tsx`) — replaced by Cognito Hosted UI
- `NEXTAUTH_URL` and `NEXTAUTH_SECRET` environment variables

## [1.0.0] - 2026-04-21

### Added

- Full-stack Next.js 14 dashboard with 7 pages: Overview, Users, Trends, Credits, IDE Productivity, Engagement, AI Analysis
- 12 API routes querying Athena (user_report + by_user_analytic tables) with UserId prefix normalization
- AI-powered natural language analysis via Amazon Bedrock Claude Sonnet 4.6 with tool use (query_athena, lookup_users)
- React-markdown + remark-gfm rendering for AI analysis responses with custom dark theme components
- Identity Center integration displaying 45 IdC users with active/inactive status, display names, emails, and organizations
- User detail drill-down panel with daily activity breakdown and client type analysis
- IDE Productivity page using 46-column legacy by_user_analytic report (chat, inline completion, dev agent, code review, test/doc generation)
- Date range filtering with 14 presets: 1m, 5m, 10m, 1h, 3h, 6h, 12h, 1d, 3d, 7d, 14d, 30d, 60d, 90d
- Animated Kiro ghost mascot with page-themed accessories (dashboard grid, user avatars, trend arrows, coins, code terminal, chat bubbles)
- Animated mini Kiro characters as sidebar navigation icons with per-page accent colors
- Korean/English bilingual interface with sidebar language toggle
- Kiro brand identity using official purple (#9046FF) color palette from kiro.dev
- Real Kiro ghost SVG character from img/kiro.svg applied across all components
- AWS CDK infrastructure with 4 stacks: Network (mgmt-vpc), Security (SG, Cognito), ECS (Fargate, ALB, ECR), CDN (CloudFront)
- Docker multi-stage build (node:20-alpine, ARM64) with standalone Next.js output
- ECS Fargate service with Auto Scaling (1-4 tasks, CPU 70% target)
- CloudFront distribution with X-Custom-Secret header validation for ALB security
- Cognito User Pool with Lambda@Edge PKCE authentication
- Client distribution pie chart with real Athena data (KIRO_IDE vs KIRO_CLI)
- Engagement funnel and user segmentation (Power/Active/Light/Idle tiers)
- Metric cards in AWSops dashboard style (semi-transparent dark, hover effects, font-mono values)
- Athena query pagination via NextToken for datasets exceeding 1,000 rows
- Claude Code project structure with hooks, skills, commands, agents, and documentation

### Fixed

- CDK cross-stack dependency cycle resolved by moving IAM roles to EcsStack
- ARM64 runtime platform mismatch (exec format error) fixed with runtimePlatform setting
- Next.js standalone binding fixed with HOSTNAME=0.0.0.0 environment variable
- Static prerendering issue fixed with force-dynamic export on all data pages
- Empty NEXTAUTH_URL fallback fixed by changing ?? to || operator
- Athena S3 write permission fixed by upgrading to S3FullAccess for query results
- SQL column name case mismatch fixed (PascalCase to lowercase matching Glue catalog)
- Subscription tier case normalization (POWER vs Power) with toUpperCase() mapping
- changeRates key mismatch between API response and frontend consumption
- Bedrock model ID corrected to global inference profile (global.anthropic.claude-sonnet-4-6)
- Bedrock IAM policy expanded to include inference-profile ARN pattern

[Unreleased]: https://github.com/whchoi98/kiro-dashboard/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/whchoi98/kiro-dashboard/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.2.0...v1.5.0
[1.2.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/whchoi98/kiro-dashboard/releases/tag/v1.0.0

---

# 한국어

이 프로젝트의 모든 주요 변경 사항은 이 파일에 기록됩니다.
이 문서는 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를 기반으로 하며,
[Semantic Versioning](https://semver.org/spec/v2.0.0.html)을 따릅니다.

## [Unreleased]

## [1.9.0] - 2026-07-30

1.8.0에서 시작한 메뉴 지연 개선 작업을 마무리합니다. 1.8.0은 없던 *피드백*을
고쳤지만(클릭 후 38ms에 강조 표시), 대기 시간 자체는 줄이지 않았고 그 이유를 함께
기록해 뒀습니다. 진짜 해결책이 선행 조건에 막혀 있었기 때문입니다. 이번 릴리스는 그
선행 조건을 처리한 뒤 해결책을 넣습니다.

### 추가

- **Athena 서버측 결과 재사용** — 1.8.0에서 "의도적으로 미룸"으로 기록했던 항목입니다.
  이것이 **차가운** Fargate 태스크를 돕는 유일한 수단입니다. 1.8.0의 메모는 태스크별이라
  배포나 스케일아웃 직후 첫 클릭은 여전히 Athena 지연을 온전히 지불했습니다. 재사용은
  모든 태스크가 공유합니다.
  - 1.8.0이 "타협 불가"라고 못박은 순서대로 넣었습니다. 리터럴 없이 재사용부터 켜면
    효과가 없기 때문입니다. **1단계:** 모든 Athena 라우트가 새 `lib/athena-window.ts`의
    명시적 날짜 리터럴을 보간합니다(`user_report`의 문자열 비교 `YYYY-MM-DD`에는
    `isoDateLiteral`, `DATE_PARSE`가 타임스탬프를 반환하므로 `DATE '…'`가 필요한
    `by_user_analytic`에는 `buaDateLiteral`). 라우트 파일 14개. **2단계:**
    `MaxAgeInMinutes: 60`인 `ResultReuseByAgeConfiguration`, 킬 스위치는
    `ATHENA_RESULT_REUSE`(`0`이면 비활성).
  - 메모를 끈 상태에서 동일한 SQL로 재사용 플래그만 바꿔 실측: **100,304바이트 /
    808ms → 0바이트 / 242ms**, 이어서 0바이트 / 384ms. 종단 간으로
    `/api/metrics?days=90`이 **2.17초 → 1.07초**가 됐습니다.
  - `MaxAgeInMinutes`는 1440이 아니라 60입니다. `/api/analyze`는 LLM이 작성한 SQL이
    자체적으로 기간을 계산하므로, 1시간이면 그런 결과가 최신 02:00 UTC 리포트보다
    앞설 수 있는 범위를 제한합니다.
  - 날짜 계산은 `getUTC*`만 사용하고 `nowMs`를 인자로 받으므로, fake timer 없이
    00:00 UTC 경계를 테스트할 수 있습니다. 또한 Athena의 `CURRENT_DATE`, 메모의
    `utcDayStamp`와 같은 순간에 넘어갑니다. 인접한 두 기간을 만드는 핸들러는 시계를
    **한 번만** 읽습니다(`metrics/route.ts`). 두 번 읽으면 자정을 걸쳐 두 기간 사이에
    하루 구멍이 생길 수 있습니다.
  - 킬 스위치는 `Enabled: false`를 보내는 것이 아니라 설정 키 자체를 **생략**하므로,
    롤백 시 요청이 재사용 도입 이전과 바이트 단위로 동일합니다.
  - `tests/api/date-literal-audit.test.ts`가 모든 `app/api/**/route.ts`를 디스크에서
    읽어 `CURRENT_DATE`나 `DATE_ADD`가 있으면 실패합니다(`/api/analyze`는 예외).
    이 실패 양상은 텍스트적이어서 기능 테스트로는 보이지 않습니다 — 쿼리 문자열은
    그대로이고, 기간이 움직였다는 사실은 엔진만 알기 때문입니다.

### 수정

- **문서에 적혀 있던, 실재하지 않는 캐시 히트 신호.** `lib/CLAUDE.md`에는
  `ResultReuseInformation.ReusedPreviousResult`가 "이 계정에서 채워지는 것이 확인됨 —
  `DataScannedInBytes === 0`으로 히트를 추론하지 말 것"이라고 적혀 있었습니다. 사실은
  그 반대입니다. 이 계정에서 `GetQueryExecution`은 모든 실행에서
  `ResultReuseInformation: null`을 반환하며, 확인된 히트(0바이트 스캔, 3배 빠름)에서도
  마찬가지입니다. 그 필드에 기반한 모니터나 테스트는 재사용이 정상 동작하는 동안
  고장났다고 보고했을 것입니다.
- **`app/api/CLAUDE.md`의 라우트 템플릿이 금지된 패턴을 가르치고 있었습니다.**
  복사·붙여넣기용 예시가 `DATE_ADD(… CURRENT_DATE)`를 사용했는데, 이는 새 감사
  테스트가 거부하는 형태입니다. 즉 문서가 안내하는 방식대로 엔드포인트를 추가하면
  빌드가 실패했을 것입니다.

## [1.8.0] - 2026-07-29

메뉴 전환 지연 개선 작업입니다. 사용자가 보고한 증상은 사이드바 메뉴를 클릭하면
"멈칫한다"는 것이었습니다. 작업을 시작할 때 세운 진단 4건 중 2건은 측정 결과
사실이 아니어서 구현하지 않고 폐기했으며, 아래는 측정이 뒷받침한 내용만 담았습니다.

### 추가

- **클릭한 사이드바 항목이 즉시 강조됩니다.** 이것이 체감 지연의 실제 원인이었습니다.
  강조 표시는 `usePathname()`에서 파생됐는데, 이 값은 라우트 전환이 *커밋될 때만*
  갱신됩니다. `/`는 유일한 동적 렌더링 라우트이므로, 클릭해도 모든 Athena 쿼리가
  끝날 때까지 화면에서 아무것도 움직이지 않았습니다 — 페이지도, 심지어 메뉴 강조도.
  실제 빌드에서 측정: 첫 시각적 피드백이 **2621ms 동안 전무**했던 것에서
  **38ms**로 바뀌었습니다.
  - 상태 기계는 `lib/nav-state.ts`에 있습니다. `active`가 `pending`을 이기므로
    남아 있는 pending href가 이미 커밋된 라우트를 계속 깜빡이게 만들 수 없습니다.
    현재 라우트를 다시 탭하면 아무것도 기록하지 않습니다 — 전환이 없으면 그것을
    지워 줄 것도 없기 때문입니다. 커밋 없이 끝나는 전환(RSC 요청 실패, 도중에 뒤로
    가기)은 10초 상한이 흡수합니다. 영원히 깜빡이는 것은 피드백이 없는 것보다
    더 나쁜 거짓입니다.
  - 항목은 `<Link>`를 유지해 Next의 prefetch를 보존합니다. 정적 생성된 13개
    라우트가 즉각적으로 느껴지는 이유가 바로 이 prefetch입니다.
- **로딩 스켈레톤 하나를 두 경로가 공유합니다** —
  `app/components/ui/PageSkeleton.tsx`이며, 모양과 정책은 `lib/skeleton-layout.ts`에
  있습니다. *첫 로드에만* 표시됩니다. 기간(`days`) 드롭다운을 바꿀 때는 이미 표시된
  숫자를 비우지 않고 그대로 둡니다.
- **`/` 전용 로딩 경계** — URL 세그먼트를 추가하지 않는 `app/(overview)/` 라우트
  그룹으로 범위를 한정했습니다. 정적 생성된 형제 13개 페이지에서는 이 스켈레톤이
  전혀 그려지지 않고 prefetch 페이로드도 그대로임을 브라우저로 확인했습니다.
  `/`의 prefetch는 80바이트 스텁에서 로딩 청크를 참조하는 5474바이트로 바뀌었습니다.
- **Athena 결과 메모** (`lib/query-cache.ts`) — `executeQuery` 뒤에 붙으며,
  `(UTC 날짜, SQL)`을 키로 하고 동시 호출을 하나로 합칩니다(single-flight).
  이것이 안전한 이유는 단 하나의 도메인 사실입니다: Kiro 리포트는 매일 02:00 UTC에
  한 번 도착하므로, 60초 전 답변이 이미 최대 24시간 지난 원본보다 더 낡을 수는
  없습니다. 모든 상한값은 환경변수로 끌 수 있습니다.
- **IdentityStore 디렉터리 스냅샷 캐시** (1시간). `resolveUserDetails`는 호출마다
  디렉터리 전체를 순회했고 19개 라우트 중 10개가 이를 호출하므로, Overview 한 번
  로드에 전체 순회를 6번 지불했습니다 — 형제 함수인 `resolveUsernames`는 처음부터
  캐시를 갖고 있었는데도 말입니다.

### 수정

- **`/api/ingest-health`가 새 메모 때문에 낡은 행을 반환하고 있었습니다.** 이 라우트는
  리포트 신선도 감시기이므로, 처음 본 값에 고정되는 것은 절대 하면 안 되는 단 하나의
  일입니다. 두 쿼리 모두 캐시를 우회하도록 했습니다.
- **Overview 서버 컴포넌트가 3단계로 순차 호출**하면서 Athena 왕복 2회를 전환 지연에
  그대로 더하고 있었습니다. 이제 6개를 하나의 `Promise.all`로 묶습니다:
  **7.5초 → 2.7초**.
- **`/users`가 같은 엔드포인트를 두 번 호출**했습니다(`limit=10`과 `limit=100`).
  상위 10명 목록은 이제 100행 결과에서 파생합니다.
- **`OverviewClient`가 API 실패 시 클라이언트 분포를 조작해 냈습니다** — 아무도
  측정하지 않은 60/25/15 비율이 하드코딩돼 있었습니다. 제거하고 서버 컴포넌트와
  동일하게 빈 값으로 대체합니다.
- **라이트 모드에서 pending 메뉴 강조가 읽히지 않았습니다.** 흰 사이드바 위의
  `bg-[#9046FF]/70`은 레이블 대비가 2.88:1이고, `animate-pulse`가 이를 약 1.65:1까지
  끌어내려 사용자가 방금 클릭한 항목이 가장 안 보이는 항목이 됐습니다. 보라색을
  불투명으로 바꿨습니다(라이트 4.66:1 / 다크 7.64:1).
- **12개 페이지에서 스켈레톤이 거의 보이지 않았습니다.** 기존 재조회용 `opacity-50`
  래퍼 안에서 렌더되는데, CSS 투명도는 하위 트리 전체에 곱해지므로 스켈레톤 자신의
  `animate-pulse`와 겹쳐 0.25까지 떨어졌습니다 — 배경과 255단계 중 약 5단계 차이입니다.
  이제 어둡게 처리는 `pageBodyOpacityClass(loading, hasData)`가 결정하며, 스켈레톤
  표시와 상호배타적입니다.
- **메뉴 항목을 Cmd/Ctrl+클릭하면 유령 강조가 10초 동안 깜빡였습니다.** Next는 이동
  여부를 결정하기 *전에* `onClick`을 호출하고 수정키 클릭에서는 이동을 건너뛰므로,
  현재 문서는 전환되지 않고 pending 상태를 지워 줄 것도 없었습니다.
- **쿼리 메모의 메모리 상한이 주석에서 과장돼 있었습니다.** 엔트리당 행 상한은 엔트리
  개수 상한과 곱해집니다(200 × 20,000 ≈ 400만 행 ≈ 1024 MiB 태스크에 대해 약 13 GB).
  도달 가능한 경로는 `/api/analyze`입니다 — LLM이 작성한 SQL을 같은 메모로 흘려보냅니다.
  이제 누적 합계로 제한합니다(`ATHENA_QUERY_CACHE_MAX_TOTAL_ROWS`, 기본 50,000 ≈ 170 MiB).

### 변경

- **Athena 폴링 간격을 `150 → 300 → 500ms`로 올리고 500에서 멈춥니다.** 이것은
  의도적으로 백오프가 *아닙니다*: 이 쿼리들은 약 1~3초에 끝나고 완료 감지는 평균
  한 구간 늦으므로, 기존 고정값 500ms보다 큰 간격은 오히려 완료를 *더 늦게*
  감지합니다. 기존 값이 천장이므로 어떤 쿼리도 이전보다 느려지지 않습니다. 누군가
  이 상한을 올리면 테스트가 실패합니다.

### 하지 않은 것 (누락이 아님을 남기기 위해 기록)

- **Athena 서버측 결과 재사용**은 여기서 초 단위 이득이 가장 큰 항목이지만 의도적으로
  뒤로 미뤘습니다. 라우트 SQL이 `CURRENT_DATE` 사용을 멈추기 전까지는 효과가 없음이
  증명됩니다. 실측: `CURRENT_DATE` 쿼리는 연속 두 번 모두 100,304바이트를 스캔했고,
  명시적 날짜 리터럴로 바꾸자 100,304 → 0바이트가 됐습니다. 재사용만 먼저 넣으면
  성능 개선처럼 보이면서 실제로는 아무것도 바뀌지 않습니다.
  *(1.9.0에서 완료. 여기 원래 인용됐던 `ReusedPreviousResult: false`/`true`
  값은 틀렸습니다 — 이 계정에서 그 필드는 null입니다.)*
- **제안된 최적화 2건은 측정 결과 회귀여서 기각**했습니다(건너뛴 것이 아닙니다):
  폴링 백오프 추가(위에서 설명한 대로 지배적인 경우에서 더 느려짐), 그리고
  `GetQueryResults`에 `MaxResults` 설정(생략하는 것이 이미 가장 큰 페이지를 받아
  왕복 횟수가 가장 적습니다).
- 이 메모는 **Fargate 태스크별이며 새 태스크마다 비어 있습니다.** 따라서 배포 직후나
  스케일아웃 직후 첫 클릭은 여전히 Athena 지연을 온전히 지불합니다. 이 작업은 첫 방문
  지연이나 배포 직후 지연을 해결하지 않습니다.

## [1.7.0] - 2026-07-29

### 추가

- **사이드바 하단의 버전 배지를 클릭하면 현재 빌드의 릴리스 노트가 열립니다.**
  기존에는 `/changelog`로 이동하는 링크였고, 이제는 현재 버전의 섹션만 보여주는
  다이얼로그를 여는 버튼입니다. 이전 버전은 `/changelog#v{version}`으로 딥링크되는
  히스토리 칩으로 제공합니다. 신규 엔드포인트 `GET /api/release-notes`. Escape로
  닫히고, 포커스는 닫기 버튼으로 이동하며, 열려 있는 동안 본문 스크롤이 잠깁니다.
  - `CHANGELOG.md`는 읽지 않고 **import**합니다. `next.config.js`가 webpack
    `asset/source` 규칙으로 매핑해 빌드 시점 문자열로 인라인합니다. 여기서
    `readFileSync`를 쓰면 **모든 요청이 실패**합니다 — `output: 'standalone'`은
    `public/`과 `.next/`만 포함하고 마크다운은 넣지 않습니다. (`/changelog`
    페이지가 파일 읽기로 버티는 이유는 `force-static`이 빌드 시점에 실행되기
    때문입니다.)
  - 블록 렌더링을 `app/components/ui/ChangelogBlocks.tsx`로 분리해 `/changelog`와
    다이얼로그가 공유합니다. 복사했다면 v1.6.1의 굵게/코드펜스/표 수정이 한쪽에서만
    되돌아갈 수 있었습니다.
  - 다이얼로그는 파서를 import하지 않고 HTTP로 섹션 하나만 받아옵니다. 두 언어
    마크다운 약 50KB가 모든 페이지의 클라이언트 번들에 들어가는 것을 막습니다.
- **사용자 상세 패널에 사용자별 AI 모델 사용 통계를 추가했습니다.** 사용자를
  선택하면 모델 구성비를 보여줍니다 — 100% 너비 누적 바, 주 사용 모델, 사용 모델
  수, 모델별 메시지 수와 비율, 그리고 `Client_Type`이 둘 이상일 때는 클라이언트별
  분해까지. 신규 엔드포인트 `GET /api/user-model-usage`.
  - Athena가 아니라 S3의 UAR CSV를 직접 읽습니다. `{model}_messages` 컬럼이
    동적이고 OpenCSVSerDe는 위치 기반으로 매핑하기 때문입니다(ADR-0004). 패널의
    Athena 기반 `/api/user-detail`과 **별도로** 요청하므로, S3 문제가 생겨도 카드
    하나만 실패하고 패널 전체가 비지 않습니다.
  - 0으로 보이는 **세 가지 상태를 구분**합니다 — S3 환경변수 미설정, 리포트에 모델
    컬럼이 아예 없음, 사용자가 실제로 메시지를 보내지 않음. 하나의 "데이터 없음"으로
    합치면 아무도 측정하지 않은 사실을 단정하게 됩니다.
  - 모델 색상은 목록상의 순서가 아니라 모델 **이름**에서 파생합니다(고정 팔레트에
    djb2 해시, `lib/model-colors.ts`). 모델 집합은 계속 늘어나므로, 인덱스 기반
    팔레트라면 순위가 바뀔 때마다 모든 계열의 색이 바뀝니다.

### 수정

- **UI 언어를 영어로 바꿔도 AI 분석이 한국어로 출력되던 문제.** Bedrock 시스템
  프롬프트에 `Use Korean for analysis reports`가 하드코딩되어 있었고, locale이
  클라이언트를 벗어난 적이 없었습니다. LLM의 출력 언어는 `t()`로 해결할 수 없습니다
  — `t()`는 우리가 직접 작성한 문자열만 번역합니다. 이제 locale이 클라이언트 →
  요청 본문 → 시스템 프롬프트로 전달됩니다.
  - 언어 규칙은 프롬프트의 **맨 마지막**에 붙입니다. 모델은 마지막 지시를 가장
    무겁게 반영하므로, 도구 실행 결과와 컬럼 라벨이 한국어여도 영어 답변이
    유지됩니다.
  - locale은 리터럴 `LANGUAGE_RULE` 레코드를 **색인**하는 데만 쓰이고 프롬프트
    텍스트에 보간되지 않습니다. 요청 본문이 프롬프트 인젝션 경로가 되지 않습니다.
  - Markdown 내보내기 헤더(제목/생성일/질문 라벨)도 같은 방식으로 한국어가
    고정되어 있었고, 이제 현재 언어를 따릅니다.
- **`/api/release-notes`가 모든 언어에 한국어 노트를 반환하던 문제.**
  `force-static`이었고, Next.js는 그런 라우트를 한 번만 프리렌더하면서 핸들러에
  **빈** `searchParams`를 전달합니다. 그래서 `?locale=en`이 조용히 `ko` 기본값으로
  떨어지고 한국어 응답이 빌드 산출물에 그대로 구워졌습니다. 이제 `force-dynamic`이며
  파싱 결과를 언어별로 메모이즈합니다.

### 변경

- `/api/analyze`의 시스템 프롬프트를 라우트에서 `lib/analyze-prompt.ts`로
  옮겼습니다. Next.js는 `route.ts`의 export를 정해진 목록과 대조해 타입 검사하므로,
  라우트에서 헬퍼를 export하면
  `Type '(value: unknown) => AnalyzeLocale' is not assignable to type 'never'`로
  빌드가 실패합니다. 이 오류 부류를 유닛 테스트 실패로 먼저 잡도록 구조 테스트를
  추가했습니다.
- `isModelColumn`, `prettifyModelName`, `normalizeUserId`를 `/api/model-usage`에서
  `lib/uar-s3.ts`로 올려 신규 라우트와 공유합니다. **`Total_Messages`도
  `_messages`로 끝나므로** 접미사 검사에는 항상 `total_messages` 제외를 함께 써야
  합니다. 복사본을 두는 것이 바로 그 짝이 한쪽에서만 어긋나는 경로입니다.

## [1.6.1] - 2026-07-29

### 수정

- **배포된 모든 이미지에서 `/changelog`가 "No changelog entries available"로
  렌더링되고 있었습니다.** `.dockerignore`에 포괄적인 `*.md`가 있었고,
  `.dockerignore`는 런타임 이미지만이 아니라 Docker *빌드 컨텍스트*를
  필터링합니다. 그래서 `/changelog`가 프리렌더에 사용하는 builder 스테이지에
  `CHANGELOG.md`가 아예 전달되지 않았습니다. 페이지의 `try/catch`가 빈 문자열로
  폴백하는 바람에 빌드는 계속 성공했고 실패는 드러나지 않았습니다. 제외 패턴
  뒤에 `!CHANGELOG.md`를 추가하고(Docker는 마지막으로 일치하는 패턴을 적용),
  파일 읽기의 예외 처리를 제거했습니다. 필수 빌드 입력이 없으면 빈 페이지를
  내보내는 대신 빌드가 실패해야 합니다.
- `tests/structure/changelog-build-input.test.ts`가 양쪽을 모두 고정합니다 —
  재포함 패턴이 존재해야 하고 제외 패턴보다 *뒤에* 있어야 하며, 페이지가 다시
  `catch`를 들이지 않아야 합니다.
- **`/changelog`가 굵게 표시 기호를 별표 그대로 출력하고, 코드 블록을 한 줄
  산문으로 뭉개고, 표를 `|` 파이프 문자로 그대로 보여주고 있었습니다.** 항목이 단순
  불릿뿐일 때는 문제가 없었지만 1.5.0 업그레이드 가이드가 세 가지를 모두
  추가했습니다. 이제 굵게, 코드 블록(`<pre>`), 파이프 표를 처리합니다.
- **`/changelog`가 문단과 불릿이 섞인 항목의 순서를 뒤바꿨습니다.** 파서가
  `paras`와 `items`를 별도 배열로 유지하고 모든 문단을 모든 불릿보다 먼저
  렌더링했기 때문에 원본 순서가 조용히 사라졌습니다. 이제 블록을 하나의 순서
  있는 목록으로 유지합니다. 코드 블록은 닫는 펜스까지 통째로 소비하므로 bash
  안의 `#` 주석이나 `- ` 줄이 더 이상 제목이나 불릿으로 파싱되지 않습니다.

### 변경

- 변경 이력 마크다운 파싱을 `app/changelog/ChangelogClient.tsx`에서
  `lib/changelog-md.ts`로 분리했습니다. Jest는 `*.test.ts` 파일만 수집하므로
  `.tsx` 컴포넌트 내부 로직은 테스트할 수 없습니다 — `lib/chat-scroll.ts`가
  `ChatPanel`과 분리된 것과 같은 이유입니다. 이제
  `tests/lib/changelog-md.test.ts`가 실제 `CHANGELOG.md`를 두 언어 모두로
  파싱합니다. 시도한 뮤테이션 2종(코드 펜스 처리 제거, 표 처리 제거) 각각이 7개
  단정을 실패시킵니다 (101 → 125개 테스트, 18개 스위트).

## [1.6.0] - 2026-07-29

Kiro 공식 문서 4종(IDE 사용자 활동, CLI 사용자 활동, 프롬프트 로깅, 콘솔
대시보드)을 다시 정독한 결과를 반영했습니다. 이 4개 페이지는 이제 `CLAUDE.md`와
`docs/kiro-user-activity-report-schema.md`에 프로젝트의 참조 계약으로
기록되어 있습니다.

### 추가됨

- **`/rollout` — 클라이언트 롤아웃 및 교차 사용 현황.** `Client_Type`별 일간
  활성 사용자와 누적 도입자, IDE 전용 / CLI 전용 / 양쪽 사용 세그먼트,
  사용자별 두 번째 클라이언트 도입 지연(pickup lag) 테이블. 이 계정에서
  `user_report`의 컬럼 중 실제로 여러 값을 갖는 것은 `Client_Type` 뿐이므로,
  데이터가 답할 수 있는 유일한 롤아웃 질문입니다. Athena/Presto가
  `COUNT(DISTINCT …) OVER (ORDER BY …)`를 거부하기 때문에 누적 곡선은 (사용자,
  클라이언트) 쌍별 `MIN(date)`를 JS에서 누적해 계산합니다. 조회 기간의 첫날에
  처음 나타난 사용자의 pickup lag은 `0`이 아니라 `null`입니다 — 좌측 절단된
  이력에서는 "같은 날 둘 다 도입"과 "그 이전을 볼 수 없음"을 구별할 수 없기
  때문입니다.
- **`/ingest-health` — 리포트 전달 및 신선도 모니터.** 최신 리포트 날짜, S3
  객체 기록 시각, 리포트 지연, 날짜 × 클라이언트 전달 매트릭스, 헤더 변형
  그룹화, Athena ↔ CSV 행 수 대조, 레거시 컬럼 계측 현황. 매트릭스는 의도적으로
  두 가지 상태만 가집니다: Kiro는 그날 활동이 있었던 클라이언트 타입에 대해서만
  CSV를 쓰고 기대 파일 수를 공개하지 않으므로, 데이터만으로는 "파일 없음"과
  "전달 실패"를 구별할 수 없습니다. 주말마다 켜지는 주의(amber) 상태는 운영자가
  이 페이지를 무시하도록 학습시킬 뿐입니다.
- **개요 페이지의 디렉터리 사용자 활동 등급** — 5개 휴면 구간(7일 이내 / 8~30일
  / 31~60일 / 60일 초과 / 활동 없음)과 디렉터리 → 활동 있음 → 지속 활동(5일
  이상) 전환, 사용자별 활동 일수·경과일 컬럼. IAM Identity Center 디렉터리
  사용자를 기준으로 산출하며, 디렉터리는 Kiro 구독 명부가 **아닙니다**(명부는
  `user-subscriptions:ListUserSubscriptions`뿐이며 태스크 역할에 부여되어 있지
  않음). 따라서 이 수치를 라이선스나 좌석으로 표현하지 않습니다.
- **`/productivity`의 수락 코드 라인당 크레딧** — 두 리포트가 겹치는 기간에
  대해 `user_report` 크레딧 ÷ (`chat_aicodelines` + `inline_aicodelines`).
  `by_user_analytic`의 541개 (사용자, 날짜) 쌍 중 303개가 `user_report`에 대응
  행이 없으므로 조인이 아니라 각각 독립적으로 합산합니다. 기간 경계는
  하드코딩하지 않고 데이터에서 읽습니다. Kiro가 크레딧→금액 환산율을 공개하지
  않으므로 통화 기호 없이 비율로만 표시합니다.

### 수정됨

- **레거시 수락률 분모 오류.** `/api/dev-activity`에서 DocGen 수락률이 라인
  *추가*분만으로 계산되어 `docgeneration_*lineupdates`가 분자·분모 양쪽에서
  빠져 있었고, InlineChat
  분모에서는 `inlinechat_*linedeletions` 3개 컬럼이 모두 누락되어 있었습니다.
  이제 accepted/rejected/dismissed 컬럼군 전체를 합산하며, 상위 사용자 수락
  라인 합계에도 빠져 있던 accepted 컬럼 2개가 반영됩니다.
- **한 번도 참조되지 않던 레거시 컬럼 노출.** `/api/productivity`가
  `chat_messagesinteracted`, `dev_generatedlines`, `dev_acceptanceeventcount`,
  `codereview_succeededeventcount`, `codereview_failedeventcount`를 집계하고
  최소 분모 가드를 거쳐 비율을 산출합니다. 이 계정에서는 레거시 리포트의 44개
  지표 컬럼 중 39개가 모든 행에서 문자열 `0`이므로, 확신에 찬 `0.0%` 대신
  `null`을 반환해 "계측되지 않음"으로 표시합니다.
- **`/api/idc-users`가 Glue 테이블 부재 시 500을 반환하지 않습니다.** 카탈로그가
  프로비저닝되지 않은 경우 전체 목록 조회를 실패시키는 대신 모든 디렉터리
  사용자를 "활동 없음"으로 등급화합니다. 다른 라우트가 이미 갖고 있던
  `isMissingTableError` 폴백과 동일한 동작입니다.

### 변경됨

- `app/page.tsx`와 `OverviewClient.tsx`가 각자 로컬 중복 정의를 두는 대신
  `types/dashboard.ts`의 `IdcUsersData`를 가져옵니다. 기존 중복 정의는 라우트가
  새로 반환하기 시작한 필드를 조용히 누락시켰습니다.
- **`/api/dev-activity`의 DocGen·InlineChat 수락률이 v1.5.0에서 보였던 값과
  달라집니다.** 데이터가 아니라 분모가 틀렸던 것이므로, 기존 수치는 DocGen은
  과대·InlineChat은 과소 표시되고 있었습니다. 마이그레이션할 것은 없지만 이
  변화를 회귀로 오인하지 마십시오.
- `tests/api/route-empty-responses.test.ts`가 `/api/rollout`, `/api/idc-users`,
  그리고 `/api/productivity`의 새 폴백 경로 2개를 커버합니다 (97 → 101개 테스트).

### 1.5.0에서 업그레이드하기

**인프라 변경은 필요하지 않습니다.** 이번 릴리스는 `app/`, `lib/`, `types/`,
`tests/`와 문서만 변경합니다. 운영 중인 v1.5.0 배포에 대해 `cdk diff`로 검증한
결과, `KiroDashboardNetwork`와 `KiroDashboardSecurity`는 "no differences"이고
Ecs/Cdn의 유일한 차이는 `crypto.randomUUID()`가 매 synth마다 새로 생성하는
`X-Custom-Secret`뿐입니다. **v1.6.x를 반영하려고 CDK를 배포하면 아무 이득 없이
이 시크릿만 회전됩니다** — 이미지 경로를 사용하세요.

**1.6.0이 아니라 1.6.1로 올라가세요.** 1.6.0은 `/changelog`가 빈 페이지로
빌드됩니다(위 1.6.1 항목 참고). 이 절의 나머지 내용은 두 버전에 모두 적용됩니다.

```bash
git pull                       # 또는 v1.6.1 태그를 브랜치에 머지
npx jest && npm run build      # 18 suites / 125 tests 예상

docker build -t kiro-dashboard .
ECR=<account>.dkr.ecr.<region>.amazonaws.com
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin "$ECR"
docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:1.6.1"
docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:latest"
docker push "$ECR/kiro-dashboard:1.6.1" && docker push "$ECR/kiro-dashboard:latest"

SERVICE=$(aws ecs list-services --cluster kiro-dashboard-cluster \
  --region <region> --query 'serviceArns[0]' --output text)
aws ecs update-service --cluster kiro-dashboard-cluster --service "$SERVICE" \
  --force-new-deployment --region <region>
aws ecs wait services-stable --cluster kiro-dashboard-cluster \
  --services "$SERVICE" --region <region>
```

`latest`뿐 아니라 버전 태그도 함께 붙이세요. `latest`만 있으면 롤백할 대상
이름이 남지 않습니다.

**그 밖에 할 일은 없습니다.** 아래 항목은 추정이 아니라 모두 확인했습니다.

- **새 의존성 없음.** `package-lock.json`은 v1.5.0과 바이트 단위로 동일하며,
  `package.json` 변경은 버전 문자열 하나뿐입니다. `npm ci`는 무해하지만 불필요합니다.
- **새 ECS 환경변수 없음.** 새 코드가 읽는 모든 키(`ATHENA_DATABASE`,
  `ATHENA_OUTPUT_BUCKET`, `GLUE_TABLE_NAME`, `IDENTITY_STORE_ID`,
  `S3_REPORT_PREFIX`, `S3_DATA_BUCKET`, `AWS_REGION`)가 이미 `EcsStack`에 있습니다.
- **새 IAM 권한 없음.** 새 라우트가 필요한 리포트 프리픽스에 대한
  `s3:GetObject`·`s3:ListBucket`과 `glue:GetTable`은 이미 태스크 역할에 부여되어
  있습니다.
- **CloudFront 동작 추가나 캐시 무효화 없음.** `CdnStack`은
  `CACHING_DISABLED`인 단일 캐치올 `defaultBehavior`만 선언하므로 `/rollout`과
  `/ingest-health`는 별도 설정 없이 서빙됩니다.
- **Dockerfile·Node·빌드 플래그 변경 없음** (`node:20-alpine`,
  `output: 'standalone'` 그대로).
- **i18n 키 삭제·이름 변경 없음** — 추가만 되었으므로 포크의 번역이 그대로 동작합니다.
- **사이드바 배선 불필요** — 내비게이션 항목과 `nav.rollout` /
  `nav.ingestHealth` 키가 같은 커밋에 포함됩니다.

**v1.5.0을 포크해 커스터마이즈한 경우** 두 가지를 확인하세요.

- `IdcUsersData`가 `types/dashboard.ts`로 이동했습니다. 포크가
  `app/page.tsx`나 `OverviewClient.tsx`에 있던 로컬 정의를 가져다 썼다면
  `import { IdcUsersData } from '@/types/dashboard'`로 바꾸세요. 삭제된 필드는
  없으며, 오히려 기존 중복 정의가 라우트의 반환 필드를 누락시키고 있었습니다.
- `/api/productivity`의 `summary`에 `number | null` 비율 4개와
  `creditEfficiency` 객체가 추가되었습니다. 기존 필드는 그대로이므로 새 키를
  무시하는 소비자는 영향이 없지만, 새 비율을 렌더링한다면 `null`을 `0`으로
  강제 변환하지 말고 "계측되지 않음"으로 처리해야 합니다.

**새 기능은 데이터가 생길 때까지 비어 있으며**, 실패가 아니라 degradation으로
동작합니다 — `isMissingTableError`가 형태가 온전한 빈 응답을 반환합니다.

| 기능 | 필요 조건 | 없을 때 |
|------|-----------|---------|
| `/rollout` | `user_report`에 `Client_Type` 값 존재 | 빈 차트, `dataStart: null` |
| `/ingest-health` | `S3_REPORT_PREFIX` + 리포트 버킷 list/read 권한 | `configured: false`, 빈 인벤토리 |
| 휴면 등급·퍼널 | v1.5.0의 `IDENTITY_STORE_ID` 외 추가 조건 없음 | 전원 `never`로 등급화 |
| 라인당 크레딧 | 레거시 `by_user_analytic` 테이블 | 카드가 "unavailable" (`creditsPerLine: null`) |

롤백은 이전 태그로 같은 이미지 경로를 반복하면 됩니다. `EXISTING_VPC_ID`는
*앞으로* CDK를 배포할 때 여전히 유효합니다 — 스택이 원래 생성된 VPC를 반드시
고정하세요. 그렇지 않으면 `NetworkStack`이 새 VPC를 합성하고 CloudFormation이
모든 보안 그룹과 타깃 그룹을 교체합니다. 이 함정은 이번 업그레이드에 국한된
것이 아닙니다 — `docs/runbooks/production-deploy.md` 참고.

## [1.5.0] - 2026-07-18

### 추가됨

- **다크/라이트 테마 전환** — 사이드바 다크/라이트 토글 (기본 다크,
  `localStorage` 저장, hydration 전 부트스트랩으로 깜빡임 없음). Tailwind v4
  팔레트 오버라이드 방식: `html.light`가 색상 변수를 재매핑하므로 컴포넌트는
  다크 기준 클래스를 그대로 유지; 차트는 CSS 변수가 닿지 않는 색상을
  `useChartTheme()`로 읽음. ADR-0005 참고.
- **나눔스퀘어 폰트** — woff2 4종(300/400/700/800, OFL 라이선스)을
  `next/font/local`로 셀프호스팅하고 Tailwind v4 기본 산세리프 스택에 연결.
  CloudFront 뒤에서 외부 CDN 런타임 의존 없음.
- **챗봇 위젯 후속 추천 질문** — 답변 완료 후 플로팅 위젯에도 입력창 위
  가로 스크롤 칩으로 추천 질문 표시 (기존에는 /analyze 페이지 전용).
- **모바일 반응형 레이아웃** — 768px 미만에서 사이드바가 햄버거 상단바 +
  오프캔버스 드로어로 전환, 챗봇 위젯은 풀스크린 시트로 확장(드래그
  비활성), 12개 대시보드 페이지의 그리드/테이블/필터 행 스택·스크롤 처리.
  `md+` 데스크톱 렌더링은 무변경.
- **CloudFront 커스텀 도메인 지원** — 배포 변수 `CUSTOM_DOMAIN` +
  `CUSTOM_DOMAIN_CERT_ARN`으로 배포판 별칭 + ACM 인증서 + Cognito 앱
  클라이언트 허용 URL을 코드로 관리 (edge 인증이 Host 헤더로
  `redirect_uri`를 생성). `kirodashboard.whchoi.net` 운영 중.

### 수정됨

- **챗봇 스크롤 하이재킹** — 스트리밍 청크마다 대화가 바닥으로 강제
  스크롤되던 문제 수정; 사용자가 바닥에 있을 때만 자동 추적
  (`lib/chat-scroll.ts` stick-to-bottom 헬퍼), 스트림 종료 시 추천 칩
  등장에 맞춰 재정렬.
- **커스텀 도메인 Cognito `redirect_mismatch`** — CNAME 접속 시 "An error
  was encountered with the requested page" 에러가 나던 문제 수정 (앱
  클라이언트 콜백 허용 목록에 도메인 등록).
- iOS Safari에서 챗봇 입력창 포커스 시 자동 확대 문제 수정 (`md` 미만
  16px 입력).
- 챗봇 런처가 모달 백드롭 위에 떠 있던 z-order 충돌 수정 — 드로어/사용자
  상세 패널이 열리면 런처가 어두워지고 비활성화.
- 모바일 드로어·챗봇 시트 뒤 페이지 스크롤 관통 차단; 모바일 브라우저
  툴바에 드로어 하단(언어 전환, 버전 링크)이 가려지던 문제 수정.
- **에러 페이로드에서 클라이언트 "Application error" 크래시** — `{ error }`
  응답을 저장한 뒤 `data?.prop.length`/`.map`을 읽으면 옵셔널 체이닝이
  `prop`에서 멈춰 뒤 접근이 예외를 던지던 문제. `/engagement`, `/credits`,
  `/adoption`, `/model-usage`, 사용자 상세 패널 전반에 가드 추가.
- **로그인 자기치유** — Cognito가 토큰 교환을 거부할 때
  (`invalid_grant`/`invalid_request`, 코드↔PKCE verifier 불일치) "Authentication
  failed"로 막다르지 않고 Lambda@Edge 콜백이 `auth_retry` 쿠키로 1회 자동
  재시도; `state`→복귀 경로 디코딩을 오픈 리다이렉트로부터 보호(same-origin
  경로만 허용). ADR-0006 참고.

## [1.2.0] - 2026-07-18

### 추가됨

- **Chatbot Agent** — 전역 플로팅 챗봇 위젯 (claude-code-dashboard 구조
  차용): 모든 페이지에서 사용 가능한 드래그 패널, 기존 `/api/analyze`
  Bedrock 에이전트(Athena SQL + IdC 조회 툴) 기반, 12턴 캡 멀티턴
  히스토리, 중지/새 대화 컨트롤. `/analyze` 페이지와 위젯이
  `lib/useChatStream.ts`와 `app/components/chat/` 컴포넌트를 공유.
- **AI 분석 내보내기** — `/analyze`에서 완료된 답변을 Markdown(질문/날짜
  헤더 포함 `.md` 다운로드) 또는 PDF(`html2canvas-pro` + `jspdf` DOM
  캡처 — 한글과 다크 테마 표가 그대로 렌더링, 라이브러리는 클릭 시
  로드)로 저장.
- `EcsStack`에 `EcsDashboardConfig` prop 도입 — 포크가 계정별 값(S3
  버킷, Glue DB/테이블, IdC 스토어, 리포트 프리픽스)을 소스 수정 없이
  덮어쓸 수 있음. 메인테이너 기본값은 그대로 유지.
- 옵트-인 CDK 스택 `KiroDashboardCatalog` 추가 — `ATHENA_DATA_BUCKET_NAME`
  설정 시 포크 소유 S3 버킷 위에 Glue 데이터베이스와 `user_report`
  외부 테이블을 생성.
- `infra/sql/user-report-table.sql` — Catalog 스택을 쓰지 않는 경우의
  수동 DDL 대안.
- README와 `.env.example`에 Kiro User Activity Report 사전 요구 사항 및
  CDK 배포 시 오버라이드 환경 변수 전체를 문서화.
- `.env.deploy.example` 템플릿 추가 — CDK 배포 시 필요한 모든 환경 변수를
  한 파일에 모아서 `cp .env.deploy.example .env.deploy` →
  `set -a; source .env.deploy; set +a` → `cdk deploy` 순서로 배포할 수
  있게 함. `.env.deploy`는 `.gitignore`에 포함되어 계정별 값이
  커밋되지 않음.
- 사이드바 하단에 앱 버전(`v1.1.0`) 표기 — `lib/version.ts`를 통해
  `package.json`에서 읽어옴. 새 `version-sync` 테스트가 `package.json`,
  `CHANGELOG.md`(양 언어), `CLAUDE.md`, 사이드바 표기를 동기화 상태로
  강제함. 버전 표기는 새 `/changelog` 페이지로 연결됨.
- **Executive** 메뉴 (`/exec`) — 기존 API를 조합한 경영진용 원페이지
  스냅샷: KPI 카드, 일별 활성 사용자·크레딧, 모델 점유율, 티어별
  크레딧, 상위 크레딧 사용자.
- **구독·초과사용** 메뉴 (`/subscription`, `/api/subscription`) — 구독
  티어 구성(티어별 사용자/크레딧/메시지), 티어 크레딧 점유율, 사용자별
  `overage_credits_used` 대비 `overage_cap` 사용률 워치리스트.
- **신규 사용자·온보딩** 메뉴 (`/adoption`, `/api/adoption`) — UAR
  `New_User` 플래그 기반 일별 신규 사용자, 활성 사용자, 누적 사용자
  추이와 최근 신규 사용자 테이블. OpenCSVSerDe 위치 매핑 문제로
  `new_user` 컬럼은 Athena로 조회할 수 없어 S3 직접 읽기(헤더 이름
  기반 파싱)로 구현.
- **개발활동 상세** 메뉴 (`/dev-activity`, `/api/dev-activity`) —
  대시보드가 사용하지 않던 레거시 `by_user_analytic` 5개 그룹:
  TestGen, DocGen, Transform, InlineChat, CodeFix (이벤트, 생성 대비
  수락 라인, 수락률, 일별 추이, 상위 사용자).
- **Changelog** 페이지 (`/changelog`) — 이 이중언어 파일을 빌드 타임에
  렌더링(`force-static`), Added/Changed/Fixed 그룹별 버전 카드 스타일,
  KO/EN 스위처를 따라 언어 전환.
- `lib/uar-s3.ts` — model-usage 라우트에서 추출한 UAR S3 공용 헬퍼
  (버킷/프리픽스 결정, 월 프리픽스 병렬 리스팅, CSV 파싱),
  `/api/adoption`에서 재사용.

### 성능

- `/api/model-usage` 응답 시간 ~20초 → ~1.6초: 하루당 1회씩 순차
  호출하던 `ListObjectsV2`(크로스 리전 90회 왕복)를 월 프리픽스 병렬
  리스팅 + 기간 필터로 교체, S3 페이지네이션도 처리.

### 수정됨

- 대시보드 API 라우트(`/api/users`, `/api/trends`, `/api/credits`,
  `/api/engagement`, `/api/productivity`, `/api/metrics`, `/api/client-dist`)
  가 Glue 테이블이 아직 프로비저닝되지 않았을 때 더 이상 500을 내지
  않음. `isMissingTableError` 헬퍼로 감지해 200 + 빈 payload를 반환하여
  새 계정에서도 "Application error" 크래시 대신 빈 표로 렌더링됨.
- `app/users/page.tsx`, `app/trends/page.tsx`에 `Array.isArray` 가드 추가 —
  향후 어떤 라우트가 `{ error }` 객체를 반환해도 `.map()` TypeError를
  일으키지 않도록 방어선 강화.
- `app/api/analyze/route.ts`의 Bedrock 시스템 프롬프트에서 메인테이너
  버킷 `whchoi01-titan-q-log`와 IdC 스토어 `d-90663be888` 하드코딩 제거.
  이제 `ATHENA_DATABASE` / `ATHENA_OUTPUT_BUCKET` 환경 변수를 읽어
  구성하며, UserId 프리픽스 패턴도 `d-xxxxxxxxxxxx.` 로 일반화.
- `app/api/model-usage/route.ts`가 `S3_REPORT_PREFIX` 미설정 시 메인테이너의
  `q-user-log/AWSLogs/120443221648/...` 경로로 폴백하던 동작 제거. 대신
  버킷/프리픽스가 비어 있으면 빈 payload를 반환하여 엉뚱한 계정에
  S3 요청이 나가는 상황을 원천 차단.
- `tests/api/hardcode-audit.test.ts` 회귀 가드 추가 — `app/`, `lib/`
  하위의 런타임 코드에 메인테이너 버킷/계정 ID가 다시 들어가면
  CI가 실패함.
- `infra/cdk.json`의 `useExistingVpc=true` / `vpcId=vpc-005338aca7ac5fb96`
  메인테이너 VPC 하드코딩 제거. 기본값은 "새 VPC 생성"(10.254.0.0/16)
  으로 바뀌어 fresh 계정의 `cdk deploy`가 VPC lookup 실패 없이 성공.
  기존 VPC 재사용은 `EXISTING_VPC_ID` / `VPC_CIDR` 환경 변수로 지정
  (`bin/app.ts`가 CDK context로 주입).

## [1.1.0] - 2026-04-24

### Added

- CloudFront Viewer Request 레벨 Lambda@Edge + Cognito PKCE 인증 (NextAuth.js 대체)
- Lambda@Edge 함수: JWT 검증(`aws-jwt-verify`), PKCE 플로우, 토큰 갱신, HttpOnly 쿠키 관리
- SSM Parameter Store 설정 로더 (us-east-1) — Lambda@Edge 콜드 스타트 캐싱
- CDK `EdgeFunction` 구성: esbuild 번들링, us-east-1 크로스 리전 배포
- `AwsCustomResource`: SSM 설정 쓰기 및 Cognito 콜백 URL 배포 후 업데이트
- 공개 Cognito `EdgeAuthClient` (클라이언트 시크릿 없음) — Lambda@Edge PKCE 호환
- `lib/mask.ts` 서버 측 데이터 마스킹 — 모든 사용자 식별자 첫 2글자만 표시, 나머지 `*` 처리
- 사이드바 로그아웃 메뉴 — `/auth/logout` 링크 (Lambda@Edge가 쿠키 삭제 후 Cognito 로그아웃 리다이렉트)
- 모델 사용 분석 페이지: AI 모델 분포 파이 차트, Auto vs 수동 비교, 일별 추이, 사용자별 모델 선호도 테이블
- `/api/model-usage` 엔드포인트: 동적 `{Model_name}_Messages` 컬럼을 위한 S3 CSV 직접 읽기 (Glue OpenCSVSerDe 위치 매핑 한계 우회)
- `UserReport` TypeScript 인터페이스에 `overage_cap` 필드 추가 (Glue 테이블에 존재했으나 타입 누락)

### Changed

- CDK 인프라 4개 → 5개 스택 확장 (`KiroDashboardEdgeLambda` us-east-1 자동 생성)
- CdnStack 재작성: Lambda@Edge, SSM 설정, Cognito 콜백 URL 관리 포함
- SecurityStack에 EdgeAuthClient UserPoolClient 추가
- 사용자 ID 해석(`lib/identity.ts`)이 마스킹된 값 반환 (displayName, email, username, organization)
- 사용자 대면 API 라우트(users, credits, productivity, user-detail, idc-users) 마스킹된 식별자 반환

### Removed

- NextAuth.js 의존성 및 설정 (`lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`)
- 커스텀 로그인 페이지 (`app/login/page.tsx`) — Cognito Hosted UI로 대체
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` 환경변수

## [1.0.0] - 2026-04-21

### Added

- Next.js 14 풀스택 대시보드 7개 페이지 구현: 대시보드, 사용자, 트렌드, 크레딧, IDE 생산성, 참여도, AI 분석
- Athena 연동 12개 API 라우트 구현 (user_report + by_user_analytic 테이블, UserId prefix 정규화 포함)
- Amazon Bedrock Claude Sonnet 4.6 기반 자연어 AI 분석 기능 (query_athena, lookup_users 도구 사용)
- react-markdown + remark-gfm 마크다운 렌더링 (다크 테마 커스텀 컴포넌트 적용)
- Identity Center 통합 — 45명 IdC 사용자 활성/비활성 상태, 이름, 이메일, 소속 표시
- 사용자 상세 드릴다운 패널 (일별 활동 내역, 클라이언트 유형별 분석)
- IDE 생산성 페이지 — 46개 컬럼 레거시 리포트 활용 (채팅, 인라인 완성, Dev Agent, 코드 리뷰, 테스트/문서 생성)
- 14개 기간 프리셋 필터링: 1분, 5분, 10분, 1시간, 3시간, 6시간, 12시간, 1일, 3일, 7일, 14일, 30일, 60일, 90일
- 페이지별 테마 액세서리를 가진 애니메이션 Kiro 유령 마스코트 (대시보드 그리드, 사용자 아바타, 트렌드 화살표, 코인, 코드 터미널, 채팅 말풍선)
- 사이드바 네비게이션 미니 Kiro 캐릭터 애니메이션 (페이지별 고유 액센트 색상)
- 한국어/영어 이중 언어 인터페이스 (사이드바 언어 전환)
- kiro.dev 공식 보라색(#9046FF) 컬러 팔레트 기반 Kiro 브랜드 적용
- img/kiro.svg 실제 Kiro 유령 SVG 캐릭터 전체 컴포넌트 적용
- AWS CDK 4개 스택 인프라: Network(mgmt-vpc), Security(SG, Cognito), ECS(Fargate, ALB, ECR), CDN(CloudFront)
- Docker 멀티 스테이지 빌드 (node:20-alpine, ARM64, standalone 출력)
- ECS Fargate 서비스 오토 스케일링 (1-4 태스크, CPU 70% 타겟)
- CloudFront X-Custom-Secret 헤더 검증을 통한 ALB 보안
- Cognito User Pool + Lambda@Edge PKCE 인증
- Athena 실제 데이터 기반 클라이언트 분포 파이 차트 (KIRO_IDE vs KIRO_CLI)
- 참여도 퍼널 및 사용자 세그먼트 (Power/Active/Light/Idle 등급)
- AWSops 스타일 메트릭 카드 (반투명 다크, hover 효과, font-mono 값)
- NextToken 기반 Athena 쿼리 페이지네이션 (1,000행 초과 데이터셋 대응)
- Claude Code 프로젝트 구조 초기화 (훅, 스킬, 커맨드, 에이전트, 문서)

### Fixed

- CDK 크로스 스택 순환 참조 해결 (IAM 역할을 EcsStack으로 이동)
- ARM64 런타임 플랫폼 불일치 수정 (exec format error, runtimePlatform 설정)
- Next.js standalone 바인딩 수정 (HOSTNAME=0.0.0.0 환경변수 추가)
- 정적 프리렌더링 문제 수정 (모든 데이터 페이지에 force-dynamic 적용)
- 빈 NEXTAUTH_URL 폴백 수정 (?? → || 연산자 변경)
- Athena S3 쓰기 권한 수정 (쿼리 결과 저장을 위한 S3FullAccess 부여)
- SQL 컬럼명 대소문자 불일치 수정 (PascalCase → Glue 카탈로그 소문자 일치)
- Subscription Tier 대소문자 정규화 (POWER vs Power, toUpperCase() 매핑)
- changeRates 키 불일치 수정 (API 응답과 프론트엔드 간 키 이름 통일)
- Bedrock 모델 ID 수정 (global inference profile global.anthropic.claude-sonnet-4-6 적용)
- Bedrock IAM 정책 확장 (inference-profile ARN 패턴 추가)

[Unreleased]: https://github.com/whchoi98/kiro-dashboard/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/whchoi98/kiro-dashboard/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.2.0...v1.5.0
[1.2.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/whchoi98/kiro-dashboard/releases/tag/v1.0.0
