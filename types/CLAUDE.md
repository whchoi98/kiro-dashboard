# types/ — TypeScript Interfaces

## Role

대시보드 전체에서 공유되는 TypeScript 타입 정의. API 응답, 컴포넌트 props, 데이터 모델을 포함합니다.

## Files

| File | Description |
|------|-------------|
| `dashboard.ts` | All dashboard data interfaces |
| `css.d.ts` | CSS module type declarations |

---

## dashboard.ts — Key Interfaces

| Interface | Description |
|-----------|-------------|
| `OverviewMetrics` | `/api/metrics` response — totals and change rates |
| `UserActivity` | `/api/users` row — per-user activity summary |
| `TrendDataPoint` | `/api/trends` row — date + metric value for charting |
| `CreditUsage` | `/api/credits` row — credit consumption per user/period |
| `EngagementMetrics` | `/api/engagement` response — retention and session depth |
| `ProductivityMetrics` | `/api/productivity` response — code acceptance stats |
| `UserDetail` | `/api/user-detail` response — full per-user breakdown |
| `IdcUser` | `/api/idc-users` row — IAM Identity Center user info |
| `ClientDistribution` | `/api/client-dist` row — IDE version/OS breakdown |

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
