/**
 * Skeleton block layouts for the dashboard pages.
 *
 * WHY THIS EXISTS
 * Twelve dashboard pages fetch in a `useEffect` after mount. Until the first
 * response lands they render their real markup against `null`/`[]` — empty
 * charts, headerless tables, `0` metric cards — behind a global `opacity-50`.
 * A half-faded page of zeros looks like *data* (and specifically like bad
 * data), not like work in progress. Replacing it with a skeleton is the only
 * remaining perceived-latency lever there: `loading.tsx` provably cannot cover
 * this window, because the loading boundary is gone the moment the client
 * component mounts.
 *
 * WHY THE SHAPES LIVE IN lib/ AND NOT IN THE COMPONENT
 * Jest `testMatch` is `**\/*.test.ts`, so anything inside a `.tsx` file is
 * unreachable from tests. Keeping the layout descriptors as pure data here
 * means the invariants that actually matter (every variant is non-empty, block
 * counts are sane, the metric grid matches the real pages') are assertable
 * without a DOM.
 */

/** One placeholder region of a skeleton page. */
export type SkeletonBlock =
  /** A responsive row of metric cards. */
  | { kind: 'cards'; count: number }
  /** A full-width chart panel. */
  | { kind: 'chart' }
  /** Two chart panels side by side at md+. */
  | { kind: 'chartPair' }
  /** A table panel with `rows` placeholder rows. */
  | { kind: 'table'; rows: number }
  /** A vertical list of ranked bars (credits/top-user lists). */
  | { kind: 'bars'; count: number };

/**
 * Page archetypes. Deliberately coarse: these are grouped by *silhouette*, not
 * by route, so a new page picks the nearest shape instead of growing a
 * thirteenth bespoke variant that then drifts from its page.
 */
export type SkeletonVariant =
  /** Metric grid + chart + table. The Overview/exec shape. */
  | 'overview'
  /** A single dominant chart plus a breakdown table. */
  | 'chart'
  /** Two side-by-side panels plus a card grid. */
  | 'split'
  /** A ranked list of bars plus two panels. */
  | 'ranked'
  /** Metric grid + table only, no chart. */
  | 'table';

const LAYOUTS: Record<SkeletonVariant, readonly SkeletonBlock[]> = {
  overview: [
    { kind: 'cards', count: 5 },
    { kind: 'chartPair' },
    { kind: 'table', rows: 6 },
  ],
  chart: [
    { kind: 'cards', count: 4 },
    { kind: 'chart' },
    { kind: 'table', rows: 6 },
  ],
  split: [
    { kind: 'chartPair' },
    { kind: 'cards', count: 4 },
  ],
  ranked: [
    { kind: 'bars', count: 8 },
    { kind: 'chartPair' },
  ],
  table: [
    { kind: 'cards', count: 4 },
    { kind: 'table', rows: 8 },
  ],
};

/** All variants, for exhaustiveness checks in tests. */
export const SKELETON_VARIANTS = Object.keys(LAYOUTS) as SkeletonVariant[];

/**
 * The blocks to render for `variant`. Unknown variants fall back to `'chart'`
 * rather than throwing: a skeleton is transient decoration, and taking a whole
 * page down over a typo'd variant name would be a strictly worse failure than
 * showing a slightly wrong placeholder.
 */
export function skeletonLayout(variant: SkeletonVariant): readonly SkeletonBlock[] {
  return LAYOUTS[variant] ?? LAYOUTS.chart;
}

/**
 * Whether a page should show the skeleton instead of its real body.
 *
 * Only on the FIRST load. Once there is data on screen, a `days` change keeps
 * the previous numbers visible (dimmed) instead of blanking them out — swapping
 * settled content for a skeleton on every dropdown change would be a
 * regression, not feedback.
 */
export function showSkeleton(loading: boolean, hasData: boolean): boolean {
  return loading && !hasData;
}

/**
 * Whether the page wrapper should dim its contents.
 *
 * This is the exact complement of `showSkeleton` within `loading`, and the two
 * MUST stay mutually exclusive. The dim predates the skeleton and was written
 * for the days-refetch case: fade the settled numbers so it is visible that
 * they are being replaced. Keying it on `loading` alone made it fire on the
 * first load too, and CSS `opacity` composites down a subtree — the skeleton's
 * own `animate-pulse` (1 → 0.5) multiplied by a `opacity-50` wrapper renders it
 * at 0.5–0.25, about a 5/255 delta against the page background (1.04:1). The
 * shared skeleton then looked completely different on the 12 gated pages than
 * on the `/` loading boundary, which has no such wrapper.
 */
export function dimWhileRefetching(loading: boolean, hasData: boolean): boolean {
  return loading && hasData;
}

/**
 * The wrapper opacity class for a dashboard page body.
 *
 * Returned as a whole class rather than a boolean so all 12 pages cannot drift
 * from each other, and so the invariant "never dim the frame that also shows a
 * skeleton" is pinned in one testable place.
 */
export function pageBodyOpacityClass(loading: boolean, hasData: boolean): string {
  return dimWhileRefetching(loading, hasData) ? 'opacity-50' : 'opacity-100';
}
