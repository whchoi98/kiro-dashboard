'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { latestReportDate, nextReportEtaMs } from '@/lib/freshness';

// No documented console deep link exists (kiro.dev only describes: sign in →
// switch to the Kiro console → Dashboard). Swap this constant if one is found.
const KIRO_CONSOLE_DASHBOARD_URL =
  'https://kiro.dev/docs/enterprise/monitor-and-track/dashboard/';

// One-line report-freshness banner: as-of date (max report date in the data
// the page already loaded) + countdown to the next daily 02:00 UTC report +
// a pointer to the console for live subscription state. No network calls.
export default function FreshnessBanner({ dates }: { dates: string[] }) {
  const { t } = useI18n();
  // null until mounted — countdown depends on the client clock, so rendering
  // it during SSR/hydration would mismatch. The interval keeps it fresh
  // across the 02:00 UTC boundary while the page stays open.
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setEtaMinutes(Math.max(0, Math.round((nextReportEtaMs(now) - now) / 60_000)));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const asOf = latestReportDate(dates) ?? '—';
  const eta =
    etaMinutes === null
      ? null
      : etaMinutes >= 60
        ? t('freshness.etaHours').replace('{h}', String(Math.round(etaMinutes / 60)))
        : t('freshness.etaMinutes').replace('{m}', String(etaMinutes));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2 text-xs text-gray-400">
      <span>
        {t('freshness.asOf')} <span className="font-bold text-gray-200">{asOf}</span>
      </span>
      {eta !== null && (
        <span>
          {eta} <span className="text-gray-500">{t('freshness.schedule')}</span>
        </span>
      )}
      <a
        href={KIRO_CONSOLE_DASHBOARD_URL}
        target="_blank"
        rel="noreferrer"
        className="text-[#9046FF] hover:underline"
      >
        {t('freshness.consoleCta')} ↗
      </a>
    </div>
  );
}
