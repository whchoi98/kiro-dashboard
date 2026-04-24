'use client';

import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, Legend,
} from 'recharts';
import Header from '@/app/components/layout/Header';
import { useI18n } from '@/lib/i18n';
import { ModelUsageData } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

const MODEL_COLORS: Record<string, string> = {
  'Auto': '#22d3ee',
  'Claude Opus 4.6': '#9046FF',
  'Claude Sonnet 4': '#6366f1',
};
const FALLBACK_COLORS = ['#f97316', '#ec4899', '#22c55e', '#f59e0b', '#a78bfa'];

function getModelColor(model: string, index: number): string {
  return MODEL_COLORS[model] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#f1f5f9',
  fontSize: 12,
};

export default function ModelUsagePage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<ModelUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/model-usage?days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const totalMessages = data?.distribution.reduce((s, d) => s + d.messages, 0) ?? 0;
  const autoMessages = data?.distribution.find((d) => d.model === 'Auto')?.messages ?? 0;
  const manualMessages = totalMessages - autoMessages;

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <Header
        titleKey="header.modelUsage"
        subtitleKey="header.modelUsage.sub"
        mascotMood="thinking"
        mascotTheme="trends"
        days={days}
        onDaysChange={setDays}
      />

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <p className="text-slate-400 text-xs font-medium mb-1">{t('model.totalModelMessages')}</p>
          <p className="text-2xl font-bold text-white font-mono">{totalMessages.toLocaleString()}</p>
        </div>
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <p className="text-slate-400 text-xs font-medium mb-1">{t('model.modelsDetected')}</p>
          <p className="text-2xl font-bold text-white font-mono">{data?.availableModels.length ?? 0}</p>
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
      <div className="grid grid-cols-2 gap-4">
        {/* Model Distribution Pie */}
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('model.distribution')}</h3>
          {(data?.distribution.length ?? 0) > 0 ? (
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

      {/* Trend chart */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('model.dailyTrend')}</h3>
        {(data?.trend.length ?? 0) > 0 ? (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data!.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                  width={40}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }} />
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

      {/* User preferences table */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('model.userPreferences')}</h3>
        {(data?.userPreferences.length ?? 0) > 0 ? (
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
    </div>
  );
}
