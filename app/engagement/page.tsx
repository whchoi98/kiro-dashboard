import Header from '@/app/components/layout/Header';
import ClientPieChart from '@/app/components/charts/PieChart';
import FunnelChart from '@/app/components/charts/FunnelChart';
import { EngagementData, ClientDistribution } from '@/types/dashboard';

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

const TIER_META: Record<string, { color: string; description: string; icon: string }> = {
  Power: {
    color: '#f97316',
    description: '100+ messages or 20+ conversations',
    icon: '⚡',
  },
  Active: {
    color: '#6366f1',
    description: '20+ messages or 5+ conversations',
    icon: '🚀',
  },
  Light: {
    color: '#0ea5e9',
    description: 'At least 1 message sent',
    icon: '💬',
  },
  Idle: {
    color: '#64748b',
    description: 'No messages in the period',
    icon: '😴',
  },
};

export default async function EngagementPage() {
  const engagement = await fetchData<EngagementData>('/api/engagement');

  // Build segments pie data as ClientDistribution (reusing the pie component)
  const segmentsPieData: ClientDistribution[] = (engagement?.segments ?? []).map((seg) => ({
    clientType: seg.tier,
    messageCount: seg.count,
    creditCount: 0,
    percentage: seg.percentage,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Header titleKey="header.engagement" subtitleKey="header.engagement.sub" mascotMood="excited" />

      {/* Pie + Funnel */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <ClientPieChart data={segmentsPieData} title="User Segments" />
        </div>
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <FunnelChart data={engagement?.funnel ?? []} title="Engagement Funnel" />
        </div>
      </div>

      {/* Tier detail cards */}
      <div className="grid grid-cols-4 gap-4">
        {(engagement?.segments ?? []).map((seg) => {
          const meta = TIER_META[seg.tier] ?? { color: '#64748b', description: '', icon: '?' };
          return (
            <div
              key={seg.tier}
              className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border"
              style={{ borderTop: `3px solid ${meta.color}` }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xl">{meta.icon}</span>
                <span
                  className="text-sm font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: meta.color, backgroundColor: `${meta.color}22` }}
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
        {!engagement?.segments.length && (
          <div className="col-span-4 text-slate-500 text-sm">No data available</div>
        )}
      </div>
    </div>
  );
}
