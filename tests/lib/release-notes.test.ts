/**
 * The sidebar version badge opens a dialog showing this build's release notes.
 * Two things can silently go wrong:
 *
 *  1. `[Unreleased]` parses into a section like any real release, so picking
 *     sections[0] shows an empty placeholder as if it were the shipped version.
 *  2. CHANGELOG.md must reach this module as a build-time STRING. A
 *     `readFileSync` would work in `next dev` and crash every request in the
 *     standalone image, which ships no markdown — the same class of failure as
 *     the v1.6.1 `.dockerignore` bug, except it takes down the whole app.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseChangelog, splitLocales } from '../../lib/changelog-md';
import {
  currentReleaseNotes,
  findReleaseSection,
  isReleaseSection,
  releaseSections,
} from '../../lib/release-notes';

const ROOT = path.resolve(__dirname, '../..');
const RAW = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const PKG_VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
).version as string;

const { english, korean } = splitLocales(RAW);

describe('isReleaseSection', () => {
  test('rejects the [Unreleased] placeholder', () => {
    expect(isReleaseSection({ version: 'Unreleased', date: null, groups: [] })).toBe(false);
  });

  test('rejects it case- and whitespace-insensitively', () => {
    for (const v of ['unreleased', 'UNRELEASED', ' Unreleased ']) {
      expect(isReleaseSection({ version: v, date: null, groups: [] })).toBe(false);
    }
  });

  test('accepts a semver release', () => {
    expect(isReleaseSection({ version: '1.6.1', date: '2026-07-29', groups: [] })).toBe(true);
  });
});

describe('findReleaseSection', () => {
  const sections = [
    { version: 'Unreleased', date: null, groups: [] },
    { version: '2.0.0', date: '2026-08-01', groups: [] },
    { version: '1.9.0', date: '2026-07-01', groups: [] },
  ];

  test('returns the section matching the requested version', () => {
    expect(findReleaseSection(sections, '1.9.0')?.version).toBe('1.9.0');
  });

  test('never returns [Unreleased], even when asked for it by name', () => {
    expect(findReleaseSection(sections, 'Unreleased')?.version).toBe('2.0.0');
  });

  test('falls back to the newest release for an unknown version', () => {
    // A version bump can land before its changelog entry; the badge still
    // needs something to show. The API marks this case with exact:false.
    expect(findReleaseSection(sections, '3.1.4')?.version).toBe('2.0.0');
  });

  test('returns null when there are no releases at all', () => {
    expect(findReleaseSection([{ version: 'Unreleased', date: null, groups: [] }], '1.0.0')).toBeNull();
  });
});

describe.each([
  ['english', english],
  ['korean', korean],
])('%s: against the real CHANGELOG.md', (_label, md) => {
  const sections = parseChangelog(md);

  test('the running version has a real entry with content', () => {
    const found = findReleaseSection(sections, PKG_VERSION);
    expect(found).not.toBeNull();
    // If this fails the fallback banner would show on a released build.
    expect(found!.version).toBe(PKG_VERSION);
    expect(found!.groups.length).toBeGreaterThan(0);
    const blocks = found!.groups.flatMap((g) => g.blocks);
    expect(blocks.length).toBeGreaterThan(0);
  });

  test('[Unreleased] is filtered out of the release list', () => {
    const versions = sections.filter(isReleaseSection).map((s) => s.version);
    expect(versions).not.toContain('Unreleased');
    expect(versions.length).toBeGreaterThan(0);
  });

  test('the newest release is the running version', () => {
    expect(sections.filter(isReleaseSection)[0].version).toBe(PKG_VERSION);
  });
});

// End-to-end through the real inlined markdown: these exercise the exported
// functions the API route actually calls, not just their building blocks.
describe.each([['ko'], ['en']] as const)('currentReleaseNotes(%s)', (locale) => {
  test('returns the running version with content', () => {
    const section = currentReleaseNotes(locale);
    expect(section).not.toBeNull();
    expect(section!.version).toBe(PKG_VERSION);
    expect(section!.groups.flatMap((g) => g.blocks).length).toBeGreaterThan(0);
  });

  test('the notes are actually in the requested language', () => {
    const hangul = /[가-힣]/;
    const text = currentReleaseNotes(locale)!
      .groups.flatMap((g) => g.blocks)
      .map((b) => (b.kind === 'para' ? b.text : b.kind === 'list' ? b.items.join(' ') : ''))
      .join(' ');
    // Guards the ko/en branch: passing the wrong half of the file would still
    // parse fine and still return the right version number.
    expect(hangul.test(text)).toBe(locale === 'ko');
  });

  test('releaseSections is newest-first and excludes [Unreleased]', () => {
    const versions = releaseSections(locale).map((s) => s.version);
    expect(versions[0]).toBe(PKG_VERSION);
    expect(versions).not.toContain('Unreleased');
  });

  test('both languages list identical versions', () => {
    expect(releaseSections('ko').map((s) => s.version)).toEqual(
      releaseSections('en').map((s) => s.version)
    );
  });
});

describe('CHANGELOG.md reaches the module without filesystem access', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/release-notes.ts'), 'utf8');
  // Strip comments before scanning: the module's own doc comment explains why
  // it must not call readFileSync, and matching that prose would make this
  // assertion pass or fail on documentation rather than on code.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  test('imports the markdown instead of reading it', () => {
    expect(code).toMatch(/import CHANGELOG_RAW from '\.\.\/CHANGELOG\.md'/);
  });

  test('does not touch fs at all', () => {
    // A runtime read here is fatal, not degraded: this module is reachable
    // from the Sidebar, which renders on every page.
    expect(code).not.toMatch(/readFileSync/);
    expect(code).not.toMatch(/from 'fs'/);
    expect(code).not.toMatch(/process\.cwd\(\)/);
  });

  test('next.config.js maps .md to asset/source so the import resolves', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8');
    expect(cfg).toMatch(/CHANGELOG\\\.md\$/);
    expect(cfg).toContain("type: 'asset/source'");
  });

  test('a *.md module declaration exists for TypeScript', () => {
    const decl = fs.readFileSync(path.join(ROOT, 'types/markdown.d.ts'), 'utf8');
    expect(decl).toContain("declare module '*.md'");
  });

  test('the .dockerignore re-include is still what puts the file in context', () => {
    // asset/source reads the file during `npm run build` inside the builder
    // stage, so the v1.6.1 re-include remains load-bearing for this feature.
    const di = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
    expect(di).toContain('!CHANGELOG.md');
  });
});

describe('the version badge opens the dialog', () => {
  const sidebar = fs.readFileSync(
    path.join(ROOT, 'app/components/layout/Sidebar.tsx'),
    'utf8'
  );

  test('the version is a button that opens the release notes', () => {
    expect(sidebar).toMatch(/onClick=\{\(\) => setNotesOpen\(true\)\}/);
    expect(sidebar).toContain('<ReleaseNotesDialog');
  });

  test('the version still comes from lib/version (no literal)', () => {
    // Duplicated from version-sync.test.ts on purpose: this file is the one
    // that edits the badge, so the constraint should fail here too.
    expect(sidebar).toContain("from '@/lib/version'");
    expect(sidebar).toContain('v{APP_VERSION}');
    expect(sidebar).not.toMatch(/v\d+\.\d+\.\d+/);
  });
});

describe('the dialog and /changelog share one renderer', () => {
  test('neither re-implements block rendering', () => {
    // A second copy would let the dialog regress the v1.6.1 fixes (literal
    // `**`, flattened fences, raw `|---` tables) while /changelog stayed right.
    for (const rel of [
      'app/components/ui/ReleaseNotesDialog.tsx',
      'app/changelog/ChangelogClient.tsx',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).toMatch(/ChangelogBlocks'/);
      expect(src).not.toMatch(/case 'table':/);
      expect(src).not.toMatch(/split\(\/\\\*\\\*\//);
    }
  });

  test('/changelog anchors each version for the dialog deep links', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/changelog/ChangelogClient.tsx'), 'utf8');
    expect(page).toMatch(/id=\{`v\$\{section\.version\}`\}/);
    const dialog = fs.readFileSync(
      path.join(ROOT, 'app/components/ui/ReleaseNotesDialog.tsx'),
      'utf8'
    );
    expect(dialog).toMatch(/\/changelog#v\$\{h\.version\}/);
  });
});

describe('i18n keys for the dialog exist in both languages', () => {
  const i18n = fs.readFileSync(path.join(ROOT, 'lib/i18n.tsx'), 'utf8');
  const KEYS = [
    'release.title',
    'release.subtitle',
    'release.viewAll',
    'release.close',
    'release.empty',
    'release.error',
    'release.fallback',
  ];

  test.each(KEYS)('%s is defined twice (ko + en)', (key) => {
    const occurrences = i18n.split(`'${key}'`).length - 1;
    expect(occurrences).toBe(2);
  });
});

describe('the route serves the requested locale', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/api/release-notes/route.ts'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  test('is not force-static, which would freeze one language into the response', () => {
    // Regression: `force-static` prerenders the route once and hands the handler
    // an EMPTY searchParams, so `?locale=en` fell through to the `ko` default
    // and the build baked Korean notes into release-notes.body for all locales.
    expect(code).not.toMatch(/dynamic\s*=\s*'force-static'/);
    expect(code).toMatch(/dynamic\s*=\s*'force-dynamic'/);
  });

  test('reads locale off the query string', () => {
    expect(code).toMatch(/searchParams\.get\('locale'\)/);
  });

  test('the dialog refetches when the language changes', () => {
    const dialog = fs.readFileSync(
      path.join(ROOT, 'app/components/ui/ReleaseNotesDialog.tsx'),
      'utf8'
    );
    expect(dialog).toMatch(/locale=\$\{locale\}/);
    // locale must be an effect dependency, or switching language leaves the
    // previously fetched language on screen.
    expect(dialog).toMatch(/\[open,\s*locale\]/);
  });
});

describe('releaseSections caching', () => {
  test('returns the same parsed array for repeated calls in one locale', () => {
    expect(releaseSections('ko')).toBe(releaseSections('ko'));
  });

  test('does not share one locale cache entry across locales', () => {
    // A single-slot cache would return the Korean tree for an English request.
    expect(releaseSections('en')).not.toBe(releaseSections('ko'));
    const en = releaseSections('en').map((s) => s.groups.map((g) => g.label).join(','));
    const ko = releaseSections('ko').map((s) => s.groups.map((g) => g.label).join(','));
    expect(en).not.toEqual(ko);
  });
});
