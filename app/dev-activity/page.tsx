'use client';

import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Header from '@/app/components/layout/Header';
import { DevActivityData, DevActivityGroup } from '@/types/dashboard';

const GROUP_ORDER = ['TestGen', 'DocGen', 'Transform', 'InlineChat', 'CodeFix'] as const;

const GROUP_COLORS: Record<string, string> = {
  TestGen: '#22d3ee',
  DocGen: '#6366f1',
  Transform: '#f97316',
  InlineChat: '#9046FF',
  CodeFix: '#0ea5e9',
};

const EMPTY_GROUP = (key: string): DevActivityGroup => ({
  key,
  events: 0,
  generated: 0,
  accepted: 0,
  acceptanceRate: 0,
});

export default function DevActivityPage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<DevActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dev-activity?days=${days}`)
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

  const groups: DevActivityGroup[] = GROUP_ORDER.map(
    (key) => data?.groups?.find((g) => g.key === key) ?? EMPTY_GROUP(key)
  );

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header
        titleKey="header.devActivity"
        subtitleKey="header.devActivity.sub"
        mascotMood="thinking"
        mascotTheme="productivity"
        days={days}
        onDaysChange={setDays}
      />

      {/* Activity group cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {groups.map((group) => (
          <div key={group.key} className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: GROUP_COLORS[group.key] ?? '#64748b' }}
              />
              <span className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                {group.key}
              </span>
            </div>
            <p className="text-3xl font-bold font-mono text-white mb-1">
              {group.events.toLocaleString()}
            </p>
            <p className="text-slate-500 text-sm mb-3">events</p>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-slate-400">
                {group.generated.toLocaleString()} gen / {group.accepted.toLocaleString()} acc
              </span>
              <span className="text-slate-300 font-mono">{group.acceptanceRate.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-dashboard-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, group.acceptanceRate))}%`,
                  backgroundColor: GROUP_COLORS[group.key] ?? '#64748b',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Stacked daily events chart */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">Daily Activity Events</h3>
        {data?.trend?.length ? (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    color: '#f1f5f9',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }} />
                {GROUP_ORDER.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={key}
                    stackId="a"
                    fill={GROUP_COLORS[key]}
                    radius={index === GROUP_ORDER.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        )}
      </div>

      {/* Top 10 users table */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">Top 10 Users by Activity Events</h3>
        {data?.topUsers?.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-dashboard-border">
                <th className="pb-2 pr-4 font-medium w-10">#</th>
                <th className="pb-2 pr-4 font-medium">User</th>
                <th className="pb-2 pr-4 font-medium text-right">Events</th>
                <th className="pb-2 font-medium text-right">Accepted Lines</th>
              </tr>
            </thead>
            <tbody>
              {data.topUsers.map((user, index) => (
                <tr key={user.userid} className="border-b border-dashboard-border last:border-b-0">
                  <td className="py-2.5 pr-4 text-slate-500 font-mono">#{index + 1}</td>
                  <td className="py-2.5 pr-4 text-slate-200 font-medium">{user.displayName}</td>
                  <td className="py-2.5 pr-4 text-slate-400 text-right font-mono">
                    {user.events.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-slate-400 text-right font-mono">
                    {user.acceptedLines.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        )}
      </div>
    </div>
  );
}
