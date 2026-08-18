import * as fs from 'fs';
import * as path from 'path';
import manifest from '../../app/manifest';

const ROOT = path.resolve(__dirname, '../..');

function pngSize(file: string): { w: number; h: number } {
  const buf = fs.readFileSync(file);
  // 8-byte PNG signature, then IHDR: width @16, height @20 (big-endian).
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  // colortype 2 = RGB truecolor, no alpha — pins the #9046FF flatten so a
  // regenerated icon with transparent corners (iOS renders them black) fails.
  expect(buf[25]).toBe(2);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('PWA assets', () => {
  test.each([
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ])('%s is a %dpx square PNG', (name, size) => {
    const { w, h } = pngSize(path.join(ROOT, 'public', name as string));
    expect(w).toBe(size);
    expect(h).toBe(size);
  });

  test('manifest declares the standalone home-screen app', () => {
    const m = manifest();
    expect(m.name).toBe('Kiro Dashboard');
    expect(m.short_name).toBe('Kiro');
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.background_color).toBe('#000000');
    expect(m.theme_color).toBe('#000000');
    expect((m.icons ?? []).map((i) => `${i.src}|${i.sizes}|${i.purpose}`)).toEqual([
      '/icon-192.png|192x192|any',
      '/icon-512.png|512x512|any',
      '/icon-512.png|512x512|maskable',
    ]);
  });
});
