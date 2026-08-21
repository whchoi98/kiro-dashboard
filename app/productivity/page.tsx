'use client';

import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';
import { SkeletonGate } from '@/app/components/ui/PageSkeleton';
import { pageBodyOpacityClass } from '@/lib/skeleton-layout';
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
import { useChartTheme } from '@/lib/chart-theme';
import { CreditEfficiency } from '@/types/dashboard';
import { useRefresh } from '@/lib/refresh';

interface ProductivitySummary {
  activeUsers: number;
  chatMessages: number;
  chatMessagesInteracted: number;
  aiCodeLines: number;
  inlineSuggestions: number;
  inlineAcceptances: number;
  inlineCodeLines: number;
  inlineChatSessions: number;
  inlineChatAccepts: number;
  devEvents: number;
  devGeneratedLines: number;
  devAcceptanceEvents: number;
  devAcceptedLines: number;
  codeReviewFindings: number;
  codeReviewSucceeded: number;
  codeReviewFailed: number;
  testsGenerated: number;
  testsAccepted: number;
  docEvents: number;
  // `null` when the underlying counter is not instrumented in this account —
  // rendered as an explicit "not instrumented" label, never as 0%.
  inlineAcceptanceRate: number | null;
  chatInteractionRate: number | null;
  devAcceptanceRate: number | null;
  codeReviewSuccessRate: number | null;
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
  creditEfficiency?: CreditEfficiency;
}

