/**
 * Structural guards for the menu-transition feedback work.
 *
 * The behaviour these protect is invisible in a passing build: nothing type-errors
 * if the loading boundary drifts to the app root, if a page copies skeleton
 * markup instead of reusing the shared component, or if the sidebar highlight
 * goes back to being derived from `usePathname()` alone. Each of those would
 * quietly restore the original "click does nothing" stall.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The 12 client dashboard pages that fetch in a useEffect after mount. */
const CLIENT_PAGES = [
  'adoption',
  'credits',
  'dev-activity',
  'engagement',
  'exec',
  'ingest-health',
  'model-usage',
  'productivity',
  'rollout',
  'subscription',
  'trends',
  'users',
];

describe('the loading boundary is scoped to the only dynamic route', () => {
  test('/ lives in the (overview) route group with its own loading.tsx', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/(overview)/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'app/(overview)/loading.tsx'))).toBe(true);
  });

  test('there is no root app/loading.tsx', () => {
    // A root boundary nests over all 13 prerendered children and could flash a
    // skeleton where today there is none. The route group scopes it to `/`
    // by construction. A route group adds no URL segment, so `/` is unchanged.
    expect(fs.existsSync(path.join(ROOT, 'app/loading.tsx'))).toBe(false);
  });

  test('no loading.tsx is added to the prerendered dashboard routes', () => {
    // They have no server-side await for a boundary to cover — their RSC
    // payloads are already warm from Next's prefetch — so a boundary there is
    // inert at best and a flash at worst.
    for (const page of CLIENT_PAGES) {
      expect(fs.existsSync(path.join(ROOT, `app/${page}/loading.tsx`))).toBe(false);
    }
  });

  test('the boundary reuses the shared skeleton', () => {
    expect(read('app/(overview)/loading.tsx')).toContain('PageSkeleton');
  });

  test('/ is still the route that needs the boundary (force-dynamic)', () => {
    // If this ever stops being force-dynamic the boundary becomes inert and
    // this whole approach should be revisited.
    expect(read('app/(overview)/page.tsx')).toMatch(
      /export const dynamic = 'force-dynamic'/
    );
  });
});

describe('every client dashboard page uses the ONE shared skeleton', () => {
  for (const page of CLIENT_PAGES) {
    test(`${page} renders SkeletonGate`, () => {
      const src = read(`app/${page}/page.tsx`);
      expect(src).toContain('SkeletonGate');
      expect(src).toContain("from '@/app/components/ui/PageSkeleton'");
    });

    test(`${page} does not open-code skeleton markup`, () => {
      // Skeleton shapes live in lib/skeleton-layout.ts and are rendered in one
      // place. A page growing its own animate-pulse blocks is the drift this
      // guard exists to catch.
      const src = read(`app/${page}/page.tsx`);
      expect(src).not.toContain('animate-pulse');
    });

    test(`${page} never dims the frame that also shows the skeleton`, () => {
      // `loading ? 'opacity-50' : 'opacity-100'` fired on the FIRST load too,
      // and CSS opacity composites down a subtree: the wrapper's 0.5 multiplied
      // by the skeleton's own animate-pulse rendered it at 0.5-0.25, roughly a
      // 5/255 delta against the page background. The decision now lives in
      // pageBodyOpacityClass(loading, hasData) so all 12 pages cannot drift.
      const src = read(`app/${page}/page.tsx`);
      expect(src).toContain('pageBodyOpacityClass(');
      expect(src).toContain("from '@/lib/skeleton-layout'");
      expect(src).not.toMatch(/loading\s*\?\s*'opacity-50'/);
    });
  }
});

