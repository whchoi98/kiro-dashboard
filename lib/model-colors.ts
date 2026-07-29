/**
 * Stable colors for AI model names.
 *
 * The model list is DYNAMIC — Kiro adds `{model}_messages` columns as models
 * ship, so a fixed name→color map would leave new models uncolored. Colors are
 * derived from the name instead, which also keeps one model the same color
 * across every view and across reloads (an index-based palette would recolor
 * everything as soon as the ranking changed).
 *
 * Theme-invariant on purpose: these are series accents, and the light-mode
 * palette override only remaps Tailwind color variables, not inline styles.
 */

// Kiro purple first so the most-used model in a typical mix reads as brand.
const PALETTE = [
  '#9046FF',
  '#22d3ee',
  '#22c55e',
  '#f97316',
  '#eab308',
  '#ec4899',
  '#3b82f6',
  '#a855f7',
  '#14b8a6',
  '#f43f5e',
];

/** "Auto" is Kiro's router pseudo-model, not a real one — mute it. */
const FIXED: Record<string, string> = {
  auto: '#64748b',
};

export function modelColor(model: string): string {
  const key = model.trim().toLowerCase();
  if (FIXED[key]) return FIXED[key];

  // djb2: cheap, well-distributed, and deterministic across processes (unlike
  // anything seeded by insertion order).
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
