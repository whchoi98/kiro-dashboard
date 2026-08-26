---
name: dashboard-component-guide
description: Create and modify kiro-dashboard UI — pages, charts, metric cards, tables, panels — with the project's i18n, theme, and loading conventions. Use when adding a page or chart, or changing the dashboard layout.
---

# Dashboard Component Guide — kiro-dashboard

Task: $ARGUMENTS

## Page pattern

Every sub-page is a client component that owns `days` and re-fetches on change:

```tsx
'use client';
import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';

export default function MyPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/my-endpoint?days=${days}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header titleKey="header.mypage" subtitleKey="header.mypage.sub"
              mascotMood="happy" days={days} onDaysChange={setDays} />
      {/* content */}
    </div>
  );
}
```

`DateRangePicker` presets are 1 / 3 / 7 / 14 / 30 / 60 / 90 days. Loading states
use `PageSkeleton` with shapes from `lib/skeleton-layout.ts`.

## i18n

Text goes through `useI18n()` from `lib/i18n.tsx` — add the key to **both** the
`ko` and `en` objects. Hardcoded Korean or English in a component is a review
finding. (There is no `useLanguage()` in this repo.)

## Theme

Dark is the default and the baseline: write `bg-black`, `bg-gray-900/50`,
`border-gray-800`, `text-white`. The light theme is a Tailwind palette override
driven by a `.light` class from `lib/theme.tsx`, so components need no `light:`
variants. Recharts colors must come from `lib/chart-theme.ts` (ticks, tooltip,
cursor) and `lib/model-colors.ts` (stable per-model series), not inline hex.

## Components

| Component | Location | Notes |
|-----------|----------|-------|
| `MetricCard` | `charts/` | title, value, changeRate, accentColor, icon, subtitle, detail |
| `TrendChart` | `charts/` | `DailyTrend[]` |
| `PieChart` | `charts/` | `ClientDistribution[]`, title |
| `BarChart` | `charts/` | `TopUser[]`, title |
| `FunnelChart` | `charts/` | `FunnelStep[]`, title |
| `IdcUserStatus` | `charts/` | directory users + dormancy grading |
| `UserTable` | `tables/` | sortable (`lib/table-sort.ts`), searchable |
| `UserDetailPanel`, `InfraDetailPanel` | `ui/` | slide-over drill-downs, no extra fetch |
| `FreshnessBanner` | `ui/` | as-of date + next 02:00 UTC report countdown |
| `KiroMascot`, `KiroIcon` | `ui/` | page-themed ghost character |
| `Sidebar`, `Header` | `layout/` | drawer below 768px, theme/lang toggles |
| `FloatingChat`, `ChatPanel` | `chat/` | shares `lib/useChatStream.ts` with `/analyze` |

## Palette

`#9046FF` purple (brand) · `#6366f1` indigo · `#0ea5e9` sky · `#22d3ee` cyan ·
`#f97316` orange · `#ec4899` pink · background `#000000` · card `#1a1a1a` ·
border `#262626`

## Wiring a new page

1. Route handler under `app/api/<name>/route.ts`, response typed in `types/dashboard.ts`
2. Page at `app/<name>/page.tsx`
3. Sidebar nav entry (state machine in `lib/nav-state.ts`)
4. i18n keys in both languages
5. Mobile check below 768px, and both themes
6. Update `app/components/CLAUDE.md` / `app/api/CLAUDE.md`, then run `npx jest`
   and `npm run build`
