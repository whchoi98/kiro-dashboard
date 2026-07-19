/**
 * Stick-to-bottom helper for streaming chat surfaces.
 *
 * While an answer streams in, the conversation should auto-follow ONLY as
 * long as the user is already at the bottom; the moment they scroll up to
 * read, auto-follow must yield (re-scrolling on every SSE chunk is what made
 * the chat feel unscrollable).
 */

/** Distance from the bottom (px) within which the user still counts as pinned. */
export const PIN_THRESHOLD_PX = 48;

export function isNearBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold: number = PIN_THRESHOLD_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}
