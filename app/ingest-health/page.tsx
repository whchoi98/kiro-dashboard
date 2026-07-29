'use client';

import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';
import { SkeletonGate } from '@/app/components/ui/PageSkeleton';
import { pageBodyOpacityClass } from '@/lib/skeleton-layout';
import MetricCard from '@/app/components/charts/MetricCard';
import { IngestHealthData } from '@/types/dashboard';
import { useI18n } from '@/lib/i18n';

const FILE_ROWS_SHOWN = 40;

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** ISO instant → `YYYY-MM-DD HH:MM UTC`; the UTC suffix is load-bearing. */
function formatInstant(iso: string | null): string {
  if (!iso) return '—';
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function fileName(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1);
}

export default function IngestHealthPage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<IngestHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ingest-health?days=${days}`)
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
  }, [days]);

  const freshness = data?.freshness;
  const clients = data?.clients ?? [];
  const dates = data?.dates ?? [];
  const files = data?.files ?? [];
  const legacy = data?.legacyInstrumentation;

  // Matrix lookup: `date|client` → delivered cell.
  const cells = new Map((data?.matrix ?? []).map((cell) => [`${cell.date}|${cell.clientType}`, cell]));

  // Newest dates first, so today's delivery is the leftmost column.
  const orderedDates = [...dates].reverse();

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${pageBodyOpacityClass(loading, data !== null)}`}>
      <Header
        titleKey="header.ingestHealth"
        subtitleKey="header.ingestHealth.sub"
        mascotMood="alert"
        mascotTheme="dashboard"
        days={days}
        onDaysChange={setDays}
      />

      <SkeletonGate variant="table" loading={loading} hasData={data !== null}>
      {data && !data.configured && (
        <div className="bg-dashboard-card rounded-xl px-5 py-4 border border-dashboard-border">
          <p className="text-sm text-amber-400">{t('ingest.notConfigured')}</p>
        </div>
      )}

      {/* Freshness KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title={t('ingest.latestReport')}
          value={freshness?.latestReportDate ?? '—'}
          changeRate={0}
          accentColor="#9046FF"
          subtitle={
            freshness?.reportLagDays !== null && freshness?.reportLagDays !== undefined
              ? `${t('ingest.reportLag')} ${freshness.reportLagDays}${t('ingest.days')}`
              : t('ingest.reportLag')
          }
          detail={`${t('ingest.latestDelivered')}: ${formatInstant(freshness?.latestDeliveredAt ?? null)}`}
        />
        <MetricCard
          title={t('ingest.totalFiles')}
          value={formatNumber(freshness?.totalFiles ?? 0)}
          changeRate={0}
          accentColor="#0ea5e9"
          subtitle={`${clients.length} clients`}
          detail={formatBytes(freshness?.totalBytes ?? 0)}
        />
        <MetricCard
          title={t('ingest.totalRows')}
          value={formatNumber(freshness?.totalRows ?? 0)}
          changeRate={0}
          accentColor="#22c55e"
          subtitle={`${dates.length} ${t('ingest.days')}`}
          detail={`Last ${days} days`}
        />
        <MetricCard
          title={t('ingest.parity')}
          value={
            data?.parity?.athenaRows !== null && data?.parity?.athenaRows !== undefined
              ? formatNumber(data.parity.athenaRows)
              : '—'
          }
          changeRate={0}
          accentColor={data?.parity?.deltaRows ? '#f97316' : '#22d3ee'}
          subtitle={
            data?.parity?.deltaRows !== null && data?.parity?.deltaRows !== undefined
              ? `Δ ${data.parity.deltaRows > 0 ? '+' : ''}${data.parity.deltaRows.toLocaleString()}`
              : t('ingest.parityUnavailable')
          }
          detail={`CSV ${formatNumber(data?.parity?.csvRows ?? 0)}`}
        />
      </div>
      <p className="-mt-3 text-xs text-slate-500">{t('ingest.deliveredAtNote')}</p>

      {/* Date × client delivery matrix */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-1">{t('ingest.matrix')}</h3>
        <p className="text-xs text-slate-500 mb-4">{t('ingest.missingNote')}</p>
        {orderedDates.length && clients.length ? (
          <>
            <div className="flex flex-col gap-2">
              {clients.map((client) => (
                <div key={client} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono w-20 shrink-0 truncate" title={client}>
                    {client}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {orderedDates.map((date) => {
                      const cell = cells.get(`${date}|${client}`);
                      const delivered = Boolean(cell?.delivered);
                      return (
                        <span
                          key={date}
                          title={
                            delivered
                              ? `${date} · ${cell!.files} file(s) · ${cell!.rows} rows · ${formatBytes(cell!.bytes)}`
                              : `${date} · ${t('ingest.notDelivered')}`
                          }
                          className="w-3.5 h-3.5 rounded-sm border border-dashboard-border"
                          style={{ backgroundColor: delivered ? '#22c55e' : 'transparent' }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm border border-dashboard-border"
                  style={{ backgroundColor: '#22c55e' }}
                />
                {t('ingest.delivered')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm border border-dashboard-border" />
                {t('ingest.notDelivered')}
              </span>
            </div>
          </>
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        )}
      </div>

      {/* Header drift + config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('ingest.headerDrift')}</h3>
          {data?.headerVariants?.length ? (
            <div className="flex flex-col gap-3">
              {data.headerVariants.map((variant) => (
                <div
                  key={variant.headers.join(',')}
                  className="p-3 rounded-lg border border-dashboard-border"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm text-slate-200 font-medium">
                      {variant.headers.length} {t('ingest.columns')}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {variant.firstDate} → {variant.lastDate} · {variant.files} files
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 break-all font-mono">
                    {variant.headers.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No data available</p>
          )}
        </div>

        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">{t('ingest.config')}</h3>
          <dl className="flex flex-col gap-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">S3 bucket</dt>
              <dd className={data?.config?.bucketConfigured ? 'text-green-400' : 'text-amber-400'}>
                {data?.config?.bucketConfigured ? 'configured' : 'missing'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">S3 prefix</dt>
              <dd className={data?.config?.prefixConfigured ? 'text-green-400' : 'text-amber-400'}>
                {data?.config?.prefixConfigured ? 'configured' : 'missing'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Glue table</dt>
              <dd className="text-slate-300 font-mono text-xs">{data?.config?.glueTable ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Athena DB</dt>
              <dd className="text-slate-300 font-mono text-xs">
                {data?.config?.athenaDatabase ?? '—'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Legacy column instrumentation */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <h3 className="text-lg font-semibold text-slate-300 mb-1">
          {t('ingest.legacyInstrumentation')}
        </h3>
        <p className="text-xs text-slate-500 mb-4">{t('ingest.legacyNote')}</p>
        {legacy?.available && legacy.columns.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {legacy.columns.map((column) => {
              const pct =
                legacy.totalRows > 0 ? (column.nonZeroRows / legacy.totalRows) * 100 : 0;
              const instrumented = column.nonZeroRows > 0;
              return (
                <div
                  key={column.column}
                  className="p-3 rounded-lg border border-dashboard-border"
                  style={{ borderLeft: `3px solid ${instrumented ? '#22c55e' : '#475569'}` }}
                >
                  <p className="text-xs text-slate-300 font-mono break-all">{column.column}</p>
                  {instrumented ? (
                    <p className="text-sm text-slate-200 font-mono mt-1">
                      {column.nonZeroRows.toLocaleString()}{' '}
                      <span className="text-slate-500">/ {legacy.totalRows.toLocaleString()}</span>{' '}
                      <span className="text-slate-400">({pct.toFixed(0)}%)</span>
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">{t('ingest.notInstrumented')}</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        )}
      </div>

      {/* File inventory */}
      <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="text-lg font-semibold text-slate-300">{t('ingest.inventory')}</h3>
          {files.length > FILE_ROWS_SHOWN && (
            <span className="text-xs text-slate-500 font-mono">
              {FILE_ROWS_SHOWN} / {files.length}
            </span>
          )}
        </div>
        {files.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-dashboard-border">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Client</th>
                  <th className="pb-2 pr-4 font-medium">File</th>
                  <th className="pb-2 pr-4 font-medium text-right">Rows</th>
                  <th className="pb-2 pr-4 font-medium text-right">{t('ingest.columns')}</th>
                  <th className="pb-2 pr-4 font-medium text-right">Size</th>
                  <th className="pb-2 font-medium">{t('ingest.latestDelivered')}</th>
                </tr>
              </thead>
              <tbody>
                {files.slice(0, FILE_ROWS_SHOWN).map((file) => (
                  <tr key={file.key} className="border-b border-dashboard-border last:border-b-0">
                    <td className="py-2.5 pr-4 text-slate-300 font-mono">{file.reportDate || '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-400">{file.clientType}</td>
                    <td className="py-2.5 pr-4 text-slate-500 font-mono text-xs truncate max-w-[220px]" title={file.key}>
                      {fileName(file.key)}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400 text-right font-mono">
                      {file.rowCount.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400 text-right font-mono">
                      {file.headerCount}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400 text-right font-mono">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="py-2.5 text-slate-500 font-mono text-xs">
                      {formatInstant(file.deliveredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        )}
      </div>
      </SkeletonGate>
    </div>
  );
}
