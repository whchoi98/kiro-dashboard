'use client';

import { useState, useEffect } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Header from '@/app/components/layout/Header';
import MetricCard from '@/app/components/charts/MetricCard';
import { AdoptionData } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#f1f5f9',
  fontSize: 12,
};

export default function AdoptionPage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<AdoptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/adoption?days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d ?? null); })
      .catch(() => {
        // Keep existing data on error
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const newUsers = data?.totals.newUsers ?? 0;
  const activeUsers = data?.totals.activeUsers ?? 0;
  const newUserRatio = activeUsers > 0 ? (newUsers / activeUsers) * 100 : 0;

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header
        titleKey="header.adoption"
        subtitleKey="header.adoption.sub"
        mascotMood="excited"
        mascotTheme="users"
        days={days}
        onDaysChange={setDays}
      />

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          title="New Users"
          value={newUsers.toLocaleString()}
          changeRate={0}
          accentColor="#84cc16"
          detail={`Last ${days} days`}
        />
        <MetricCard
          title="Active Users"
          value={activeUsers.toLocaleString()}
          changeRate={0}
          accentColor="#9046FF"
          detail={`Last ${days} days`}
        />
        <MetricCard
          title="New-User Ratio"
          value={`${newUserRatio.toFixed(1)}%`}
          changeRate={0}
          accentColor="#22d3ee"
          detail="New / active users"
        />
      </div>

      {/* New users + cumulative users trend */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">New Users & Cumulative Adoption</h3>
        {(data?.trend.length ?? 0) > 0 ? (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data!.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }} />
                <Bar
                  yAxisId="left"
                  dataKey="newUsers"
                  name="New Users"
                  fill="#84cc16"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulativeUsers"
                  name="Cumulative Users"
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

      {/* Recent new users table */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">Recent New Users</h3>
        {(data?.recentNewUsers.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dashboard-border">
                  <th className="text-left text-slate-400 font-medium py-2 px-3">#</th>
                  <th className="text-left text-slate-400 font-medium py-2 px-3">User</th>
                  <th className="text-left text-slate-400 font-medium py-2 px-3">First Seen</th>
                  <th className="text-left text-slate-400 font-medium py-2 px-3">Client</th>
                  <th className="text-right text-slate-400 font-medium py-2 px-3">Messages</th>
                  <th className="text-right text-slate-400 font-medium py-2 px-3">Credits</th>
                </tr>
              </thead>
              <tbody>
                {data!.recentNewUsers.map((user, i) => (
                  <tr key={user.userid} className="border-b border-dashboard-border/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-500 font-mono">#{i + 1}</td>
                    <td className="py-2.5 px-3 text-slate-200">{user.displayName}</td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono">{user.firstDate}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#84cc16]/10 text-[#84cc16]">
                        {user.clientType || '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-mono">{user.totalMessages.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-white font-mono font-semibold">{user.totalCredits.toLocaleString()}</td>
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
