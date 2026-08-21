'use client';

import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';
import { SkeletonGate } from '@/app/components/ui/PageSkeleton';
import { pageBodyOpacityClass } from '@/lib/skeleton-layout';
import MetricCard from '@/app/components/charts/MetricCard';
import ClientPieChart from '@/app/components/charts/PieChart';
import FreshnessBanner from '@/app/components/ui/FreshnessBanner';
import { SubscriptionData, ClientDistribution } from '@/types/dashboard';
import { useRefresh } from '@/lib/refresh';

// Left-border accent (decorative — inline hex is fine on any theme).
const TIER_COLORS: Record<string, string> = {
  POWER: '#22d3ee',
  PRO: '#6366f1',
  PROPLUS: '#f97316',
  PROMAX: '#eab308',
};

// Tier label text uses palette classes (not inline hex) so the .light theme
// inverts them to legible darker stops instead of washed-out brights.
const TIER_TEXT: Record<string, string> = {
  POWER: 'text-cyan-400',
  PRO: 'text-indigo-400',
  PROPLUS: 'text-orange-400',
  PROMAX: 'text-yellow-400',
};

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function SubscriptionPage() {
  const { nonce } = useRefresh();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/subscription?days=${days}`)
      .then((r) => r.json())
      .then((result) => {
        if (!cancelled) setData(result ?? null);
      })
      .catch(() => {
        // Keep existing data on error
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, nonce]);

  const summary = data?.overageSummary;
  const tiers = data?.tiers ?? [];
  const overageUsers = data?.overageUsers ?? [];

  const tierPieData: ClientDistribution[] = tiers.map((tier) => ({
    clientType: tier.tier,
    messageCount: tier.totalMessages,
    creditCount: tier.totalCredits,
    percentage: tier.creditShare,
  }));

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${pageBodyOpacityClass(loading, data !== null)}`}>
      <Header
        titleKey="header.subscription"
        subtitleKey="header.subscription.sub"
        mascotMood="thinking"
        mascotTheme="credits"
        days={days}
        onDaysChange={setDays}
      />
      <FreshnessBanner dates={(data?.tierTrend ?? []).map((p) => p.date)} />

      <SkeletonGate variant="split" loading={loading} hasData={data !== null}>
      {/* Summary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="Total Users"
          value={formatNumber(summary?.totalUsers ?? 0)}
          changeRate={0}
          accentColor="#9046FF"
          subtitle="unique"
          detail={`Last ${days} days`}
        />
        <MetricCard
          title="Overage-Enabled Users"
          value={formatNumber(summary?.enabledUsers ?? 0)}
          changeRate={0}
          accentColor="#ec4899"
          subtitle="enabled"
          detail={`Last ${days} days`}
        />
        <MetricCard
          title="Base Credits"
          value={formatNumber(summary?.totalBaseCredits ?? 0)}
          changeRate={0}
          accentColor="#22d3ee"
          subtitle="credits"
          detail={`Last ${days} days`}
        />
        <MetricCard
          title="Overage Credits"
          value={formatNumber(summary?.totalOverageCredits ?? 0)}
          changeRate={0}
          accentColor="#f97316"
          subtitle="credits"
          detail={`Last ${days} days`}
        />
      </div>

      {/* Subscription tier cards */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">Subscription Tiers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {tiers.map((tier) => (
            <div
              key={tier.tier}
              className="p-4 rounded-lg border border-dashboard-border"
              style={{ borderLeft: `3px solid ${TIER_COLORS[tier.tier.toUpperCase()] ?? '#64748b'}` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-white text-base font-semibold">{tier.tier}</p>
                <span className="text-slate-400 text-xs font-mono">{tier.creditShare.toFixed(1)}%</span>
              </div>
              <p className="text-slate-400 text-sm mt-0.5">{tier.userCount} users</p>
              <p className="text-white text-lg font-bold mt-2">{tier.totalCredits.toLocaleString()}</p>
              <p className="text-slate-500 text-sm">credits used</p>
              <p className="text-slate-400 text-sm mt-1">{tier.totalMessages.toLocaleString()} messages</p>
            </div>
          ))}
        </div>
        {!tiers.length && <p className="text-slate-500 text-sm">No data available</p>}
      </div>

      {/* Tier credit share pie + overage watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <ClientPieChart data={tierPieData} title="Tier Credit Share" />
          {!tierPieData.length && <p className="text-slate-500 text-sm">No data available</p>}
        </div>
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">Overage Watchlist</h3>
          <div className="flex flex-col gap-3">
            {overageUsers.map((user, index) => {
              const atRisk = user.utilization >= 80;
              const barPct = Math.min(user.utilization, 100);
              return (
                <div key={user.userid} className="flex items-center gap-3">
                  <span className="text-slate-500 text-sm w-5 text-right font-mono">#{index + 1}</span>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-medium ${atRisk ? 'text-red-400' : 'text-slate-200'}`}>
                          {user.displayName}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border border-dashboard-border ${
                            TIER_TEXT[user.tier.toUpperCase()] ?? 'text-slate-400'
                          }`}
                        >
                          {user.tier}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-slate-400">
                          {user.overageCredits.toLocaleString()} used / {user.overageCap.toLocaleString()} cap
                        </span>
                        <span className={`font-mono font-semibold ${atRisk ? 'text-red-400' : 'text-slate-300'}`}>
                          {user.utilization.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-dashboard-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: atRisk ? '#ef4444' : '#9046FF',
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {!overageUsers.length && <p className="text-slate-500 text-sm">No data available</p>}
          </div>
        </div>
      </div>
      </SkeletonGate>
    </div>
  );
}
