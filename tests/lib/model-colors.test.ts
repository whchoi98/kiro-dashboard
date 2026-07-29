/**
 * Model colors are derived from the NAME, not from position in a list, because
 * the model set is dynamic (Kiro adds `{model}_messages` columns as models
 * ship). An index-based palette would recolor every series as soon as the
 * ranking changed, and would leave new models uncolored.
 */

import { modelColor } from '../../lib/model-colors';

describe('modelColor', () => {
  it('is deterministic for the same name', () => {
    expect(modelColor('Claude Sonnet 4.5')).toBe(modelColor('Claude Sonnet 4.5'));
  });

  it('ignores case and surrounding whitespace', () => {
    expect(modelColor('  claude SONNET 4.5 ')).toBe(modelColor('Claude Sonnet 4.5'));
  });

  it('mutes Auto, which is a router pseudo-model', () => {
    expect(modelColor('Auto')).toBe('#64748b');
    expect(modelColor('auto')).toBe('#64748b');
  });

  it('always returns a 6-digit hex color', () => {
    for (const name of ['Auto', 'Claude Sonnet 4.5', 'Claude Haiku 4.5', 'x', '', '한글모델']) {
      expect(modelColor(name)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('spreads a realistic model set over several colors', () => {
    // Not a uniqueness guarantee (the palette is finite), just a check that the
    // hash isn't collapsing everything onto one entry.
    const models = [
      'Auto',
      'Claude Sonnet 4.5',
      'Claude Sonnet 4',
      'Claude Haiku 4.5',
      'Claude Opus 4.1',
      'Gpt 5',
    ];
    expect(new Set(models.map(modelColor)).size).toBeGreaterThanOrEqual(4);
  });

  it('does not depend on call order', () => {
    const forward = ['a', 'b', 'c'].map(modelColor);
    const backward = ['c', 'b', 'a'].map(modelColor).reverse();
    expect(forward).toEqual(backward);
  });
});
