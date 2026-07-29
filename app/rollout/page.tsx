'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Header from '@/app/components/layout/Header';
import MetricCard from '@/app/components/charts/MetricCard';
import { RolloutData } from '@/types/dashboard';
import { useI18n } from '@/lib/i18n';
import { useChartTheme } from '@/lib/chart-theme';

// Series accents are theme-invariant hexes (Recharts SVG attributes can't
// resolve CSS variables — see lib/chart-theme.ts).
const CLIENT_COLORS: Record<string, string> = {
  KIRO_IDE: '#9046FF',
  KIRO_CLI: '#22d3ee',
  PLUGIN: '#f97316',
};

function clientColor(client: string): string {
  return CLIENT_COLORS[client] ?? '#64748b';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function RolloutPage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<RolloutData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();
  const chartTheme = useChartTheme();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/rollout?days=${days}`)
      .then((r) => r.json())
      .then((payload) => {
        if (!cancelled) setData(payload ?? null);
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

  const clients = data?.clients ?? [];
  const overlap = data?.overlap;
  const users = data?.users ?? [];

  // Recharts needs flat keys, so the nested daily/cumulative records are
  // spread into `<client>` and `<client>_cum` series here rather than in the
  // route (which keeps the API shape self-describing).
  const chartRows = useMemo(
    () =>
      (data?.trend ?? []).map((point) => {
        const row: Record<string, string | number> = { date: point.date };
        for (const client of clients) {
          row[client] = point.daily[client] ?? 0;
          row[`${client}_cum`] = point.cumulative[client] ?? 0;
        }
        return row;
      }),
    [data?.trend, clients]
  );

  const segments = [
    { key: 'rollout.ideOnly', count: overlap?.ideOnly ?? 0, color: '#9046FF' },
    { key: 'rollout.cliOnly', count: overlap?.cliOnly ?? 0, color: '#22d3ee' },
    { key: 'rollout.both', count: overlap?.both ?? 0, color: '#22c55e' },
  ];
  const overlapTotal = overlap?.total ?? 0;

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header
        titleKey="header.rollout"
        subtitleKey="header.rollout.sub"
        mascotMood="excited"
        mascotTheme="trends"
        days={days}
        onDaysChange={setDays}
      />

      {/* Per-client KPI cards. Rendered from the clients actually present, so
          a permanently absent PLUGIN never leaves an empty card behind. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(data?.clientSummary ?? []).map((summary) => (
          <MetricCard
            key={summary.clientType}
            title={summary.clientType}
            value={formatNumber(summary.users)}
            changeRate={0}
            accentColor={clientColor(summary.clientType)}
            subtitle={t('metric.unique')}
            detail={`${summary.activeDays} ${t('ingest.days')} · ${formatNumber(summary.totalMessages)} ${t('metric.messages')}`}
          />
        ))}
        {!data?.clientSummary?.length && (
          <p className="text-slate-500 text-sm">No data available</p>
        )}
      </div>

      {/* Data-start annotation — the honest boundary for every lag number on
          this page. Never hardcoded; the route reads MIN(date). */}
      {data?.dataStart && (
        <div className="bg-dashboard-card rounded-xl px-5 py-3 border border-dashboard-border">
          <p className="text-sm text-slate-300">
            <span className="font-semibold">{t('rollout.dataStart')}:</span>{' '}
            <span className="font-mono">{data.dataStart}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">{t('rollout.dataStartNote')}</p>
        </div>
      )}

      {/* Daily actives + cumulative adopters */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('rollout.dailyActive')}</h3>
          {chartRows.length ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => d.slice(5)}
                    tick={{ fill: chartTheme.tick, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: chartTheme.tick, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartTheme.tooltipBg,
                      border: `1px solid ${chartTheme.tooltipBorder}`,
                      borderRadius: 8,
                      color: chartTheme.tooltipText,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: chartTheme.tick, marginBottom: 4 }}
                    cursor={{ fill: chartTheme.cursorFill }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: chartTheme.tick, paddingTop: 8 }} />
                  {clients.map((client, index) => (
                    <Bar
                      key={client}
                      dataKey={client}
                      name={client}
                      stackId="a"
                      fill={clientColor(client)}
                      radius={index === clients.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No data available</p>
          )}
        </div>

        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('rollout.cumulative')}</h3>
          {chartRows.length ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => d.slice(5)}
                    tick={{ fill: chartTheme.tick, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: chartTheme.tick, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartTheme.tooltipBg,
                      border: `1px solid ${chartTheme.tooltipBorder}`,
                      borderRadius: 8,
                      color: chartTheme.tooltipText,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: chartTheme.tick, marginBottom: 4 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: chartTheme.tick, paddingTop: 8 }} />
                  {clients.map((client) => (
                    <Area
                      key={client}
                      type="monotone"
                      dataKey={`${client}_cum`}
                      name={client}
                      stroke={clientColor(client)}
                      fill={clientColor(client)}
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No data available</p>
          )}
        </div>
      </div>

      {/* Cross-client overlap + tier × client matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('rollout.overlap')}</h3>
          <div className="flex flex-col gap-3">
            {segments.map((segment) => {
              const pct = overlapTotal > 0 ? (segment.count / overlapTotal) * 100 : 0;
              return (
                <div key={segment.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-300">{t(segment.key)}</span>
                    <span className="text-sm font-mono text-slate-400">
                      {segment.count.toLocaleString()} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-dashboard-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: segment.color }}
                    />
                  </div>
                </div>
              );
            })}
            {!overlapTotal && <p className="text-slate-500 text-sm">No data available</p>}
          </div>
          {!clients.includes('PLUGIN') && (
            <p className="text-xs text-slate-500 mt-4">{t('rollout.noPlugin')}</p>
          )}
        </div>

        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('rollout.tierMatrix')}</h3>
          {data?.tierByClient?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-dashboard-border">
                    <th className="pb-2 pr-4 font-medium">Tier</th>
                    {clients.map((client) => (
                      <th key={client} className="pb-2 pr-4 font-medium text-right">
                        {client}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.tierByClient.map((row) => (
                    <tr key={row.tier} className="border-b border-dashboard-border last:border-b-0">
                      <td className="py-2.5 pr-4 text-slate-200 font-medium">{row.tier}</td>
                      {clients.map((client) => (
                        <td key={client} className="py-2.5 pr-4 text-slate-400 text-right font-mono">
                          {(row.counts[client] ?? 0).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <p className="text-slate-400 text-sm">{t('rollout.singleTier')}</p>
              {!!data?.tiers?.length && (
                <p className="text-slate-500 text-xs mt-2 font-mono">{data.tiers.join(', ')}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Per-user pickup table */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="text-lg font-semibold text-slate-300">{t('rollout.userTable')}</h3>
          {overlapTotal > users.length && (
            <span className="text-xs text-slate-500 font-mono">
              {users.length} / {overlapTotal}
            </span>
          )}
        </div>
        {users.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-dashboard-border">
                  <th className="pb-2 pr-4 font-medium">{t('model.user')}</th>
                  <th className="pb-2 pr-4 font-medium">{t('rollout.segment')}</th>
                  <th className="pb-2 pr-4 font-medium">{t('rollout.firstSeen')}</th>
                  <th className="pb-2 pr-4 font-medium">{t('rollout.lastSeen')}</th>
                  <th className="pb-2 pr-4 font-medium">{t('rollout.firstClient')}</th>
                  <th className="pb-2 pr-4 font-medium">{t('rollout.secondClient')}</th>
                  <th className="pb-2 pr-4 font-medium text-right">{t('rollout.pickupLag')}</th>
                  <th className="pb-2 font-medium text-right">{t('metric.messages')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userid} className="border-b border-dashboard-border last:border-b-0">
                    <td className="py-2.5 pr-4 text-slate-200 font-medium">{user.displayName}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded border border-dashboard-border text-slate-300"
                        style={{
                          borderLeft: `3px solid ${
                            user.segment === 'both'
                              ? '#22c55e'
                              : user.segment === 'ide-only'
                                ? '#9046FF'
                                : '#22d3ee'
                          }`,
                        }}
                      >
                        {t(
                          user.segment === 'both'
                            ? 'rollout.both'
                            : user.segment === 'ide-only'
                              ? 'rollout.ideOnly'
                              : 'rollout.cliOnly'
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400 font-mono">{user.firstSeen}</td>
                    <td className="py-2.5 pr-4 text-slate-400 font-mono">{user.lastSeen}</td>
                    <td className="py-2.5 pr-4 text-slate-400">{user.firstClient}</td>
                    <td className="py-2.5 pr-4 text-slate-400">{user.secondClient ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-right font-mono">
                      {user.pickupLagDays !== null ? (
                        <span className="text-slate-300">{user.pickupLagDays}</span>
                      ) : (
                        <span
                          className="text-slate-500 text-xs font-sans"
                          title={t('rollout.pickupLagExcluded')}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-400 text-right font-mono">
                      {user.totalMessages.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        )}
      </div>
    </div>
  );
}
