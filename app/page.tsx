export const dynamic = 'force-dynamic';

import OverviewClient from '@/app/components/OverviewClient';
import { OverviewMetrics, DailyTrend, TopUser, EngagementData, ClientDistribution } from '@/types/dashboard';

const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

async function fetchData<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(baseUrl + path, { cache: 'no-store' });
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

interface IdcUserStatus {
  userId: string;
  displayName: string;
  email: string;
  status: 'active' | 'inactive';
  totalMessages: number;
  totalCredits: number;
  lastActive: string | null;
  organization: string;
}

interface IdcUsersData {
  total: number;
  active: number;
  inactive: number;
  users: IdcUserStatus[];
}

const PLACEHOLDER_IDC_USERS: IdcUsersData = { total: 0, active: 0, inactive: 0, users: [] };

export default async function OverviewPage() {
  const [metrics, trends, topUsers, engagement] = await Promise.all([
    fetchData<OverviewMetrics>('/api/metrics?days=90'),
    fetchData<DailyTrend[]>('/api/trends?days=90'),
    fetchData<TopUser[]>('/api/users?limit=10&days=90'),
    fetchData<EngagementData>('/api/engagement?days=90'),
  ]);

  const cr = metrics?.changeRates ?? {};
  const powerUsers = engagement?.segments?.find(s => s.tier === 'Power')?.count ?? 0;
  const overageUp = (cr.totalOverageCredits ?? 0) > 10;

  const mascotMood = overageUp ? 'alert' as const : powerUsers > 50 ? 'excited' as const : 'happy' as const;

  const clientDistRaw = await fetchData<ClientDistribution[]>('/api/client-dist?days=90');
  const clientDist = Array.isArray(clientDistRaw) ? clientDistRaw : [];

  const idcUsersRaw = await fetchData<IdcUsersData>('/api/idc-users?days=90');
  const idcUsers =
    idcUsersRaw && typeof idcUsersRaw.total === 'number'
      ? idcUsersRaw
      : PLACEHOLDER_IDC_USERS;

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
    clientDist,
    powerUsers,
    overageUp,
    mascotMood,
    idcUsers,
  };

  return <OverviewClient data={serverData} />;
}
