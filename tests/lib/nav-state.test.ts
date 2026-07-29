import {
  navItemState,
  navItemClassName,
  nextPendingHref,
  isNavigatingClick,
  PENDING_NAV_TIMEOUT_MS,
} from '../../lib/nav-state';

describe('navItemState', () => {
  it('marks the committed route active', () => {
    expect(navItemState('/users', null, '/users')).toBe('active');
  });

  it('marks a clicked-but-uncommitted route pending', () => {
    // The user clicked /users while sitting on /trends. usePathname() still
    // reports /trends, so without the pending state nothing on screen moves.
    expect(navItemState('/trends', '/users', '/users')).toBe('pending');
  });

  it('leaves untouched items idle', () => {
    expect(navItemState('/trends', '/users', '/credits')).toBe('idle');
  });

  it('prefers active over pending once the transition commits', () => {
    // A stale pendingHref must never keep the pulse on a route that is now
    // genuinely the current one.
    expect(navItemState('/users', '/users', '/users')).toBe('active');
  });

  it('keeps the origin item idle while a different route is pending', () => {
    // Leaving /trends for /users: /trends is no longer where we are going, so
    // it must not keep the active treatment and compete with the pending item.
    expect(navItemState('/trends', '/users', '/trends')).toBe('active');
    expect(navItemState('/users', '/users', '/trends')).toBe('idle');
  });

  it('treats a null pathname (pre-hydration) as no active item', () => {
    expect(navItemState(null, null, '/')).toBe('idle');
    expect(navItemState(undefined, '/', '/')).toBe('pending');
  });

  it('does not confuse / with other routes', () => {
    // '/' is a prefix of every href; a startsWith-based implementation would
    // light up all 14 items at once.
    expect(navItemState('/users', null, '/')).toBe('idle');
    expect(navItemState('/', null, '/users')).toBe('idle');
    expect(navItemState('/', null, '/')).toBe('active');
  });
});

describe('nextPendingHref', () => {
  it('records the target of a real navigation', () => {
    expect(nextPendingHref('/trends', '/users')).toBe('/users');
  });

  it('records nothing when re-tapping the current route', () => {
    // No transition means pathname never changes, so the commit effect that
    // clears pendingHref would never fire and the item would pulse forever.
    expect(nextPendingHref('/users', '/users')).toBeNull();
  });

  it('records a target when the pathname is not yet known', () => {
    expect(nextPendingHref(null, '/users')).toBe('/users');
  });
});

describe('navItemClassName', () => {
  const all = (['active', 'pending', 'idle'] as const).map(navItemClassName);

  it('gives every state a distinct treatment', () => {
    expect(new Set(all).size).toBe(3);
  });

  it('never uses dark:/light: variants (light mode is a palette override)', () => {
    for (const cls of all) {
      expect(cls).not.toMatch(/\bdark:/);
      expect(cls).not.toMatch(/\blight:/);
    }
  });

  it('animates only the pending state', () => {
    expect(navItemClassName('pending')).toContain('animate-pulse');
    expect(navItemClassName('active')).not.toContain('animate-pulse');
    expect(navItemClassName('idle')).not.toContain('animate-pulse');
  });

  it('uses theme-invariant text on the purple pending background', () => {
    // Inside .light, --color-white is remapped to near-black, so the label on a
    // purple fill must be an arbitrary value. (The globals.css bridge rule is a
    // `[class*="bg-[#9046FF]"]` substring match, so it would also fire for an
    // opacity variant — but it only sets --color-white, i.e. exactly what
    // text-[#ffffff] already hardcodes. Contrast is unaffected either way.)
    const pending = navItemClassName('pending');
    expect(pending).toContain('text-[#ffffff]');
  });

  it('keeps the pending purple OPAQUE — an alpha variant fails light-mode AA', () => {
    // Regression pin. `bg-[#9046FF]/70` over the light sidebar (#ffffff) is
    // 2.88:1 for the label, and animate-pulse halves the element's opacity every
    // 2s, taking it to ~1.65:1 — fading white text toward a white background
    // recovers nothing, so the item the user just clicked became the least
    // readable one. Opaque is 4.66:1 light / 7.64:1 dark, clearing the 4.5:1 bar
    // ADR-0005 holds this project to.
    const pending = navItemClassName('pending');
    expect(pending).toContain('bg-[#9046FF]');
    expect(pending).not.toMatch(/bg-\[#9046FF\]\/\d+/);
  });

  it('keeps the active treatment byte-identical to the pre-change classes', () => {
    // Settled desktop appearance must not shift.
    expect(navItemClassName('active')).toBe(
      'bg-[#9046FF] text-white shadow-lg shadow-purple-500/20'
    );
    expect(navItemClassName('idle')).toBe(
      'text-slate-400 hover:text-white hover:bg-gray-800/50'
    );
  });
});

describe('isNavigatingClick', () => {
  // Next's <Link> calls our onClick BEFORE deciding whether to navigate, then
  // bails out for modified clicks without pushing. Recording a pending href for
  // one of those leaves a phantom highlight pulsing for the full 10s timeout in
  // the tab the user is still looking at, falsely claiming a navigation.
  it('accepts a plain left click', () => {
    expect(isNavigatingClick({})).toBe(true);
    expect(isNavigatingClick({ target: '_self' })).toBe(true);
    expect(isNavigatingClick({ target: '' })).toBe(true);
  });

  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)(
    'rejects a %s click (opens a tab/window, this document stays put)',
    (mod) => {
      expect(isNavigatingClick({ [mod]: true })).toBe(false);
    }
  );

  it('rejects a click on a link that leaves this document', () => {
    expect(isNavigatingClick({ target: '_blank' })).toBe(false);
  });

  it('does not confuse an unset target with a foreign one', () => {
    // Guards the caller mistake this predicate invites: React's `e.target` is
    // the DOM node that was hit, not the anchor's `target` attribute. Passing
    // the event straight in would compare an element against '_self' and
    // suppress EVERY click, silently restoring the original stall.
    expect(isNavigatingClick({ target: undefined })).toBe(true);
  });
});

describe('PENDING_NAV_TIMEOUT_MS', () => {
  it('is long enough for a slow Athena-backed render but bounded', () => {
    expect(PENDING_NAV_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(PENDING_NAV_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('the full click -> commit lifecycle', () => {
  /** Mirrors the Sidebar: pendingHref set on click, cleared when pathname changes. */
  function simulate(start: string, clicked: string) {
    let pathname = start;
    let pending: string | null = null;
    const frames: string[] = [];
    const snap = () => frames.push(navItemState(pathname, pending, clicked));

    snap();                                        // before the click
    pending = nextPendingHref(pathname, clicked);  // onClick
    snap();                                        // transition in flight
    if (pathname !== clicked) {
      pathname = clicked;                          // router commits
      pending = null;                              // pathname effect clears it
    }
    snap();
    return frames;
  }

  it('goes idle -> pending -> active for a real navigation', () => {
    expect(simulate('/trends', '/')).toEqual(['idle', 'pending', 'active']);
  });

  it('stays active throughout when re-tapping the current route', () => {
    // And critically never enters pending, which nothing would clear.
    expect(simulate('/users', '/users')).toEqual(['active', 'active', 'active']);
  });
});
