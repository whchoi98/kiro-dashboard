export const dynamic = 'force-dynamic';

import Header from '@/app/components/layout/Header';
import MetricCard from '@/app/components/charts/MetricCard';
import TrendChart from '@/app/components/charts/TrendChart';
import ClientPieChart from '@/app/components/charts/PieChart';
import UserBarChart from '@/app/components/charts/BarChart';
import FunnelChart from '@/app/components/charts/FunnelChart';
import KiroIcon from '@/app/components/ui/KiroIcon';
import OverviewClient from '@/app/components/OverviewClient';
import { OverviewMetrics, DailyTrend, TopUser, EngagementData, ClientDistribution } from '@/types/dashboard';

const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

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

export default async function OverviewPage() {
  const [metrics, trends, topUsers, engagement] = await Promise.all([
    fetchData<OverviewMetrics>('/api/metrics'),
    fetchData<DailyTrend[]>('/api/trends'),
    fetchData<TopUser[]>('/api/users?limit=10'),
    fetchData<EngagementData>('/api/engagement'),
  ]);

  const cr = metrics?.changeRates ?? {};
  const powerUsers = engagement?.segments?.find(s => s.tier === 'Power')?.count ?? 0;
  const overageUp = (cr.overage ?? 0) > 10;

  const mascotMood = overageUp ? 'alert' as const : powerUsers > 50 ? 'excited' as const : 'happy' as const;

  const serverData = {
    metrics: {
      totalUsers: formatNumber(metrics?.totalUsers ?? 0),
      totalMessages: formatNumber(metrics?.totalMessages ?? 0),
      totalConversations: formatNumber(metrics?.totalConversations ?? 0),
      totalCredits: formatNumber(metrics?.totalCredits ?? 0),
      totalOverageCredits: formatNumber(metrics?.totalOverageCredits ?? 0),
    },
    changeRates: cr,
    trends: trends ?? [],
    topUsers: topUsers ?? [],
    funnel: engagement?.funnel ?? [],
    clientDist: PLACEHOLDER_CLIENT_DIST,
    powerUsers,
    overageUp,
    mascotMood,
  };

  return <OverviewClient data={serverData} />;
}
