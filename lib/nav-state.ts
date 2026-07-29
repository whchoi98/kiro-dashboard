/**
 * Sidebar nav-item state resolution.
 *
 * WHY THIS EXISTS
 * The sidebar highlight is derived from `usePathname()`, which only updates
 * when a route transition COMMITS. `/` is the only dynamically-rendered route
 * (it is `force-dynamic` and its server component awaits several Athena-backed
 * endpoints), so clicking "대시보드" changes nothing on screen — not the page,
 * not even the nav highlight — until every query finishes. The click looks
 * ignored; that is the "멈칫" the user reported.
 *
 * The fix is to track the href the user just clicked and paint it as *pending*
 * immediately, before React commits the transition. `<Link>` is kept as-is so
 * Next's IntersectionObserver prefetch (which is what makes the 13 statically
 * rendered routes feel instant) is not lost.
 *
 * WHY IT LIVES IN lib/ AND NOT IN Sidebar.tsx
 * Jest `testMatch` is `**\/*.test.ts`, so logic inside a `.tsx` file is
 * unreachable from tests. Keeping the state machine here as pure functions
 * makes every transition assertable without a DOM.
 */

/** Visual state of a single sidebar nav item. */
export type NavItemState =
  /** The router has committed to this route. */
  | 'active'
  /** The user clicked it; the transition has not committed yet. */
  | 'pending'
  | 'idle';

/**
 * Resolves how a nav item should render.
 *
 * `pathname` wins over `pendingHref`: once the transition commits, the item is
 * genuinely active and must not keep rendering the pending treatment even if a
 * stale pending href is still in state.
 */
export function navItemState(
  pathname: string | null | undefined,
  pendingHref: string | null | undefined,
  href: string
): NavItemState {
  if (pathname === href) return 'active';
  if (pendingHref === href) return 'pending';
  return 'idle';
}

/**
 * The pending href to record for a click on `href` while sitting on `pathname`.
 *
 * Returns `null` when the click cannot produce a transition (re-tapping the
 * item you are already on). That case matters: no transition means `pathname`
 * never changes, so the effect that clears the pending href on commit would
 * never fire and the item would stay stuck in the pending treatment forever.
 */
export function nextPendingHref(
  pathname: string | null | undefined,
  href: string
): string | null {
  return pathname === href ? null : href;
}

/**
 * Tailwind classes for a nav item, dark-first (light mode comes free from the
 * `.light` palette override — never add `dark:`/`light:` variants here).
 *
 * `pending` reuses the brand purple plus `animate-pulse`, so it reads as "this
 * is becoming active" rather than as a second, unrelated state. The purple is
 * an arbitrary value so it is theme-invariant, and the text is `text-[#ffffff]`
 * for the same reason — the inverted `--color-white` would render near-black
 * on purple.
 *
 * THE PURPLE IS OPAQUE. DO NOT REINTRODUCE `bg-[#9046FF]/70`.
 * In light mode `--color-dashboard-sidebar` is `#ffffff`, so 70% purple
 * composites to rgb(177,126,255) and white label text lands at 2.88:1 — under
 * the AA 4.5:1 this project holds itself to (ADR-0005), and `animate-pulse`
 * halves the whole element's opacity every 2s, dragging it to ~1.65:1 at the
 * trough. Fading white text toward a white background recovers nothing, so the
 * label the user just clicked became the least readable item in the sidebar.
 * Opaque purple is 4.66:1 in light mode and 7.64:1 in dark; the pulse then
 * carries the "in flight" signal on its own.
 */
export function navItemClassName(state: NavItemState): string {
  switch (state) {
    case 'active':
      return 'bg-[#9046FF] text-white shadow-lg shadow-purple-500/20';
    case 'pending':
      return 'bg-[#9046FF] text-[#ffffff] animate-pulse';
    case 'idle':
      return 'text-slate-400 hover:text-white hover:bg-gray-800/50';
  }
}

/** The subset of a click event that decides whether the browser navigates. */
export interface NavClickModifiers {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  /** `<a target>` — anything but `_self`/empty leaves this document. */
  target?: string;
}

/**
 * True when a left-click carrying these modifiers will actually transition the
 * current document.
 *
 * Next's `<Link>` invokes our `onClick` *before* deciding whether to navigate,
 * and then bails out for modified clicks without calling `router.push`
 * (`isModifiedEvent` in next/dist/client/link.js). So a Cmd/Ctrl-click opens a
 * background tab while this document stays put: `pathname` never changes, the
 * commit effect that clears `pendingHref` never fires, and the item pulses for
 * the full `PENDING_NAV_TIMEOUT_MS` in the tab the user is still looking at —
 * falsely claiming a navigation is in flight.
 *
 * This mirrors Next's private predicate rather than importing it (it is not
 * exported). Middle-click needs no handling: it fires `auxclick`, not `click`.
 */
export function isNavigatingClick(mods: NavClickModifiers): boolean {
  if (mods.metaKey || mods.ctrlKey || mods.shiftKey || mods.altKey) return false;
  return !mods.target || mods.target === '_self';
}

/**
 * How long to keep an uncommitted pending href before giving up on it.
 *
 * A transition can end without `pathname` ever changing — a failed RSC fetch,
 * a route that throws, or the user hitting Back mid-flight. Without a ceiling
 * the item would pulse indefinitely, which is a worse lie than no feedback at
 * all. 10s is far longer than the slowest observed Overview render and short
 * enough that a stuck item self-heals while the user is still looking at it.
 */
export const PENDING_NAV_TIMEOUT_MS = 10_000;
