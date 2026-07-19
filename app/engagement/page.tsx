'use client';

import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';
import ClientPieChart from '@/app/components/charts/PieChart';
import FunnelChart from '@/app/components/charts/FunnelChart';
import { EngagementData, ClientDistribution } from '@/types/dashboard';

// `color` is the decorative accent (bars, tint backgrounds — inline hex, OK on
// any theme). `text` is a palette class for the label so it inverts to a
// legible darker stop in light mode instead of a washed-out bright.
const TIER_META: Record<string, { color: string; text: string; description: string; icon: string }> = {
  Power: {
    color: '#f97316',
    text: 'text-orange-400',
    description: '100+ messages or 20+ conversations',
    icon: '⚡',
  },
  Active: {
    color: '#6366f1',
    text: 'text-indigo-400',
    description: '20+ messages or 5+ conversations',
    icon: '🚀',
  },
  Light: {
    color: '#0ea5e9',
    text: 'text-sky-400',
    description: 'At least 1 message sent',
    icon: '💬',
  },
  Idle: {
    color: '#64748b',
    text: 'text-slate-400',
    description: 'No messages in the period',
    icon: '😴',
  },
};

export default function EngagementPage() {
  const [days, setDays] = useState(90);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/engagement?days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        // Error payloads ({ error }) lack `segments`; storing one crashes the
        // `engagement?.segments.length` read below (optional chaining stops at
        // `segments`, so `.length` throws on the error object).
        if (!cancelled) setEngagement(data?.segments ? data : null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const segmentsPieData: ClientDistribution[] = (engagement?.segments ?? []).map((seg) => ({
    clientType: seg.tier,
    messageCount: seg.count,
    creditCount: 0,
    percentage: seg.percentage,
  }));

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header
        titleKey="header.engagement"
        subtitleKey="header.engagement.sub"
        mascotMood="excited"
        mascotTheme="engagement"
        days={days}
        onDaysChange={setDays}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
          <ClientPieChart data={segmentsPieData} title="User Segments" />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
          <FunnelChart data={engagement?.funnel ?? []} title="Engagement Funnel" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {(engagement?.segments ?? []).map((seg) => {
          const meta = TIER_META[seg.tier] ?? { color: '#64748b', text: 'text-slate-400', description: '', icon: '?' };
          return (
            <div
              key={seg.tier}
              className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xl">{meta.icon}</span>
                <span
                  className={`text-sm font-semibold px-2 py-0.5 rounded-full ${meta.text}`}
                  style={{ backgroundColor: `${meta.color}22` }}
                >
                  {seg.percentage.toFixed(1)}%
                </span>
              </div>
              <p className="text-white text-3xl font-bold">{seg.count.toLocaleString()}</p>
              <p className="text-slate-300 text-base font-medium mt-1">{seg.tier} Users</p>
              <p className="text-slate-500 text-sm mt-2">{meta.description}</p>
            </div>
          );
        })}
        {!engagement?.segments?.length && (
          <div className="col-span-1 sm:col-span-2 md:col-span-4 text-slate-500 text-sm">No data available</div>
        )}
      </div>
    </div>
  );
}
