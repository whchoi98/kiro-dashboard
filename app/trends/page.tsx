import Header from '@/app/components/layout/Header';
import TrendChart from '@/app/components/charts/TrendChart';
import { DailyTrend } from '@/types/dashboard';

const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

async function fetchData<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(baseUrl + path, {
      next: { revalidate: 300, tags: ['dashboard'] },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export default async function TrendsPage() {
  const trends = await fetchData<DailyTrend[]>('/api/trends');

  return (
    <div className="flex flex-col gap-6">
      <Header titleKey="header.trends" subtitleKey="header.trends.sub" mascotMood="thinking" />

      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">Messages & Conversations Over Time</h3>
        <TrendChart data={trends ?? []} />
      </div>

      {/* Summary table */}
      {trends && trends.length > 0 && (
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
