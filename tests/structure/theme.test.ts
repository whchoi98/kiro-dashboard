import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('theme switching wiring (approach A: palette override)', () => {
  const globals = read('app/globals.css');
  const layout = read('app/layout.tsx');
  const i18n = read('lib/i18n.tsx');

  test('globals.css defines the .light palette override block', () => {
    expect(globals).toMatch(/\.light\s*\{/);
    // A few sentinel inversions that the whole approach depends on
    expect(globals).toContain('--color-gray-900: #ffffff');
    expect(globals).toMatch(/--color-black: oklch\(96\.5%/);
  });

  test('globals.css keeps true-white text on brand-purple elements in light mode', () => {
    expect(globals).toContain('.light [class*="bg-[#9046FF]"]');
  });

  test('body/scrollbar colors are variable-based (theme-aware)', () => {
    expect(globals).toContain('background-color: var(--color-black)');
    expect(globals).not.toMatch(/scrollbar-color:\s*#/);
  });

  test('layout bootstraps the stored theme before hydration', () => {
    expect(layout).toContain("localStorage.getItem('kiro-theme')");
    expect(layout).toContain('suppressHydrationWarning');
    expect(layout).toContain('<ThemeProvider>');
  });

  test('theme toggle strings exist in both locales', () => {
    for (const key of ['common.themeDark', 'common.themeLight']) {
      const hits = i18n.split(`'${key}'`).length - 1;
      expect(hits).toBe(2); // once in ko, once in en
    }
  });

  test('ThemeProvider persists to the same key the bootstrap script reads', () => {
    const theme = read('lib/theme.tsx');
    expect(theme).toContain("'kiro-theme'");
  });
});
