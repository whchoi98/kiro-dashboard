'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { GroupView } from './ChangelogBlocks';
import type { ReleaseNotesResponse } from '@/types/dashboard';

interface ReleaseNotesDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * What the running version added, opened from the sidebar version badge.
 *
 * The notes come from /api/release-notes rather than an import: CHANGELOG.md is
 * ~50KB across both languages, and inlining it here would put all of it in the
 * bundle of every page for the sake of one section.
 */
export default function ReleaseNotesDialog({ open, onClose }: ReleaseNotesDialogProps) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<ReleaseNotesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Keyed by locale so switching language while open refetches, and so the
  // cached payload for the other language isn't shown.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/release-notes?locale=${locale}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: ReleaseNotesResponse) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        // Surfaced, not swallowed: a blank dialog reads as "there are no
        // release notes", which is a different (and wrong) message.
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, locale]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown);
    // Move focus into the dialog so Escape and Tab act on it, not on the
    // sidebar link that opened it.
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const section = data?.section ?? null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('release.title')}
    >
      <div
        className="absolute inset-0 bg-[rgba(0,0,0,0.7)]"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative w-full max-w-[640px] max-h-[80vh] flex flex-col rounded-2xl bg-dashboard-card border border-dashboard-border shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-dashboard-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
              {t('release.title')}
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#9046FF] text-[#ffffff]">
                v{data?.version ?? ''}
              </span>
            </h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {section?.date ? section.date : t('release.subtitle')}
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label={t('release.close')}
            className="shrink-0 text-gray-500 hover:text-white transition-colors p-1 rounded-md hover:bg-gray-800"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col gap-3 animate-pulse">
              <div className="h-4 w-1/3 rounded bg-gray-800" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-3 rounded bg-gray-800" />
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
              {t('release.error')} ({error})
            </div>
          )}

          {!loading && !error && data && !section && (
            <p className="text-sm text-slate-500 py-4">{t('release.empty')}</p>
          )}

          {!loading && !error && section && (
            <>
              {/* The version bumped before its notes landed — say so rather
                  than presenting another release's notes as this one's. */}
              {data && !data.exact && (
                <p className="mb-3 rounded-lg border border-amber-800/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                  {t('release.fallback')} ({section.version})
                </p>
              )}
              {section.groups.map((g, gi) => (
                <GroupView key={gi} group={g} />
              ))}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-dashboard-border shrink-0 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {(data?.history ?? [])
              .filter((h) => h.version !== section?.version)
              .slice(0, 4)
              .map((h) => (
                <Link
                  key={h.version}
                  href={`/changelog#v${h.version}`}
                  onClick={onClose}
                  className="px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-400 bg-gray-800/50 border border-gray-800 hover:text-[#9046FF] hover:border-[#9046FF]/40 transition-colors"
                >
                  v{h.version}
                </Link>
              ))}
          </div>
          <Link
            href="/changelog"
            onClick={onClose}
            className="text-xs font-semibold text-[#9046FF] hover:underline shrink-0"
          >
            {t('release.viewAll')} →
          </Link>
        </div>
      </div>
    </div>
  );
}
