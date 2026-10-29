'use client';

import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, Legend,
} from 'recharts';
import Header from '@/app/components/layout/Header';
import { SkeletonGate } from '@/app/components/ui/PageSkeleton';
import { pageBodyOpacityClass } from '@/lib/skeleton-layout';
import { useI18n } from '@/lib/i18n';
import { useChartTheme } from '@/lib/chart-theme';
import { modelColor } from '@/lib/model-colors';
import { ModelUsageData, ModelVendor, ModelDistribution } from '@/types/dashboard';
import { useRefresh } from '@/lib/refresh';

export const dynamic = 'force-dynamic';

// One model keeps one color in every chart on the page (and across pages):
// name-derived via lib/model-colors.ts, never by ranking index.
function getModelColor(model: string, _index?: number): string {
  return modelColor(model);
}

// Series accents — theme-invariant inline colors, like modelColor's palette.
const VENDOR_COLORS: Record<ModelVendor, string> = {
  anthropic: '#9046FF',
  third_party: '#f97316',
  auto: '#64748b',
};

const MIX_TOP_MODELS = 6;

interface BarSegment {
  key: string;
  label: string;
  percentage: number;
  color: string;
}

/** 100% stacked bar. No text sits on the fills, so they carry no contrast duty. */
function StackedBar({ segments }: { segments: BarSegment[] }) {
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-800">
      {segments
        .filter((s) => s.percentage > 0)
        .map((s) => (
          <div
            key={s.key}
            style={{ width: `${s.percentage}%`, backgroundColor: s.color }}
            title={`${s.label} ${s.percentage.toFixed(1)}%`}
          />
        ))}
    </div>
  );
}

/** Top models of a mix plus one "Other" slice, so a long tail stays readable. */
function mixSegments(models: ModelDistribution[], otherLabel: string): BarSegment[] {
  const top = models.slice(0, MIX_TOP_MODELS).map((m) => ({
    key: m.model,
    label: m.model,
    percentage: m.percentage,
    color: modelColor(m.model),
  }));
  const rest = models.slice(MIX_TOP_MODELS).reduce((sum, m) => sum + m.percentage, 0);
  return rest > 0 ? [...top, { key: '__other', label: otherLabel, percentage: rest, color: '#475569' }] : top;
}

