# types/ — TypeScript Interfaces

## Role

대시보드 전체에서 공유되는 TypeScript 타입 정의. API 응답, 컴포넌트 props, 데이터 모델을 포함합니다.

## Files

| File | Description |
|------|-------------|
| `dashboard.ts` | All dashboard data interfaces |
| `css.d.ts` | CSS module type declarations |
| `markdown.d.ts` | Ambient module declaration that lets `lib/release-notes.ts` import `../CHANGELOG.md` as a string (webpack asset/source pairing; jest mirrors it via tests/transform-raw.js) |

---

## dashboard.ts — Key Interfaces

| Interface | Description |
|-----------|-------------|
| `OverviewMetrics` | `/api/metrics` response — totals and change rates |
| `UserActivity` | `/api/users` row — per-user activity summary |
| `TrendDataPoint` | `/api/trends` row — date + metric value for charting |
| `CreditUsage` | `/api/credits` row — credit consumption per user/period |
| `EngagementData` | `/api/engagement` response — tier segments, funnel, and `efficiency: { overall, byClient }` |
| `ClientEfficiency` | One client (or `'ALL'`) — users, messages, conversations, credits, and three rates that are `null` (never 0) on a 0 denominator |
| `ProductivityMetrics` | `/api/productivity` response — code acceptance stats |
| `UserDetail` | `/api/user-detail` response — full per-user breakdown |
| `IdcUser` | `/api/idc-users` row — IAM Identity Center user info |
| `ClientDistribution` | `/api/client-dist` row — IDE version/OS breakdown |
| `ModelUsageData` | `/api/model-usage` response — model distribution, trend, user preferences, `vendors`, `byClient`, `adoption` |
| `ModelDistribution` | Per-model message count, percentage, and `vendor` |
| `ModelVendor` | `'anthropic' \| 'third_party' \| 'auto'` — derived from the column name |
| `VendorShare` | One vendor's message count and share |
| `ClientModelMix` | Model mix + vendor split of one client type |
| `ModelAdoption` | Per model: first/last seen, `firstSeenAtWindowStart` (may predate the window), users, messages, `recentShare` (last 7 days, nullable) |
| `ModelTrendPoint` | Daily model usage data point (dynamic keys per model) |
| `ModelUserPreference` | Per-user model usage breakdown with primary model |
| `SubscriptionData` | `/api/subscription` response — tier slices, tier trend, overage summary/watchlist |
| `AdoptionData` | `/api/adoption` response — new/active user trend, totals, recent new users |
| `DevActivityData` | `/api/dev-activity` response — five legacy metric groups, trend, top users |
| `RolloutData` | `/api/rollout` response — per-client trend/summary, IDE↔CLI overlap segments, per-user pickup lag, tier × client matrix, `dataStart` |
| `RolloutUserRow` | Per-user rollout row — `pickupLagDays` is `null` when left-censored at the window edge, never `0` |
| `IngestHealthData` | `/api/ingest-health` response — freshness, delivery matrix, file inventory, header variants, row parity, `modelParity` (Σ model columns vs `total_messages`, up to 5 examples), legacy instrumentation |
| `IngestDayCell` | One (date, client) delivery cell — two states only; a `false` cell is not a failure signal |
| `IdcUsersData` | `/api/idc-users` response — directory users plus dormancy buckets and the directory→activity funnel; top-level `newRegistrants` count, per-user `firstSeenAt` (ISO or null) and `isNewRegistrant` (window-gated, see `lib/first-seen.ts`) |
| `DormancyBucket` | Directory-user activity grade (`active7`…`never`) — describes directory accounts, **not** Kiro seats or licenses |
| `CreditEfficiency` | Credits per accepted AI code line — two independent sums over an overlapping window; a credit ratio, never a currency amount |
| `UserModelSlice` | One model's share of a single user's messages — `{ model, messages, percentage }` |
| `UserModelUsageData` | `/api/user-model-usage` response — slices, daily trend, client-type split, `primaryModel`, plus `configured` and `daysWithModelColumns` which keep the three zero states distinguishable (env unset / no model columns in the reports / user had none) |
| `ReleaseNotesResponse` | `/api/release-notes` response — `{ version, exact, section, history }`. `section` is a `VersionSection` from `lib/changelog-md.ts`; `exact: false` means the notes belong to a different version than the running build, which the dialog labels rather than hiding |
| `InfraResource` / `InfraStatusData` | `/api/infra` response — one row per dashboard-owned AWS resource (`status: 'healthy'\|'degraded'\|'unknown'\|'static'`, `monthlyUsd` nullable, optional `formula`/`costKind` for cost-line transparency) plus live CloudWatch metrics and a fixed-cost summary from `lib/infra-cost.ts` |

---

## Conventions

- All interfaces use `PascalCase` names
- Optional fields use `field?: type` (never `field: type | undefined` explicitly)
- Numeric fields from Athena are pre-parsed to `number` in the API route (not `string`)
- Date fields are `string` in ISO format (`YYYY-MM-DD`)
- Keep all types in `dashboard.ts` — do not create per-feature type files

## Adding New Interfaces

1. Add the interface to `types/dashboard.ts`
2. Import it in the relevant API route: `import { NewType } from '@/types/dashboard'`
3. Import it in the component that consumes the data
4. Update this file's interface table above
