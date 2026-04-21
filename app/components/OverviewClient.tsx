'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import Header from '@/app/components/layout/Header';
import MetricCard from '@/app/components/charts/MetricCard';
import TrendChart from '@/app/components/charts/TrendChart';
import ClientPieChart from '@/app/components/charts/PieChart';
import UserBarChart from '@/app/components/charts/BarChart';
import FunnelChart from '@/app/components/charts/FunnelChart';
import KiroIcon from '@/app/components/ui/KiroIcon';
import IdcUserStatusComponent from '@/app/components/charts/IdcUserStatus';
import { OverviewMetrics, DailyTrend, TopUser, EngagementData, FunnelStep, ClientDistribution } from '@/types/dashboard';
import type { IdcUserStatus } from '@/app/components/charts/IdcUserStatus';

interface IdcUsersData {
  total: number;
  active: number;
  inactive: number;
  users: IdcUserStatus[];
}

interface OverviewData {
  metrics: {
    totalUsers: string;
    totalMessages: string;
    totalConversations: string;
    totalCredits: string;
    totalOverageCredits: string;
  };
  changeRates: Record<string, number>;
  trends: DailyTrend[];
  topUsers: TopUser[];
  funnel: FunnelStep[];
  clientDist: ClientDistribution[];
  powerUsers: number;
  overageUp: boolean;
  mascotMood: 'happy' | 'excited' | 'thinking' | 'alert';
  idcUsers: IdcUsersData;
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

const PLACEHOLDER_IDC_USERS: IdcUsersData = { total: 0, active: 0, inactive: 0, users: [] };

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchAll(days: number): Promise<OverviewData> {
  const [metrics, trends, users, engagement] = await Promise.all([
    safeFetch<OverviewMetrics>(`/api/metrics?days=${days}`),
    safeFetch<DailyTrend[]>(`/api/trends?days=${days}`),
    safeFetch<TopUser[]>(`/api/users?days=${days}&limit=10`),
    safeFetch<EngagementData>(`/api/engagement?days=${days}`),
  ]);

  const cr = metrics?.changeRates ?? {};
  const powerUsers = engagement?.segments?.find((s: { tier: string }) => s.tier === 'Power')?.count ?? 0;
  const overageUp = (cr.totalOverageCredits ?? 0) > 10;
  const mascotMood = overageUp ? ('alert' as const) : powerUsers > 50 ? ('excited' as const) : ('happy' as const);

  const [clientDistData, idcUsersData] = await Promise.all([
    safeFetch<ClientDistribution[]>(`/api/client-dist?days=${days}`),
    safeFetch<IdcUsersData>(`/api/idc-users?days=${days}`),
  ]);

  return {
    metrics: {
      totalUsers: formatNumber(metrics?.totalUsers ?? 0),
      totalMessages: formatNumber(metrics?.totalMessages ?? 0),
      totalConversations: formatNumber(metrics?.totalConversations ?? 0),
      totalCredits: formatNumber(metrics?.totalCredits ?? 0),
      totalOverageCredits: formatNumber(metrics?.totalOverageCredits ?? 0),
    },
    changeRates: cr,
    trends: trends ?? [],
    topUsers: users ?? [],
    funnel: engagement?.funnel ?? [],
    clientDist: Array.isArray(clientDistData) ? clientDistData : PLACEHOLDER_CLIENT_DIST,
    powerUsers,
    overageUp,
    mascotMood,
    idcUsers: (idcUsersData && typeof idcUsersData.total === 'number') ? idcUsersData : PLACEHOLDER_IDC_USERS,
  };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-gray-800" />
      <KiroIcon size={14} />
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

export default function OverviewClient({ data }: { data: OverviewData }) {
  const { t } = useI18n();
  const [days, setDays] = useState(30);
  const [liveData, setLiveData] = useState(data);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Skip initial render — we already have server data for the default 30-day window
    if (!initialized) {
      setInitialized(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchAll(days)
      .then((result) => {
        if (!cancelled) setLiveData(result);
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
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const { metrics, changeRates: cr, trends, topUsers, funnel, clientDist, powerUsers, overageUp, mascotMood, idcUsers } = liveData;

  return (
    <div className={`flex flex-col gap-5 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header
        titleKey="header.overview"
        subtitleKey="header.overview.sub"
        mascotMood={mascotMood}
        days={days}
        onDaysChange={setDays}
      />

      {/* Row 1: Usage & Activity */}
      <SectionLabel>{t('section.usage')}</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          title={t('metric.totalUsers')}
          value={metrics.totalUsers}
          changeRate={cr.totalUsers ?? 0}
          accentColor="#9046FF"
          subtitle={t('metric.unique')}
          detail={t('metric.activeAccounts')}
          icon={
            <StatusIcon color="#9046FF">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </StatusIcon>
          }
        />
        <MetricCard
          title={t('metric.messages')}
          value={metrics.totalMessages}
          changeRate={cr.totalMessages ?? 0}
          accentColor="#6366f1"
          subtitle={t('metric.total')}
          detail={t('metric.chatMessages')}
          icon={
            <StatusIcon color="#6366f1">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </StatusIcon>
          }
        />
        <MetricCard
          title={t('metric.conversations')}
          value={metrics.totalConversations}
          changeRate={cr.totalConversations ?? 0}
          accentColor="#0ea5e9"
          subtitle={t('metric.sessions')}
          detail={t('metric.chatSessions')}
          icon={
            <StatusIcon color="#0ea5e9">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </StatusIcon>
          }
        />
        <MetricCard
          title={t('metric.creditsUsed')}
          value={metrics.totalCredits}
          changeRate={cr.totalCredits ?? 0}
          accentColor="#22d3ee"
          subtitle={t('metric.credits')}
          detail={t('metric.baseCreditUsage')}
          icon={
            <StatusIcon color="#22d3ee">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </StatusIcon>
          }
        />
        <MetricCard
          title={t('metric.overage')}
          value={metrics.totalOverageCredits}
          changeRate={cr.totalOverageCredits ?? 0}
          accentColor="#ec4899"
          subtitle={t('metric.overage.label')}
          detail={t('metric.overageCreditUsage')}
          icon={
            <StatusIcon color="#ec4899">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </StatusIcon>
          }
        />
      </div>

      {/* Active Insights Banner */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-4 py-2.5 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <KiroIcon size={16} />
          <span className="text-gray-400 font-medium uppercase tracking-wider">{t('insights.title')}</span>
        </div>
        <div className="h-4 w-px bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-gray-400">{metrics.totalUsers} {t('insights.activeUsers')}</span>
        </div>
        <div className="h-4 w-px bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span className="text-gray-400">{powerUsers} {t('insights.powerUsers')}</span>
        </div>
        <div className="h-4 w-px bg-gray-700" />
        {overageUp ? (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-400">{t('insights.overageTrending')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-gray-400">{t('insights.creditNormal')}</span>
          </div>
        )}
      </div>

      {/* IdC User Status */}
      <SectionLabel>{t('section.idcUsers')}</SectionLabel>
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <IdcUserStatusComponent data={idcUsers} />
      </div>

      {/* Row 2: Charts */}
      <SectionLabel>{t('section.trends')}</SectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">{t('chart.dailyActivity')}</h3>
          <TrendChart data={trends} />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <ClientPieChart data={clientDist} title={t('chart.clientDist')} />
        </div>
      </div>

      {/* Row 3: Rankings & Funnel */}
      <SectionLabel>{t('section.users')}</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <UserBarChart data={topUsers} title={t('chart.topUsers')} />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <FunnelChart data={funnel} title={t('chart.funnel')} />
        </div>
      </div>
    </div>
  );
}
