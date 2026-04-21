import Header from '@/app/components/layout/Header';
import MetricCard from '@/app/components/charts/MetricCard';
import TrendChart from '@/app/components/charts/TrendChart';
import ClientPieChart from '@/app/components/charts/PieChart';
import UserBarChart from '@/app/components/charts/BarChart';
import FunnelChart from '@/app/components/charts/FunnelChart';
import KiroIcon from '@/app/components/ui/KiroIcon';
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
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

const PLACEHOLDER_CLIENT_DIST: ClientDistribution[] = [
  { clientType: 'KIRO_IDE', messageCount: 0, creditCount: 0, percentage: 60 },
  { clientType: 'KIRO_CLI', messageCount: 0, creditCount: 0, percentage: 25 },
  { clientType: 'PLUGIN', messageCount: 0, creditCount: 0, percentage: 15 },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-gray-800" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
        {children}
      </span>
      <div className="h-px flex-1 bg-gray-800" />
    </div>
  );
}

function StatusIcon({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export default async function OverviewPage() {
  const [metrics, trends, topUsers, engagement] = await Promise.all([
    fetchData<OverviewMetrics>('/api/metrics'),
    fetchData<DailyTrend[]>('/api/trends'),
    fetchData<TopUser[]>('/api/users?limit=10'),
    fetchData<EngagementData>('/api/engagement'),
  ]);

  const cr = metrics?.changeRates ?? {};

  return (
    <div className="flex flex-col gap-5">
      <Header title="Overview" subtitle="Kiro usage analytics across all users" />

      {/* Row 1: Usage & Activity */}
      <SectionLabel>Usage &amp; Activity</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          title="Total Users"
          value={formatNumber(metrics?.totalUsers ?? 0)}
          changeRate={cr.users ?? 0}
          accentColor="#f97316"
          subtitle="unique"
          detail="Active accounts"
          icon={
            <StatusIcon color="#f97316">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </StatusIcon>
          }
        />
        <MetricCard
          title="Messages"
          value={formatNumber(metrics?.totalMessages ?? 0)}
          changeRate={cr.messages ?? 0}
          accentColor="#6366f1"
          subtitle="total"
          detail="Chat messages sent"
          icon={
            <StatusIcon color="#6366f1">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </StatusIcon>
          }
        />
        <MetricCard
          title="Conversations"
          value={formatNumber(metrics?.totalConversations ?? 0)}
          changeRate={cr.conversations ?? 0}
          accentColor="#0ea5e9"
          subtitle="sessions"
          detail="Chat sessions"
          icon={
            <StatusIcon color="#0ea5e9">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </StatusIcon>
          }
        />
        <MetricCard
          title="Credits Used"
          value={formatNumber(metrics?.totalCredits ?? 0)}
          changeRate={cr.credits ?? 0}
          accentColor="#22d3ee"
          subtitle="credits"
          detail="Base credit usage"
          icon={
            <StatusIcon color="#22d3ee">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </StatusIcon>
          }
        />
        <MetricCard
          title="Overage"
          value={formatNumber(metrics?.totalOverageCredits ?? 0)}
          changeRate={cr.overage ?? 0}
          accentColor="#ec4899"
          subtitle="overage"
          detail="Overage credit usage"
          icon={
            <StatusIcon color="#ec4899">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </StatusIcon>
          }
        />
      </div>

      {/* Active Warnings Banner */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-4 py-2.5 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <KiroIcon size={16} />
          <span className="text-gray-400 font-medium uppercase tracking-wider">Active Insights</span>
        </div>
        <div className="h-4 w-px bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-gray-400">{formatNumber(metrics?.totalUsers ?? 0)} active users</span>
        </div>
        <div className="h-4 w-px bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span className="text-gray-400">
            {engagement?.segments?.find(s => s.tier === 'Power')?.count ?? 0} power users
          </span>
        </div>
        <div className="h-4 w-px bg-gray-700" />
        {(cr.overage ?? 0) > 10 ? (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-400">Overage credits trending up</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-gray-400">Credit usage normal</span>
          </div>
        )}
      </div>

      {/* Row 2: Charts */}
      <SectionLabel>Daily Trends &amp; Distribution</SectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Daily Activity</h3>
          <TrendChart data={trends ?? []} />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <ClientPieChart data={PLACEHOLDER_CLIENT_DIST} title="Client Distribution" />
        </div>
      </div>

      {/* Row 3: Rankings & Funnel */}
      <SectionLabel>Users &amp; Engagement</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <UserBarChart data={topUsers ?? []} title="Top Users by Messages" />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <FunnelChart data={engagement?.funnel ?? []} title="Engagement Funnel" />
        </div>
      </div>
    </div>
  );
}
