---
name: dashboard-component-guide
description: Guide for creating and modifying dashboard UI components. Use when adding new charts, pages, metric cards, or modifying the dashboard layout.
---

# Dashboard Component Guide

## Page Structure

Every sub-page follows this pattern:
```tsx
'use client';
import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';

export default function MyPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
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
      <Header titleKey="header.mypage" subtitleKey="header.mypage.sub" mascotMood="happy" days={days} onDaysChange={setDays} />
      {/* Content */}
    </div>
  );
}
```

## Adding i18n Keys

Add translation keys to both `ko` and `en` objects in `lib/i18n.tsx`.

## Chart Components

| Component | Location | Props |
|-----------|----------|-------|
| MetricCard | `charts/MetricCard.tsx` | title, value, changeRate, accentColor, icon, subtitle, detail |
| TrendChart | `charts/TrendChart.tsx` | data: DailyTrend[] |
| PieChart | `charts/PieChart.tsx` | data: ClientDistribution[], title |
| BarChart | `charts/BarChart.tsx` | data: TopUser[], title |
| FunnelChart | `charts/FunnelChart.tsx` | data: FunnelStep[], title |

## Color Palette

- Purple (primary): `#9046FF`
- Indigo: `#6366f1`
- Sky: `#0ea5e9`
- Cyan: `#22d3ee`
- Orange: `#f97316`
- Pink: `#ec4899`
- Background: `#000000`
- Card: `#1a1a1a`
- Border: `#262626`