const TOP_COLORS = ['#f97316', '#6366f1', '#0ea5e9'];
const DEFAULT_COLOR = '#64748b';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function ProductivityPage() {
  const { nonce } = useRefresh();
  const { t } = useI18n();
  const chartTheme = useChartTheme();
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
  }, [days, nonce]);

  const s = data?.summary;
  const credit = data?.creditEfficiency;

  /**
   * Rates arrive from the route as `number | null` — null meaning the
   * denominator column isn't instrumented in this account. Rendering that as
   * "0.0%" would be a false measurement claim, so it becomes an em dash with
   * an explanatory label instead.
   */
  const pct = (value: number | null | undefined): string =>
    value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;

  const inlineRate = pct(s?.inlineAcceptanceRate);

  const topUsers = data?.topUsers ?? [];
  const maxAiLines = topUsers[0]?.aiCodeLines ?? 1;

  const dailyTrend = data?.dailyTrend ?? [];

  return (
    <div
      className={`flex flex-col gap-6 transition-opacity duration-200 ${pageBodyOpacityClass(loading, data !== null)}`}
    >
      <Header
        titleKey="header.productivity"
        subtitleKey="header.productivity.sub"
        mascotMood="excited"
        mascotTheme="productivity"
        days={days}
        onDaysChange={setDays}
      />

      <SkeletonGate variant="overview" loading={loading} hasData={data !== null}>
      {/* Section 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* AI Code Lines */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('prod.aiCodeLines')}</p>
          <p className="text-white text-3xl font-bold font-mono">{fmt(s?.aiCodeLines ?? 0)}</p>
          <p className="text-slate-500 text-xs mt-1">chat + inline</p>
        </div>

        {/* Inline Acceptance Rate */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('prod.inlineRate')}</p>
          <p className="text-white text-3xl font-bold font-mono">{inlineRate}</p>
          <p className="text-slate-500 text-xs mt-1">
            {s?.inlineAcceptanceRate === null
              ? t('prod.notInstrumented')
              : `${fmt(s?.inlineAcceptances ?? 0)} / ${fmt(s?.inlineSuggestions ?? 0)}`}
          </p>
        </div>

        {/* Chat Messages */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('prod.chatMessages')}</p>
          <p className="text-white text-3xl font-bold font-mono">{fmt(s?.chatMessages ?? 0)}</p>
          <p className="text-slate-500 text-xs mt-1">{fmt(s?.inlineChatSessions ?? 0)} inline chat sessions</p>
        </div>

        {/* Active IDE Users */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('prod.activeUsers')}</p>
          <p className="text-white text-3xl font-bold font-mono">{fmt(s?.activeUsers ?? 0)}</p>
          <p className="text-slate-500 text-xs mt-1">unique IDE users</p>
        </div>
      </div>

      {/* Credits per accepted AI code line. A credit RATIO — never a price;
          Kiro publishes no credit→currency rate, so no currency symbol here.
          The two sums come from different reports over different populations,
          which is why both `n` values are shown side by side. */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-lg font-semibold text-slate-300">{t('prod.creditsPerLine')}</h3>
          {credit?.windowStart && credit?.windowEnd && (
            <span className="text-xs text-slate-500 font-mono">
              {credit.windowStart} → {credit.windowEnd}
            </span>
          )}
        </div>
        {credit?.available && credit.creditsPerLine !== null ? (
          <>
            <p className="text-white text-3xl font-bold font-mono mt-3">
              {credit.creditsPerLine.toFixed(4)}
            </p>
            <p className="text-slate-400 text-sm mt-2 font-mono">
              {fmt(Math.round(credit.credits))}
              <span className="text-slate-600"> ÷ </span>
              {fmt(Math.round(credit.acceptedLines))}
            </p>
            <p className="text-slate-500 text-xs mt-1">{t('prod.creditsPerLineDetail')}</p>
            {/* The two sums cover DIFFERENT populations, so a single `n` would
                be a lie — both are shown. */}
            <p className="text-slate-500 text-xs mt-1 font-mono">
              n = {credit.creditUsers} (credits) · {credit.lineUsers} (lines)
            </p>
          </>
        ) : (
          <p className="text-slate-400 text-sm mt-3">{t('prod.creditsPerLineUnavailable')}</p>
        )}
        <p className="text-slate-500 text-xs mt-3">{t('prod.creditsPerLineNote')}</p>
      </div>

      {/* Section 2: Feature Usage Cards (3x2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* Chat */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
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
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Interacted</span>
              <span className="text-white font-semibold">
                {s?.chatInteractionRate === null
                  ? t('prod.notInstrumented')
                  : `${fmt(s?.chatMessagesInteracted ?? 0)} (${pct(s?.chatInteractionRate)})`}
              </span>
            </div>
          </div>
        </div>

        {/* Inline Completion */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
          <p className="text-green-400 text-xs font-bold uppercase tracking-wider mb-3">{t('prod.inlineCompletion')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Accepted</span>
              <span className="text-white font-semibold">{fmt(s?.inlineAcceptances ?? 0)} / {fmt(s?.inlineSuggestions ?? 0)} ({inlineRate})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Code Lines</span>
              <span className="text-white font-semibold">{fmt(s?.inlineCodeLines ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Inline Chat */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
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
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
          <p className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-3">{t('prod.devAgent')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Events</span>
              <span className="text-white font-semibold">{fmt(s?.devEvents ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Lines Accepted</span>
              <span className="text-white font-semibold">
                {fmt(s?.devAcceptedLines ?? 0)} / {fmt(s?.devGeneratedLines ?? 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Acceptance</span>
              <span className="text-white font-semibold">
                {s?.devAcceptanceRate === null
                  ? t('prod.notInstrumented')
                  : `${pct(s?.devAcceptanceRate)} · ${fmt(s?.devAcceptanceEvents ?? 0)} ev`}
              </span>
            </div>
          </div>
        </div>

        {/* Code Review */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
          <p className="text-rose-400 text-xs font-bold uppercase tracking-wider mb-3">{t('prod.codeReview')}</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Findings</span>
              <span className="text-white font-semibold">{fmt(s?.codeReviewFindings ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Succeeded</span>
              <span className="text-white font-semibold">
                {s?.codeReviewSuccessRate === null
                  ? t('prod.notInstrumented')
                  : `${fmt(s?.codeReviewSucceeded ?? 0)} / ${fmt(
                      (s?.codeReviewSucceeded ?? 0) + (s?.codeReviewFailed ?? 0)
                    )} (${pct(s?.codeReviewSuccessRate)})`}
              </span>
            </div>
          </div>
        </div>

        {/* Test / Doc Generation */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-all hover:border-gray-600 hover:bg-gray-900/70">
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
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
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
                  tick={{ fill: chartTheme.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => fmt(v)}
                />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  tick={{ fill: chartTheme.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={130}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTheme.tooltipBg,
                    border: `1px solid ${chartTheme.tooltipBorder}`,
                    borderRadius: 8,
                    color: chartTheme.tooltipText,
                    fontSize: 12,
                  }}
                  cursor={{ fill: chartTheme.cursorFill }}
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
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('prod.dailyTrend')}</h3>
        {dailyTrend.length > 0 ? (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fill: chartTheme.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: chartTheme.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                  tickFormatter={(v: number) => fmt(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTheme.tooltipBg,
                    border: `1px solid ${chartTheme.tooltipBorder}`,
                    borderRadius: 8,
                    color: chartTheme.tooltipText,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: chartTheme.tick, marginBottom: 4 }}
                  cursor={{ stroke: chartTheme.cursorFill }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: chartTheme.tick, paddingTop: 8 }}
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
      </SkeletonGate>
    </div>
  );
}