describe('the sidebar paints clicked items before the transition commits', () => {
  const sidebar = read('app/components/layout/Sidebar.tsx');

  test('nav item state comes from lib/nav-state.ts, not an inline comparison', () => {
    expect(sidebar).toContain("from '@/lib/nav-state'");
    expect(sidebar).toContain('navItemState(');
    expect(sidebar).toContain('navItemClassName(');
  });

  test('a click records a pending href', () => {
    expect(sidebar).toContain('nextPendingHref(');
    expect(sidebar).toMatch(/setPendingHref\(/);
  });

  test('the highlight is no longer derived from pathname alone', () => {
    // `const isActive = pathname === item.href` was the whole defect: it only
    // updates on commit, so a slow route moved nothing on screen.
    expect(sidebar).not.toMatch(/const isActive = pathname === item\.href/);
  });

  test('the pending state is cleared on commit and on a timeout', () => {
    expect(sidebar).toContain('setPendingHref(null)');
    expect(sidebar).toContain('PENDING_NAV_TIMEOUT_MS');
  });

  test('a modified click does not record a pending href', () => {
    // Next invokes this onClick before deciding to navigate and then skips
    // navigation for Cmd/Ctrl/Shift/Alt clicks, so an unguarded write left a
    // phantom item pulsing for the full 10s in the tab the user kept looking at.
    expect(sidebar).toContain('isNavigatingClick(');
  });

  test('the click guard reads the anchor target, not the event target', () => {
    // `e.target` is the DOM node that was hit; the anchor's target attribute is
    // on `e.currentTarget`. Getting this wrong compares an element against
    // '_self', suppressing EVERY click and silently restoring the stall.
    expect(sidebar).toContain('e.currentTarget.target');
    expect(sidebar).not.toMatch(/target:\s*e\.target\b/);
  });

  test('nav items stay <Link> so Next keeps prefetching them', () => {
    // Prefetch is what makes the prerendered routes feel instant; navigating
    // imperatively instead would throw it away. Strip comments first so this
    // reads code, not prose about code.
    const code = sidebar
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).toContain('<Link');
    expect(code).not.toMatch(/\brouter\s*\.\s*push\s*\(/);
    expect(code).not.toMatch(/\brouter\s*\.\s*replace\s*\(/);
    // And prefetch must not be opted out of.
    expect(code).not.toMatch(/prefetch=\{false\}/);
  });
});

describe('light mode stays a palette override', () => {
  const files = [
    'lib/nav-state.ts',
    'lib/skeleton-layout.ts',
    'app/components/ui/PageSkeleton.tsx',
    'app/(overview)/loading.tsx',
    'app/components/layout/Sidebar.tsx',
  ];

  for (const file of files) {
    test(`${file} adds no dark:/light: variants`, () => {
      // The .light block in globals.css remaps the palette, so components are
      // written dark-first and variants would double-invert.
      const src = read(file);
      expect(src).not.toMatch(/className=[^\n]*\bdark:/);
      expect(src).not.toMatch(/className=[^\n]*\blight:/);
    });
  }
});

describe('the overview server component fetches in one wave', () => {
  const page = read('app/(overview)/page.tsx');

  test('all six endpoints are in a single Promise.all', () => {
    const promiseAlls = page.match(/Promise\.all\(/g) ?? [];
    expect(promiseAlls).toHaveLength(1);

    const block = page.slice(page.indexOf('Promise.all('));
    const endpoints = [
      '/api/metrics',
      '/api/trends',
      '/api/users',
      '/api/engagement',
      '/api/client-dist',
      '/api/idc-users',
    ];
    const closing = block.indexOf(']);');
    const inside = block.slice(0, closing);
    for (const ep of endpoints) {
      expect(inside).toContain(ep);
    }
  });

  test('no endpoint is awaited on its own after the wave', () => {
    // This route is force-dynamic, so a serialized await is added directly to
    // the navigation stall the user reported.
    const awaits = page.match(/await fetchData</g) ?? [];
    expect(awaits).toHaveLength(0);
  });
});

describe('the loading string is bilingual', () => {
  const i18n = read('lib/i18n.tsx');

  test("common.loading has both ko and en entries", () => {
    const hits = i18n.match(/'common\.loading':/g) ?? [];
    expect(hits).toHaveLength(2);
  });
});
