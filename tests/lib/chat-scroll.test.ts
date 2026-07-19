import { isNearBottom, PIN_THRESHOLD_PX } from '@/lib/chat-scroll';

describe('isNearBottom (chat stick-to-bottom pin)', () => {
  // scrollHeight 1000, clientHeight 600 → max scrollTop is 400.
  it('is pinned when scrolled exactly to the bottom', () => {
    expect(isNearBottom(400, 1000, 600)).toBe(true);
  });

  it('is pinned within the threshold of the bottom', () => {
    expect(isNearBottom(400 - PIN_THRESHOLD_PX, 1000, 600)).toBe(true);
  });

  it('is NOT pinned once scrolled up past the threshold', () => {
    expect(isNearBottom(400 - PIN_THRESHOLD_PX - 1, 1000, 600)).toBe(false);
    expect(isNearBottom(0, 1000, 600)).toBe(false);
  });

  it('is pinned when content does not overflow the container', () => {
    expect(isNearBottom(0, 500, 600)).toBe(true);
    expect(isNearBottom(0, 600, 600)).toBe(true);
  });

  it('tolerates fractional scroll positions near the bottom', () => {
    // Browsers report fractional scrollTop on zoomed/high-DPI displays.
    expect(isNearBottom(399.5, 1000, 600)).toBe(true);
  });
});
