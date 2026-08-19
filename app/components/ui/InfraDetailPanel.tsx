'use client';

import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { InfraResource, InfraStatusData } from '@/types/dashboard';

const STATUS_STYLE: Record<string, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-400',
  degraded: 'bg-orange-500/10 text-orange-400',
  unknown: 'bg-gray-500/10 text-gray-400',
  static: 'bg-slate-500/10 text-slate-400',
};

interface InfraDetailPanelProps {
  resource: InfraResource | null;
  metrics: InfraStatusData['metrics'] | null;
  onClose: () => void;
}

// Display-only right slide-over (UserDetailPanel idiom, minus the fetch): the
// page already holds everything in InfraStatusData, so opening a row costs
// zero network calls.
export default function InfraDetailPanel({ resource, metrics, onClose }: InfraDetailPanelProps) {
  const { t } = useI18n();
  const isOpen = resource !== null;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const related: Array<{ labelKey: string; value: string }> = [];
  if (resource && metrics) {
    if (resource.id === 'ecs') {
      related.push(
        { labelKey: 'infra.metric.cpu', value: metrics.ecsCpuPct === null ? '—' : `${metrics.ecsCpuPct.toFixed(1)}%` },
        { labelKey: 'infra.metric.mem', value: metrics.ecsMemPct === null ? '—' : `${metrics.ecsMemPct.toFixed(1)}%` },
      );
    } else if (resource.id === 'alb') {
      related.push(
        { labelKey: 'infra.albRequests', value: metrics.albRequests1h === null ? '—' : metrics.albRequests1h.toLocaleString() },
        { labelKey: 'infra.metric.latency', value: metrics.albP50LatencySec === null ? '—' : `${(metrics.albP50LatencySec * 1000).toFixed(0)} ms` },
      );
    } else if (resource.id === 'cloudfront') {
      related.push(
        { labelKey: 'infra.metric.cfRequests', value: metrics.cfRequests1h === null ? '—' : metrics.cfRequests1h.toLocaleString() },
      );
    }
  }

  return (
    <>
      {/* Backdrop — mirror UserDetailPanel's exact block */}
      <div
        className={`fixed inset-0 bg-[rgba(0,0,0,0.5)] z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[480px] z-50 flex flex-col bg-gray-950 border-l border-gray-800 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="flex flex-col gap-1 min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white leading-tight">{resource?.type ?? ''}</h2>
              {resource && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[resource.status]}`}>
                  {resource.status === 'static' ? t('infra.status.static') : resource.status}
                </span>
              )}
            </div>
            <span className="text-xs font-mono text-gray-400 truncate">{resource?.name ?? ''}</span>
            <span className="text-xs font-mono text-gray-500">{resource?.region ?? ''}</span>
          </div>
          <button
            type="button"
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

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* Cost */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('infra.col.monthly')}</span>
              {resource?.costKind && (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9046FF]">
                  {resource.costKind === 'fixed' ? t('infra.panel.fixed') : t('infra.usageBased')}
                </span>
              )}
            </div>
            <span className="text-2xl font-bold font-mono text-white">
              {resource?.monthlyUsd === null || resource?.monthlyUsd === undefined
                ? t('infra.usageBased')
                : `$${resource.monthlyUsd.toFixed(2)}`}
            </span>
            {resource?.formula && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('infra.panel.cost')}</span>
                <pre className="mt-1 bg-gray-900/80 border border-gray-800 rounded p-3 text-xs font-mono text-gray-300 whitespace-pre-wrap break-words">{resource.formula}</pre>
              </div>
            )}
          </div>

          {/* Related metrics */}
          {related.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('infra.panel.metrics')}</span>
              <div className="grid grid-cols-2 gap-2">
                {related.map((item) => (
                  <div key={item.labelKey} className="rounded-lg border border-gray-800 bg-gray-900/60 p-3 flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t(item.labelKey)}</span>
                    <span className="text-xl font-bold font-mono text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detail + note */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{t('infra.col.detail')}</span>
            <p className="text-sm text-gray-300">{resource?.detail ?? ''}</p>
          </div>
          <p className="text-xs text-gray-600">{t('infra.estimateNote')}</p>
        </div>
      </div>
    </>
  );
}