export default function ModelUsagePage() {
  const { nonce } = useRefresh();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<ModelUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();
  const chartTheme = useChartTheme();

  const tooltipStyle = {
    backgroundColor: chartTheme.tooltipBg,
    border: `1px solid ${chartTheme.tooltipBorder}`,
    borderRadius: 8,
    color: chartTheme.tooltipText,
    fontSize: 12,
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/model-usage?days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, nonce]);

  const totalMessages = data?.distribution?.reduce((s, d) => s + d.messages, 0) ?? 0;
  const autoMessages = data?.distribution.find((d) => d.model === 'Auto')?.messages ?? 0;
  const manualMessages = totalMessages - autoMessages;

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${pageBodyOpacityClass(loading, data !== null)}`}>
      <Header
        titleKey="header.modelUsage"
        subtitleKey="header.modelUsage.sub"
        mascotMood="thinking"
        mascotTheme="trends"
        days={days}
        onDaysChange={setDays}
      />

      <SkeletonGate variant="chart" loading={loading} hasData={data !== null}>
      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <p className="text-slate-400 text-xs font-medium mb-1">{t('model.totalModelMessages')}</p>
          <p className="text-2xl font-bold text-white font-mono">{totalMessages.toLocaleString()}</p>
        </div>
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <p className="text-slate-400 text-xs font-medium mb-1">{t('model.modelsDetected')}</p>
          <p className="text-2xl font-bold text-white font-mono">{data?.availableModels?.length ?? 0}</p>
        </div>
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <p className="text-slate-400 text-xs font-medium mb-1">{t('model.autoMessages')}</p>
          <p className="text-2xl font-bold text-cyan-400 font-mono">{autoMessages.toLocaleString()}</p>
          <p className="text-slate-500 text-xs mt-1">
            {totalMessages > 0 ? `${((autoMessages / totalMessages) * 100).toFixed(1)}%` : '0%'}
          </p>
        </div>
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <p className="text-slate-400 text-xs font-medium mb-1">{t('model.manualMessages')}</p>
          <p className="text-2xl font-bold text-[#9046FF] font-mono">{manualMessages.toLocaleString()}</p>
          <p className="text-slate-500 text-xs mt-1">
            {totalMessages > 0 ? `${((manualMessages / totalMessages) * 100).toFixed(1)}%` : '0%'}
          </p>
        </div>
      </div>

      {/* Distribution pie + Trend chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model Distribution Pie */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('model.distribution')}</h3>
          {(data?.distribution?.length ?? 0) > 0 ? (
            <>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data!.distribution}
                      dataKey="messages"
                      nameKey="model"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {data!.distribution.map((entry, i) => (
                        <Cell key={entry.model} fill={getModelColor(entry.model, i)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => [
                        `${Number(value).toLocaleString()} (${((Number(value) / totalMessages) * 100).toFixed(1)}%)`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2 mt-3">
                {data!.distribution.map((entry, i) => (
                  <div key={entry.model} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getModelColor(entry.model, i) }} />
                      <span className="text-slate-400">{entry.model}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-300 font-medium font-mono">{entry.messages.toLocaleString()}</span>
                      <span className="text-slate-500 text-xs w-14 text-right">{entry.percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-slate-500 text-sm">{t('model.noData')}</p>
          )}
        </div>

        {/* Auto vs Manual Pie */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('model.autoVsManual')}</h3>
          {totalMessages > 0 ? (
            <>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Auto', value: autoMessages },
                        { name: t('model.manualLabel'), value: manualMessages },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      <Cell fill="#22d3ee" />
                      <Cell fill="#9046FF" />
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => [`${Number(value).toLocaleString()}`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2 mt-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    <span className="text-slate-400">Auto</span>
                  </div>
                  <span className="text-slate-300 font-mono">{autoMessages.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#9046FF]" />
                    <span className="text-slate-400">{t('model.manualLabel')}</span>
                  </div>
                  <span className="text-slate-300 font-mono">{manualMessages.toLocaleString()}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-slate-500 text-sm">{t('model.noData')}</p>
          )}
        </div>
      </div>

      {/* Vendor share + per-client model mix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300">{t('model.vendorShare')}</h3>
          <p className="text-slate-500 text-xs mt-1 mb-4">{t('model.vendorShare.sub')}</p>
          {(data?.vendors?.length ?? 0) > 0 ? (
            <>
              <div className="flex flex-col gap-4">
                {[
                  { key: 'ALL', label: t('model.allClients'), vendors: data!.vendors },
                  ...(data?.byClient ?? []).map((c) => ({ key: c.clientType, label: c.clientType, vendors: c.vendors })),
                ].map((row) => (
                  <div key={row.key}>
                    <p className="text-slate-300 text-sm font-medium mb-1.5">{row.label}</p>
                    <StackedBar
                      segments={row.vendors.map((v) => ({
                        key: v.vendor,
                        label: t(`model.vendor.${v.vendor}`),
                        percentage: v.percentage,
                        color: VENDOR_COLORS[v.vendor],
                      }))}
                    />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      {row.vendors.map((v) => (
                        <span key={v.vendor} className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: VENDOR_COLORS[v.vendor] }} />
                          {t(`model.vendor.${v.vendor}`)}
                          <span className="font-mono text-slate-300">{v.percentage.toFixed(1)}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-4 border-t border-dashboard-border">
                <p className="text-slate-400 text-xs font-medium mb-2">{t('model.thirdPartyModels')}</p>
                {data!.distribution.some((d) => d.vendor === 'third_party') ? (
                  <div className="flex flex-col gap-1.5">
                    {data!.distribution
                      .filter((d) => d.vendor === 'third_party')
                      .map((d) => (
                        <div key={d.model} className="flex items-center justify-between text-sm">
                          <span className="text-slate-400">{d.model}</span>
                          <span className="flex items-center gap-3">
                            <span className="text-slate-300 font-mono">{d.messages.toLocaleString()}</span>
                            <span className="text-slate-500 text-xs w-14 text-right">{d.percentage.toFixed(1)}%</span>
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">{t('model.noThirdParty')}</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-slate-500 text-sm">{t('model.noData')}</p>
          )}
        </div>

        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300">{t('model.byClient')}</h3>
          <p className="text-slate-500 text-xs mt-1 mb-4">{t('model.byClient.sub')}</p>
          {(data?.byClient?.length ?? 0) > 0 ? (
            <div className="flex flex-col gap-5">
              {data!.byClient.map((client) => {
                const segments = mixSegments(client.models, t('model.other'));
                return (
                  <div key={client.clientType}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <p className="text-slate-300 text-sm font-medium">{client.clientType}</p>
                      <p className="text-slate-500 text-xs font-mono">{client.totalMessages.toLocaleString()}</p>
                    </div>
                    <StackedBar segments={segments} />
                    <div className="flex flex-col gap-1 mt-2">
                      {segments.map((s) => (
                        <div key={s.key} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.label}
                          </span>
                          <span className="font-mono text-slate-300">{s.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">{t('model.noData')}</p>
          )}
        </div>
      </div>

      {/* Trend chart */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('model.dailyTrend')}</h3>
        {(data?.trend?.length ?? 0) > 0 ? (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data!.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                  width={40}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: chartTheme.tick, marginBottom: 4 }}
                  cursor={{ fill: chartTheme.cursorFill }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: chartTheme.tick, paddingTop: 8 }} />
                {(data?.availableModels ?? []).map((model, i) => (
                  <Bar key={model} dataKey={model} name={model} stackId="models" fill={getModelColor(model, i)} radius={i === (data!.availableModels.length - 1) ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">{t('model.noData')}</p>
        )}
      </div>

      {/* Model adoption */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300">{t('model.adoption')}</h3>
        <p className="text-slate-500 text-xs mt-1 mb-4">{t('model.adoption.sub')}</p>
        {(data?.adoption?.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dashboard-border">
                  <th className="text-left text-slate-400 font-medium py-2 px-3">{t('model.modelName')}</th>
                  <th className="text-left text-slate-400 font-medium py-2 px-3">{t('model.vendor')}</th>
                  <th className="text-left text-slate-400 font-medium py-2 px-3">{t('model.firstSeen')}</th>
                  <th className="text-left text-slate-400 font-medium py-2 px-3">{t('model.lastSeen')}</th>
                  <th className="text-right text-slate-400 font-medium py-2 px-3">{t('model.users')}</th>
                  <th className="text-right text-slate-400 font-medium py-2 px-3">{t('model.messages')}</th>
                  <th className="text-right text-slate-400 font-medium py-2 px-3">{t('model.recentShare')}</th>
                </tr>
              </thead>
              <tbody>
                {data!.adoption.map((m) => (
                  <tr key={m.model} className="border-b border-dashboard-border/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-200">
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: modelColor(m.model) }} />
                        {m.model}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: `${VENDOR_COLORS[m.vendor]}20`, color: VENDOR_COLORS[m.vendor] }}
                      >
                        {t(`model.vendor.${m.vendor}`)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono" title={m.firstSeenAtWindowStart ? t('model.predatesWindow') : undefined}>
                      {m.firstSeenAtWindowStart ? `≤ ${m.firstSeen}` : m.firstSeen}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono">{m.lastSeen}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-mono">{m.users.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-mono">{m.messages.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-white font-mono">
                      {m.recentShare === null ? '—' : `${m.recentShare.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">{t('model.noData')}</p>
        )}
      </div>

      {/* User preferences table */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('model.userPreferences')}</h3>
        {(data?.userPreferences?.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dashboard-border">
                  <th className="text-left text-slate-400 font-medium py-2 px-3">#</th>
                  <th className="text-left text-slate-400 font-medium py-2 px-3">{t('model.user')}</th>
                  <th className="text-left text-slate-400 font-medium py-2 px-3">{t('model.primaryModel')}</th>
                  {(data?.availableModels ?? []).map((m) => (
                    <th key={m} className="text-right text-slate-400 font-medium py-2 px-3">{m}</th>
                  ))}
                  <th className="text-right text-slate-400 font-medium py-2 px-3">{t('model.total')}</th>
                </tr>
              </thead>
              <tbody>
                {data!.userPreferences.map((user, i) => (
                  <tr key={user.userid} className="border-b border-dashboard-border/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-500 font-mono">#{i + 1}</td>
                    <td className="py-2.5 px-3 text-slate-200">{user.displayName}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: `${getModelColor(user.primaryModel, 0)}20`,
                          color: getModelColor(user.primaryModel, 0),
                        }}
                      >
                        {user.primaryModel}
                      </span>
                    </td>
                    {(data?.availableModels ?? []).map((m) => (
                      <td key={m} className="py-2.5 px-3 text-right text-slate-300 font-mono">
                        {user.models[m] ? user.models[m].toLocaleString() : <span className="text-slate-600">-</span>}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right text-white font-mono font-semibold">{user.totalMessages.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">{t('model.noData')}</p>
        )}
      </div>
      </SkeletonGate>
    </div>
  );
}
