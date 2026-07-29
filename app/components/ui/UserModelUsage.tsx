'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { modelColor } from '@/lib/model-colors';
import type { UserModelUsageData } from '@/types/dashboard';

interface UserModelUsageProps {
  userId: string;
  days: number;
}

/**
 * Per-user AI model breakdown inside the user detail panel.
 *
 * Fetches independently of the panel's own /api/user-detail call: that one is
 * Athena-backed while this reads the UAR CSVs from S3 (dynamic
 * `{model}_messages` columns, ADR-0004). Separate requests mean an S3 problem
 * shows as one failed card, not an empty panel.
 */
export default function UserModelUsage({ userId, days }: UserModelUsageProps) {
  const { t } = useI18n();
  const [data, setData] = useState<UserModelUsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/user-model-usage?userid=${encodeURIComponent(userId)}&days=${days}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: UserModelUsageData) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        // Shown, not swallowed: an empty card would read as "this user used no
        // models", which is a claim we would not have measured.
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, days]);

  const heading = (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
      {t('userModel.title')}
    </p>
  );

  if (loading) {
    return (
      <div>
        {heading}
        <div className="flex flex-col gap-2 animate-pulse">
          <div className="h-2 rounded-full bg-gray-800" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-6 rounded bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {heading}
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {t('userModel.error')} ({error})
        </p>
      </div>
    );
  }

  if (!data) return null;

  // Three distinct empty states. Collapsing them into one "no data" message
  // would assert a measurement in cases where nothing was measured.
  if (!data.configured) {
    return (
      <div>
        {heading}
        <p className="text-xs text-gray-600 py-2">{t('userModel.notConfigured')}</p>
      </div>
    );
  }
  if (data.daysWithModelColumns === 0) {
    return (
      <div>
        {heading}
        <p className="text-xs text-gray-600 py-2">{t('userModel.noModelColumns')}</p>
      </div>
    );
  }
  if (data.models.length === 0) {
    return (
      <div>
        {heading}
        <p className="text-xs text-gray-600 py-2">{t('userModel.empty')}</p>
      </div>
    );
  }

  return (
    <div>
      {heading}

      {/* Single stacked bar: model MIX is the question here, and a 100%-width
          bar answers it at a glance in a 480px panel where a pie would not. */}
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-800 mb-3">
        {data.models.map((m) => (
          <div
            key={m.model}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${m.percentage}%`, backgroundColor: modelColor(m.model) }}
            title={`${m.model} — ${m.messages.toLocaleString()} (${m.percentage.toFixed(1)}%)`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg border border-gray-800 bg-gray-900/40">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            {t('userModel.primary')}
          </span>
          <span className="text-sm font-semibold text-gray-200 truncate" title={data.primaryModel ?? ''}>
            {data.primaryModel ?? '—'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg border border-gray-800 bg-gray-900/40">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            {t('userModel.distinct')}
          </span>
          <span className="text-sm font-mono text-gray-200">
            {data.distinctModels} · {data.totalMessages.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {data.models.map((m) => (
          <div key={m.model} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: modelColor(m.model) }}
            />
            <span className="text-gray-300 truncate flex-1" title={m.model}>
              {m.model}
            </span>
            <span className="font-mono text-gray-400 tabular-nums shrink-0">
              {m.messages.toLocaleString()}
            </span>
            <span className="font-mono text-gray-600 tabular-nums shrink-0 w-11 text-right">
              {m.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {data.clients.length > 1 && (
        <p className="mt-2 text-[10px] text-gray-600">
          {data.clients.map((c) => `${c.clientType}: ${c.messages.toLocaleString()}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
