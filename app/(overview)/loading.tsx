import PageSkeleton from '@/app/components/ui/PageSkeleton';

/**
 * Loading boundary for `/` — and ONLY for `/`.
 *
 * WHY THE ROUTE GROUP
 * `/` is the sole dynamically-rendered route: it is `force-dynamic` and its
 * server component awaits several Athena-backed endpoints before returning any
 * HTML. Every other page is prerendered at build time (verified against
 * `.next/prerender-manifest.json`: 14 routes prerendered with real `.html` on
 * disk, only `/` has no `page.html`), so their navigation RSC payloads are
 * already warm from Next's prefetch and there is no server await for a loading
 * boundary to cover.
 *
 * A boundary at `app/loading.tsx` would nest over all of those children and
 * could flash a skeleton where today there is none. Putting it inside the
 * `(overview)` route group scopes it to this segment — the group adds no URL
 * segment, so `/` is unchanged — and leaves the 13 prerendered siblings alone
 * by construction rather than by hoping Next never paints it for them.
 *
 * The second win is prefetchability: a dynamic route with no loading boundary
 * has nothing to prefetch (prefetching `/` returned an 80-byte stub with zero
 * chunk references). With this file, the router can prefetch and paint this
 * shell instantly instead of holding the previous page on screen.
 *
 * `overview` variant mirrors the real page's 5-card metric grid, so the settled
 * md+ layout is untouched.
 */
export default function Loading() {
  return <PageSkeleton variant="overview" />;
}
