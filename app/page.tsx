import Header from '@/app/components/layout/Header';
import MetricCard from '@/app/components/charts/MetricCard';
import TrendChart from '@/app/components/charts/TrendChart';
import ClientPieChart from '@/app/components/charts/PieChart';
import UserBarChart from '@/app/components/charts/BarChart';
import FunnelChart from '@/app/components/charts/FunnelChart';
import { OverviewMetrics, DailyTrend, TopUser, EngagementData, ClientDistribution } from '@/types/dashboard';

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

function formatNumber(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return n.toLocaleString();
}

const PLACEHOLDER_CLIENT_DIST: ClientDistribution[] = [
  { clientType: 'KIRO_IDE', messageCount: 0, creditCount: 0, percentage: 60 },
  { clientType: 'KIRO_CLI', messageCount: 0, creditCount: 0, percentage: 25 },
  { clientType: 'PLUGIN', messageCount: 0, creditCount: 0, percentage: 15 },
];

export default async function OverviewPage() {
  const [metrics, trends, topUsers, engagement] = await Promise.all([
    fetchData<OverviewMetrics>('/api/metrics'),
    fetchData<DailyTrend[]>('/api/trends'),
    fetchData<TopUser[]>('/api/users?limit=10'),
    fetchData<EngagementData>('/api/engagement'),
  ]);

  const changeRates = metrics?.changeRates ?? {};

  const metricCards = [
    {
      title: 'Total Users',
      value: formatNumber(metrics?.totalUsers ?? 0),
      changeRate: changeRates.totalUsers ?? 0,
      accentColor: '#f97316',
    },
    {
      title: 'Messages',
      value: formatNumber(metrics?.totalMessages ?? 0),
      changeRate: changeRates.totalMessages ?? 0,
      accentColor: '#6366f1',
    },
    {
      title: 'Conversations',
      value: formatNumber(metrics?.totalConversations ?? 0),
      changeRate: changeRates.totalConversations ?? 0,
      accentColor: '#0ea5e9',
    },
    {
      title: 'Credits Used',
      value: formatNumber(metrics?.totalCredits ?? 0),
      changeRate: changeRates.totalCredits ?? 0,
      accentColor: '#22d3ee',
    },
    {
      title: 'Overage Credits',
      value: formatNumber(metrics?.totalOverageCredits ?? 0),
      changeRate: changeRates.totalOverageCredits ?? 0,
      accentColor: '#ec4899',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Header title="Overview" subtitle="Platform usage summary for the last 30 days" />

      {/* Metric Cards */}
      <div className="grid grid-cols-5 gap-4">
        {metricCards.map((card) => (
          <MetricCard key={card.title} {...card} />
        ))}
      </div>

      {/* Trend + Pie */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Daily Activity</h3>
          <TrendChart data={trends ?? []} />
        </div>
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <ClientPieChart data={PLACEHOLDER_CLIENT_DIST} title="Client Distribution" />
        </div>
      </div>

      {/* Bar + Funnel */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <UserBarChart data={topUsers ?? []} title="Top Users by Messages" />
        </div>
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <FunnelChart data={engagement?.funnel ?? []} title="Engagement Funnel" />
        </div>
      </div>
    </div>
  );
}
