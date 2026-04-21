'use client';

import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';
import TrendChart from '@/app/components/charts/TrendChart';
import { DailyTrend } from '@/types/dashboard';

export default function TrendsPage() {
  const [days, setDays] = useState(30);
  const [trends, setTrends] = useState<DailyTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/trends?days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTrends(data ?? []);
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

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header
        titleKey="header.trends"
        subtitleKey="header.trends.sub"
        mascotMood="thinking"
        days={days}
        onDaysChange={setDays}
      />

      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">Messages &amp; Conversations Over Time</h3>
        <TrendChart data={trends} />
      </div>

      {trends.length > 0 && (
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">Daily Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-dashboard-border">
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider text-slate-500">Date</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wider text-slate-500">Messages</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wider text-slate-500">Conversations</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wider text-slate-500">Credits</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wider text-slate-500">Active Users</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((row) => (
                  <tr key={row.date} className="border-b border-dashboard-border last:border-0 hover:bg-dashboard-card-hover transition-colors">
                    <td className="px-4 py-3 text-slate-300 font-mono text-sm">{row.date}</td>
                    <td className="px-4 py-3 text-right text-slate-200 tabular-nums text-base">{row.messages.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-200 tabular-nums text-base">{row.conversations.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-200 tabular-nums text-base">{row.credits.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-200 tabular-nums text-base">{row.activeUsers.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
