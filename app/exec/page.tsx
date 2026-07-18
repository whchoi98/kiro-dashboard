'use client';

import { useState, useEffect } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Header from '@/app/components/layout/Header';
import MetricCard from '@/app/components/charts/MetricCard';
import ClientPieChart from '@/app/components/charts/PieChart';
import {
  OverviewMetrics,
  DailyTrend,
  CreditAnalysis,
  ModelUsageData,
  ClientDistribution,
} from '@/types/dashboard';

const TIER_COLORS: Record<string, string> = {
  POWER: '#22d3ee',
  PRO: '#6366f1',
  PROPLUS: '#f97316',
};

const RANK_COLORS = ['#f97316', '#6366f1', '#0ea5e9', '#22d3ee', '#a78bfa'];

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#f1f5f9',
  fontSize: 12,
};

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function ExecPage() {
  const [days, setDays] = useState(90);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [trends, setTrends] = useState<DailyTrend[]>([]);
  const [credits, setCredits] = useState<CreditAnalysis | null>(null);
  const [modelUsage, setModelUsage] = useState<ModelUsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      safeFetch<OverviewMetrics>(`/api/metrics?days=${days}`),
      safeFetch<DailyTrend[]>(`/api/trends?days=${days}`),
      safeFetch<CreditAnalysis>(`/api/credits?days=${days}`),
      safeFetch<ModelUsageData>(`/api/model-usage?days=${days}`),
    ])
      .then(([metricsData, trendsData, creditsData, modelUsageData]) => {
        if (cancelled) return;
        setMetrics(metricsData);
        setTrends(Array.isArray(trendsData) ? trendsData : []);
        setCredits(creditsData);
        setModelUsage(modelUsageData);
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
  }, [days]);

  const cr = metrics?.changeRates ?? {};

  // Map model distribution into the shape ClientPieChart expects
  const modelPieData: ClientDistribution[] = (modelUsage?.distribution ?? []).map((d) => ({
    clientType: d.model,
    messageCount: d.messages,
    creditCount: 0,
    percentage: d.percentage,
  }));

  const byTier = credits?.byTier ?? [];
  const topUsers = (credits?.topUsers ?? []).slice(0, 5);
  const maxTopCredits = topUsers[0]?.totalCredits ?? 1;

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header
        titleKey="header.exec"
        subtitleKey="header.exec.sub"
        mascotMood="happy"
        mascotTheme="dashboard"
        days={days}
        onDaysChange={setDays}
      />

      {/* Row 1: Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Users"
          value={formatNumber(metrics?.totalUsers ?? 0)}
          changeRate={cr.totalUsers ?? 0}
          accentColor="#9046FF"
          detail={`Last ${days} days`}
        />
        <MetricCard
          title="Total Messages"
          value={formatNumber(metrics?.totalMessages ?? 0)}
          changeRate={cr.totalMessages ?? 0}
          accentColor="#6366f1"
          detail={`Last ${days} days`}
        />
        <MetricCard
          title="Credits Used"
          value={formatNumber(metrics?.totalCredits ?? 0)}
          changeRate={cr.totalCredits ?? 0}
          accentColor="#22d3ee"
          detail={`Last ${days} days`}
        />
        <MetricCard
          title="Overage Credits"
          value={formatNumber(metrics?.totalOverageCredits ?? 0)}
          changeRate={cr.totalOverageCredits ?? 0}
          accentColor="#ec4899"
          detail={`Last ${days} days`}
        />
      </div>

      {/* Row 2: Daily trend + model share */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">Daily Active Users &amp; Credits</h3>
          {trends.length > 0 ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => d.slice(5)}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="credits"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <YAxis
                    yAxisId="users"
                    orientation="right"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }} />
                  <Bar
                    yAxisId="credits"
                    dataKey="credits"
                    name="Credits"
                    fill="#22d3ee"
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    yAxisId="users"
                    type="monotone"
                    dataKey="activeUsers"
                    name="Active Users"
                    stroke="#9046FF"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No data available</p>
          )}
        </div>

        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          {modelPieData.length > 0 ? (
            <ClientPieChart data={modelPieData} title="Model Share" />
          ) : (
            <>
              <h3 className="text-lg font-semibold text-slate-300 mb-4">Model Share</h3>
              <p className="text-slate-500 text-sm">No data available</p>
            </>
          )}
        </div>
      </div>

      {/* Row 3: Credits by tier + top credit users */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">Credits by Tier</h3>
          <div className="flex flex-col gap-2">
            {byTier.map((tier) => (
              <div
                key={tier.tier}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-dashboard-border"
                style={{ borderLeft: `3px solid ${TIER_COLORS[tier.tier.toUpperCase()] ?? '#64748b'}` }}
              >
                <div>
                  <p className="text-white text-sm font-semibold">{tier.tier}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{tier.userCount} users</p>
                </div>
                <p className="text-white text-base font-bold font-mono">{tier.totalCredits.toLocaleString()}</p>
              </div>
            ))}
            {!byTier.length && (
              <p className="text-slate-500 text-sm">No data available</p>
            )}
          </div>
        </div>

        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">Top 5 Credit Users</h3>
          <div className="flex flex-col gap-3">
            {topUsers.map((user, index) => {
              const barPct = maxTopCredits > 0 ? (user.totalCredits / maxTopCredits) * 100 : 0;
              return (
                <div key={user.userid} className="flex items-center gap-3">
                  <span className="text-slate-500 text-sm w-5 text-right font-mono">#{index + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-200 text-sm font-medium">{user.displayName || user.username}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400">{user.totalCredits.toLocaleString()} credits</span>
                        {user.overageCredits > 0 && (
                          <span className="text-pink-400">{user.overageCredits.toLocaleString()} overage</span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-dashboard-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: RANK_COLORS[index % RANK_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {!topUsers.length && (
              <p className="text-slate-500 text-sm">No data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
