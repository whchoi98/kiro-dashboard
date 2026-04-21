'use client';

import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { useI18n } from '@/lib/i18n';

interface ProductivitySummary {
  activeUsers: number;
  chatMessages: number;
  aiCodeLines: number;
  inlineSuggestions: number;
  inlineAcceptances: number;
  inlineCodeLines: number;
  inlineChatSessions: number;
  inlineChatAccepts: number;
  devEvents: number;
  devAcceptedLines: number;
  codeReviewFindings: number;
  testsGenerated: number;
  testsAccepted: number;
  docEvents: number;
}

interface ProductivityUser {
  userid: string;
  displayName: string;
  email: string;
  organization: string;
  chatMessages: number;
  aiCodeLines: number;
  inlineAcceptances: number;
  inlineCodeLines: number;
  inlineChatAccepts: number;
  devAcceptedLines: number;
}

interface DailyTrendPoint {
  date: string;
  aiCodeLines: number;
  inlineAcceptances: number;
  chatMessages: number;
  activeUsers: number;
}

interface ProductivityData {
  summary: ProductivitySummary;
  topUsers: ProductivityUser[];
  dailyTrend: DailyTrendPoint[];
}

const TOP_COLORS = ['#f97316', '#6366f1', '#0ea5e9'];
const DEFAULT_COLOR = '#64748b';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function ProductivityPage() {
  const { t } = useI18n();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<ProductivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/productivity?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const s = data?.summary;
  const inlineRate =
    s && s.inlineSuggestions > 0
      ? ((s.inlineAcceptances / s.inlineSuggestions) * 100).toFixed(1)
      : '0.0';

  const topUsers = data?.topUsers ?? [];
  const maxAiLines = topUsers[0]?.aiCodeLines ?? 1;

  const dailyTrend = data?.dailyTrend ?? [];

  return (
    <div
      className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}
    >
      <Header
        titleKey="header.productivity"
        subtitleKey="header.productivity.sub"
        mascotMood="excited"
        days={days}
        onDaysChange={setDays}
      />

      {/* Section 1: KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* AI Code Lines */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderTop: '3px solid #9046FF' }}>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('prod.aiCodeLines')}</p>
          <p className="text-white text-3xl font-bold font-mono">{fmt(s?.aiCodeLines ?? 0)}</p>
          <p className="text-slate-500 text-xs mt-1">chat + inline</p>
        </div>

        {/* Inline Acceptance Rate */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderTop: '3px solid #22c55e' }}>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('prod.inlineRate')}</p>
          <p className="text-white text-3xl font-bold font-mono">{inlineRate}%</p>
          <p className="text-slate-500 text-xs mt-1">{fmt(s?.inlineAcceptances ?? 0)} / {fmt(s?.inlineSuggestions ?? 0)}</p>
        </div>

        {/* Chat Messages */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderTop: '3px solid #3b82f6' }}>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('prod.chatMessages')}</p>
          <p className="text-white text-3xl font-bold font-mono">{fmt(s?.chatMessages ?? 0)}</p>
          <p className="text-slate-500 text-xs mt-1">{fmt(s?.inlineChatSessions ?? 0)} inline chat sessions</p>
        </div>

        {/* Active IDE Users */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderTop: '3px solid #22d3ee' }}>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('prod.activeUsers')}</p>
          <p className="text-white text-3xl font-bold font-mono">{fmt(s?.activeUsers ?? 0)}</p>
          <p className="text-slate-500 text-xs mt-1">unique IDE users</p>
        </div>
      </div>

      {/* Section 2: Feature Usage Cards (3x2) */}
      <div className="grid grid-cols-3 gap-4">
        {/* Chat */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderLeft: '3px solid #9046FF' }}>
          <p className="text-purple-400 text-xs font-bold uppercase tracking-wider mb-3">{t('prod.chat')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Messages</span>
              <span className="text-white font-semibold">{fmt(s?.chatMessages ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">AI Code Lines</span>
              <span className="text-white font-semibold">{fmt(s?.aiCodeLines ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Inline Completion */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderLeft: '3px solid #22c55e' }}>
          <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-3">{t('prod.inlineCompletion')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Accepted</span>
              <span className="text-white font-semibold">{fmt(s?.inlineAcceptances ?? 0)} / {fmt(s?.inlineSuggestions ?? 0)} ({inlineRate}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Code Lines</span>
              <span className="text-white font-semibold">{fmt(s?.inlineCodeLines ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Inline Chat */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderLeft: '3px solid #3b82f6' }}>
          <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-3">{t('prod.inlineChat')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Sessions</span>
              <span className="text-white font-semibold">{fmt(s?.inlineChatSessions ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Accepted</span>
              <span className="text-white font-semibold">{fmt(s?.inlineChatAccepts ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Dev Agent */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderLeft: '3px solid #f97316' }}>
          <p className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-3">{t('prod.devAgent')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Events</span>
              <span className="text-white font-semibold">{fmt(s?.devEvents ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Lines Accepted</span>
              <span className="text-white font-semibold">{fmt(s?.devAcceptedLines ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Code Review */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderLeft: '3px solid #f43f5e' }}>
          <p className="text-rose-400 text-xs font-bold uppercase tracking-wider mb-3">{t('prod.codeReview')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Findings</span>
              <span className="text-white font-semibold">{fmt(s?.codeReviewFindings ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Test / Doc Generation */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border" style={{ borderLeft: '3px solid #22d3ee' }}>
          <p className="text-cyan-400 text-xs font-bold uppercase tracking-wider mb-3">{t('prod.testDoc')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Tests Generated</span>
              <span className="text-white font-semibold">{fmt(s?.testsGenerated ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Doc Events</span>
              <span className="text-white font-semibold">{fmt(s?.docEvents ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Top Users by AI Code Lines */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('prod.topUsers')}</h3>
        {topUsers.length > 0 ? (
          <div style={{ height: Math.max(200, topUsers.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topUsers}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => fmt(v)}
                />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={130}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    color: '#f1f5f9',
                    fontSize: 12,
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(value: number) => [fmt(value), 'AI Code Lines']}
                />
                <Bar dataKey="aiCodeLines" name="AI Code Lines" radius={[0, 4, 4, 0]}>
                  {topUsers.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index < 3 ? TOP_COLORS[index] : DEFAULT_COLOR}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        )}
      </div>

      {/* Section 4: Daily Trend */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('prod.dailyTrend')}</h3>
        {dailyTrend.length > 0 ? (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                  width={50}
                  tickFormatter={(v: number) => fmt(v)}
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
                  cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                  formatter={(value: number) => [fmt(value)]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="aiCodeLines"
                  name="AI Code Lines"
                  stroke="#9046FF"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="inlineAcceptances"
                  name="Inline Acceptances"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        )}
      </div>
    </div>
  );
}
