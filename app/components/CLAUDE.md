# app/components/ — React Components

## Role

재사용 가능한 React UI 컴포넌트. 레이아웃, 차트, 테이블, UI 유틸리티로 구분됩니다.

## Directory Layout

```
components/
  layout/
    Header.tsx          Top navigation bar — language switcher, user info
    Sidebar.tsx         Left nav sidebar — dashboard page links
    KiroLogo.tsx        Kiro logo SVG component
  charts/
    BarChart.tsx        Recharts bar chart wrapper
    FunnelChart.tsx     Funnel visualization chart
    IdcUserStatus.tsx   IAM Identity Center user status indicator
    MetricCard.tsx      KPI card with trend indicator
    PieChart.tsx        Recharts pie/donut chart wrapper
    TrendChart.tsx      Recharts line/area trend chart
  tables/
    UserTable.tsx       Sortable user activity data table
  ui/
    DateRangePicker.tsx Date range selector component
    KiroIcon.tsx        Kiro icon SVG (small)
    KiroMascot.tsx      Kiro mascot SVG (large, decorative)
    UserDetailPanel.tsx Slide-in user detail side panel
  OverviewClient.tsx    Overview dashboard client component (top-level)
```

## Theming Rules

- Background: `bg-black` (page), `bg-gray-900/50` (cards)
- Accent color: `#9046FF` (Kiro brand purple) — use as `text-[#9046FF]` or `border-[#9046FF]`
- Text: `text-white` (primary), `text-gray-400` (secondary)
- All new components must default to dark theme — no `light:` variants
- Border: `border-gray-800` or `border-gray-700`

## Component Conventions

- Client components must have `'use client'` directive at the top
- All user-facing strings go through `useLanguage()` from `lib/i18n.tsx`
- Chart components receive pre-processed data arrays (no direct Athena calls)
- `MetricCard` accepts: `title`, `value`, `changeRate`, `trend` props
- `DateRangePicker` emits ISO date strings (`YYYY-MM-DD`)

## Adding a New Component

1. Place in the appropriate subdirectory (`layout/`, `charts/`, `tables/`, `ui/`)
2. If it uses React hooks or browser APIs, add `'use client'`
3. Add Korean/English strings to `lib/i18n.tsx`
4. Export from the component file directly (no barrel `index.ts` needed)
5. Update this file's directory layout above
