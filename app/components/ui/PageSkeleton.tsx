'use client';

import { useI18n } from '@/lib/i18n';
import {
  skeletonLayout,
  showSkeleton,
  type SkeletonBlock,
  type SkeletonVariant,
} from '@/lib/skeleton-layout';

/**
 * Shared loading skeleton for the dashboard pages.
 *
 * ONE component for all of them — the block shapes come from
 * `lib/skeleton-layout.ts` so the markup is never copied per page.
 *
 * All classes are dark-first. Light mode comes free from the `.light` palette
 * override in globals.css (`bg-gray-800` renders as a light gray there), so
 * there are deliberately no `dark:`/`light:` variants. The responsive grids
 * mirror the real pages' `grid-cols-1 sm:grid-cols-2 md:grid-cols-N`, so the
 * settled md+ layout is unchanged — this only ever replaces content while the
 * first fetch is in flight.
 */

/** A single pulsing placeholder rectangle. */
function Bar({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`rounded bg-gray-800 ${className}`} style={style} />;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">{children}</div>
  );
}

function CardBlock({ count }: { count: number }) {
  // Caps at 5 columns to match the widest real grid (the Overview metric row).
  const mdCols = count >= 5 ? 'md:grid-cols-3 lg:grid-cols-5' : 'md:grid-cols-4';
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-2 ${mdCols} gap-3`}>
      {Array.from({ length: count }, (_, i) => (
        <Panel key={i}>
          <div className="flex items-start justify-between mb-3">
            <Bar className="h-3 w-20" />
            <Bar className="h-10 w-10 rounded-lg" />
          </div>
          <Bar className="h-8 w-24 mb-2" />
          <Bar className="h-3 w-16" />
        </Panel>
      ))}
    </div>
  );
}

function ChartBlock() {
  return (
    <Panel>
      <Bar className="h-4 w-40 mb-4" />
      <Bar className="h-[240px] w-full" />
    </Panel>
  );
}

function TableBlock({ rows }: { rows: number }) {
  return (
    <Panel>
      <Bar className="h-4 w-40 mb-4" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <Bar key={i} className="h-8 w-full" />
        ))}
      </div>
    </Panel>
  );
}

function BarsBlock({ count }: { count: number }) {
  return (
    <Panel>
      <Bar className="h-4 w-40 mb-4" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar className="h-3 w-5 shrink-0" />
            <div className="flex-1">
              <Bar className="h-3 w-1/3 mb-1.5" />
              {/* Widths taper down the list so it reads as a ranked chart
                  rather than a uniform table. */}
              <Bar
                className="h-1.5"
                style={{ width: `${Math.max(20, 100 - i * 10)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Block({ block }: { block: SkeletonBlock }) {
  switch (block.kind) {
    case 'cards':
      return <CardBlock count={block.count} />;
    case 'chart':
      return <ChartBlock />;
    case 'chartPair':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartBlock />
          <ChartBlock />
        </div>
      );
    case 'table':
      return <TableBlock rows={block.rows} />;
    case 'bars':
      return <BarsBlock count={block.count} />;
  }
}

export default function PageSkeleton({ variant }: { variant: SkeletonVariant }) {
  const { t } = useI18n();
  const blocks = skeletonLayout(variant);

  return (
    <div
      className="flex flex-col gap-6 animate-pulse"
      role="status"
      aria-live="polite"
      aria-busy="true"
      // Screen readers get the announcement; sighted users get the shapes.
      aria-label={t('common.loading')}
    >
      <span className="sr-only">{t('common.loading')}</span>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

/**
 * Renders `children` once there is something to show, and the skeleton while
 * the first fetch is still in flight.
 *
 * The 12 dashboard pages each wrap their body in one of these rather than
 * open-coding a ternary, so the show/hide rule stays in `showSkeleton()` (which
 * Jest can reach) and the pages carry no branching logic of their own.
 */
export function SkeletonGate({
  variant,
  loading,
  hasData,
  children,
}: {
  variant: SkeletonVariant;
  loading: boolean;
  /** False only before the first successful response for this page. */
  hasData: boolean;
  children: React.ReactNode;
}) {
  if (showSkeleton(loading, hasData)) return <PageSkeleton variant={variant} />;
  return <>{children}</>;
}
