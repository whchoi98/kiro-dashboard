'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { UserDetailResponse } from '@/app/api/user-detail/route';

interface UserDetailPanelProps {
  userId: string | null;
  days: number;
  onClose: () => void;
}

const CLIENT_BADGE: Record<string, string> = {
  KIRO_IDE: 'bg-violet-500/20 text-violet-300 border-violet-700/50',
  KIRO_CLI: 'bg-cyan-500/20 text-cyan-300 border-cyan-700/50',
  PLUGIN: 'bg-emerald-500/20 text-emerald-300 border-emerald-700/50',
};

function ClientBadge({ clientType }: { clientType: string }) {
  const colorClass =
    CLIENT_BADGE[clientType] ?? 'bg-gray-700/50 text-gray-300 border-gray-600/50';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wide ${colorClass}`}>
      {clientType || '—'}
    </span>
  );
}

interface SmallMetricCardProps {
  label: string;
  value: string | number;
  accent?: string;
}

function SmallMetricCard({ label, value, accent = '#9046FF' }: SmallMetricCardProps) {
  return (
    <div
      className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 flex flex-col gap-1"
      style={{ borderColor: `${accent}30` }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </span>
      <span className="text-xl font-bold font-mono text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

export default function UserDetailPanel({ userId, days, onClose }: UserDetailPanelProps) {
  const { t } = useI18n();
  const [data, setData] = useState<UserDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = userId !== null;

  useEffect(() => {
    if (!userId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/user-detail?userid=${encodeURIComponent(userId)}&days=${days}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, days]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Compute max messages for client breakdown bars
  const maxMessages =
    data?.clientBreakdown.reduce((m, c) => Math.max(m, c.messages), 1) ?? 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] z-50 flex flex-col bg-[#0a0a0a] border-l border-gray-800 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="flex flex-col gap-0.5 min-w-0 pr-4">
            {loading || !data ? (
              <div className="h-5 w-40 bg-gray-800 rounded animate-pulse" />
            ) : (
              <>
                <h2 className="text-lg font-bold text-white leading-tight truncate">
                  {data.displayName}
                </h2>
                <span className="text-xs font-mono text-gray-400 truncate">
                  {data.email || '—'}
                </span>
                {data.organization && (
                  <span className="mt-1 inline-block self-start px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#9046FF]/20 text-purple-300 border border-[#9046FF]/30">
                    {data.organization}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-500 hover:text-white transition-colors p-1 rounded-md hover:bg-gray-800"
            aria-label="Close panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {error && (
            <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col gap-4 animate-pulse">
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-gray-800" />
                ))}
              </div>
              <div className="h-4 bg-gray-800 rounded w-1/3" />
              <div className="flex flex-col gap-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-8 bg-gray-800 rounded" />
                ))}
              </div>
            </div>
          )}

          {!loading && data && (
            <>
              {/* Summary grid */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                  {t('userDetail.title')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <SmallMetricCard
                    label={t('metric.messages')}
                    value={data.summary.totalMessages}
                    accent="#6366f1"
                  />
                  <SmallMetricCard
                    label={t('metric.conversations')}
                    value={data.summary.totalConversations}
                    accent="#0ea5e9"
                  />
                  <SmallMetricCard
                    label={t('metric.creditsUsed')}
                    value={data.summary.totalCredits.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    accent="#22d3ee"
                  />
                  <SmallMetricCard
                    label={t('userDetail.activeDays')}
                    value={data.summary.activeDays}
                    accent="#9046FF"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg border border-gray-800 bg-gray-900/40">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                      {t('userDetail.firstActive')}
                    </span>
                    <span className="text-sm font-mono text-gray-300">
                      {data.summary.firstActive || '—'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg border border-gray-800 bg-gray-900/40">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                      {t('userDetail.lastActive')}
                    </span>
                    <span className="text-sm font-mono text-gray-300">
                      {data.summary.lastActive || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Client breakdown */}
              {data.clientBreakdown.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                    {t('userDetail.clientBreakdown')}
                  </p>
                  <div className="flex flex-col gap-2">
                    {data.clientBreakdown.map((cb) => {
                      const pct = Math.round((cb.messages / maxMessages) * 100);
                      return (
                        <div key={cb.clientType} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <ClientBadge clientType={cb.clientType} />
                            <span className="font-mono text-gray-300">
                              {cb.messages.toLocaleString()} msgs
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#9046FF] transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Daily activity table */}
              {data.dailyActivity.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                    {t('userDetail.dailyActivity')}
                  </p>
                  <div className="rounded-xl border border-gray-800 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 bg-gray-900/70">
                          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                            Date
                          </th>
                          <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                            Client
                          </th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                            Msgs
                          </th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                            Conv
                          </th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                            Credits
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.dailyActivity.map((row, i) => (
                          <tr
                            key={`${row.date}-${row.clientType}-${i}`}
                            className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors"
                          >
                            <td className="px-3 py-2 text-sm font-mono text-gray-300 whitespace-nowrap">
                              {row.date}
                            </td>
                            <td className="px-3 py-2">
                              <ClientBadge clientType={row.clientType} />
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-mono text-gray-200 tabular-nums">
                              {row.messages.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-mono text-gray-200 tabular-nums">
                              {row.conversations.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-mono text-gray-200 tabular-nums">
                              {row.credits.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.dailyActivity.length === 0 && !loading && (
                <p className="text-sm text-gray-600 text-center py-6">
                  No activity in the selected period.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
