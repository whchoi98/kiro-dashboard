'use client';

import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';
import { SkeletonGate } from '@/app/components/ui/PageSkeleton';
import { pageBodyOpacityClass } from '@/lib/skeleton-layout';
import MetricCard from '@/app/components/charts/MetricCard';
import { InfraStatusData } from '@/types/dashboard';
import { useI18n } from '@/lib/i18n';

const STATUS_STYLE: Record<string, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-400',
  degraded: 'bg-orange-500/10 text-orange-400',
  unknown: 'bg-gray-500/10 text-gray-400',
  static: 'bg-slate-500/10 text-slate-400',
};

function usd(n: number | null): string {
  return n === null ? '—' : `$${n.toFixed(2)}`;
}

function pct(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)}%`;
}

export default function InfraCostPage() {
  const [data, setData] = useState<InfraStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/infra')
      .then((r) => r.json())
      .then((payload) => {
        if (!cancelled) setData(payload ?? null);
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
  }, []);

  const s = data?.summary;
  const m = data?.metrics;

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${pageBodyOpacityClass(loading, data !== null)}`}>
      <Header titleKey="header.infraCost" subtitleKey="header.infraCost.sub" mascotMood="thinking" mascotTheme="dashboard" />

      <SkeletonGate variant="table" loading={loading} hasData={data !== null}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title={t('infra.fixedMonthly')} value={usd(s?.fixedMonthlyUsd ?? null)} changeRate={0} accentColor="#9046FF" subtitle={data?.pricingAsOf ?? ''} />
        <MetricCard title={t('infra.runningTasks')} value={s?.runningTasks !== null && s?.runningTasks !== undefined ? `${s.runningTasks} / ${s.desiredTasks ?? '?'}` : '—'} changeRate={0} accentColor="#22c55e" subtitle="ECS Fargate" />
        <MetricCard title={t('infra.healthyTargets')} value={s?.healthyTargets !== null && s?.healthyTargets !== undefined ? `${s.healthyTargets} / ${s.totalTargets ?? '?'}` : '—'} changeRate={0} accentColor="#0ea5e9" subtitle="ALB" />
        <MetricCard title={t('infra.albRequests')} value={m?.albRequests1h === null || m?.albRequests1h === undefined ? '—' : m.albRequests1h.toLocaleString()} changeRate={0} accentColor="#f97316" subtitle="AWS/ApplicationELB" />
      </div>

      {/* CloudWatch metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { key: 'infra.metric.cpu', value: pct(m?.ecsCpuPct ?? null) },
          { key: 'infra.metric.mem', value: pct(m?.ecsMemPct ?? null) },
          { key: 'infra.metric.latency', value: m?.albP50LatencySec === null || m?.albP50LatencySec === undefined ? '—' : `${(m.albP50LatencySec * 1000).toFixed(0)} ms` },
          { key: 'infra.metric.cfRequests', value: m?.cfRequests1h === null || m?.cfRequests1h === undefined ? '—' : m.cfRequests1h.toLocaleString() },
        ].map((item) => (
          <div key={item.key} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t(item.key)}</span>
            <span className="text-2xl font-bold font-mono text-gray-200">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Resource table */}
      <div className="rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/70">
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">{t('infra.col.type')}</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">{t('infra.col.name')}</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-32">{t('infra.col.region')}</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-28">{t('infra.col.status')}</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">{t('infra.col.detail')}</th>
              <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-28">{t('infra.col.monthly')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.resources ?? []).map((r) => (
              <tr key={r.id} className="border-b border-gray-800/50 last:border-b-0 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-2.5 text-gray-200 font-medium whitespace-nowrap">{r.type}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono text-xs break-all">{r.name}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{r.region}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                    {r.status === 'static' ? t('infra.status.static') : r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-400 text-xs">{r.detail}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-300">
                  {r.monthlyUsd === null ? <span className="text-gray-600">{t('infra.usageBased')}</span> : usd(r.monthlyUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600">{t('infra.estimateNote')}</p>
      </SkeletonGate>
    </div>
  );
}
