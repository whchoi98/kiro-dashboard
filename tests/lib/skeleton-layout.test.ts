import {
  skeletonLayout,
  showSkeleton,
  dimWhileRefetching,
  pageBodyOpacityClass,
  SKELETON_VARIANTS,
  type SkeletonVariant,
} from '../../lib/skeleton-layout';

describe('skeletonLayout', () => {
  it('gives every declared variant a non-empty layout', () => {
    expect(SKELETON_VARIANTS.length).toBeGreaterThan(0);
    for (const v of SKELETON_VARIANTS) {
      expect(skeletonLayout(v).length).toBeGreaterThan(0);
    }
  });

  it('falls back rather than throwing on an unknown variant', () => {
    // A skeleton is transient decoration; a typo'd variant must not take a
    // whole page down.
    const bogus = 'nope' as SkeletonVariant;
    expect(skeletonLayout(bogus)).toEqual(skeletonLayout('chart'));
  });

  it('keeps block counts plausible so no variant renders hundreds of nodes', () => {
    for (const v of SKELETON_VARIANTS) {
      for (const block of skeletonLayout(v)) {
        if (block.kind === 'cards' || block.kind === 'bars') {
          expect(block.count).toBeGreaterThan(0);
          expect(block.count).toBeLessThanOrEqual(12);
        }
        if (block.kind === 'table') {
          expect(block.rows).toBeGreaterThan(0);
          expect(block.rows).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it('matches the real Overview metric row at 5 cards', () => {
    // The /(overview) loading boundary uses this variant; a mismatch here is
    // what makes a skeleton visibly "jump" when the real content lands.
    const cards = skeletonLayout('overview').find((b) => b.kind === 'cards');
    expect(cards).toEqual({ kind: 'cards', count: 5 });
  });

  it('returns layouts that are stable across calls', () => {
    expect(skeletonLayout('overview')).toEqual(skeletonLayout('overview'));
  });
});

describe('showSkeleton', () => {
  it('shows the skeleton on the first load', () => {
    expect(showSkeleton(true, false)).toBe(true);
  });

  it('hides it once data has arrived', () => {
    expect(showSkeleton(false, true)).toBe(false);
  });

  it('does NOT blank settled content on a days-dropdown refetch', () => {
    // This is the important one: swapping real numbers for a skeleton every
    // time the range changes would be a regression, not feedback. The page
    // dims via opacity-50 instead.
    expect(showSkeleton(true, true)).toBe(false);
  });

  it('shows nothing special when idle with no data (empty account)', () => {
    // An account with no reports yet must reach the real "No data available"
    // copy, not pulse forever.
    expect(showSkeleton(false, false)).toBe(false);
  });
});

describe('dimWhileRefetching / pageBodyOpacityClass', () => {
  const QUADRANTS = [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] as const;

  it('NEVER dims the same frame that shows a skeleton', () => {
    // The defect this pins: CSS opacity composites down a subtree, so a
    // `opacity-50` wrapper multiplied by the skeleton's own animate-pulse
    // (1 -> 0.5) rendered it at 0.5-0.25 — about a 5/255 delta against the page
    // background (1.04:1), i.e. invisible. The two states must be disjoint.
    for (const [loading, hasData] of QUADRANTS) {
      expect(showSkeleton(loading, hasData) && dimWhileRefetching(loading, hasData)).toBe(
        false
      );
    }
  });

  it('dims only a refetch over settled data', () => {
    expect(dimWhileRefetching(true, true)).toBe(true);
    expect(dimWhileRefetching(true, false)).toBe(false);
    expect(dimWhileRefetching(false, true)).toBe(false);
    expect(dimWhileRefetching(false, false)).toBe(false);
  });

  it('emits full opacity for the first load so the skeleton renders at its own alpha', () => {
    expect(pageBodyOpacityClass(true, false)).toBe('opacity-100');
  });

  it('emits the dim class for a days-dropdown refetch', () => {
    expect(pageBodyOpacityClass(true, true)).toBe('opacity-50');
  });

  it('emits only ever one of the two opacity classes', () => {
    for (const [loading, hasData] of QUADRANTS) {
      expect(['opacity-50', 'opacity-100']).toContain(pageBodyOpacityClass(loading, hasData));
    }
  });
});
