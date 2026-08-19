import * as fs from 'fs';
import * as path from 'path';
import { APP_VERSION } from '../../lib/version';

const ROOT = path.resolve(__dirname, '../..');
const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/gm;

function releasedVersions(markdown: string): string[] {
  return Array.from(markdown.matchAll(RELEASE_HEADING), (m) => m[1]);
}

describe('version sync (package.json ↔ CHANGELOG.md ↔ CLAUDE.md ↔ sidebar)', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  );
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

  test('APP_VERSION (shown in Sidebar) equals package.json version', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  test('latest released version in CHANGELOG (English) matches package.json', () => {
    const [english] = changelog.split(/^# 한국어$/m);
    const versions = releasedVersions(english);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0]).toBe(pkg.version);
  });

  test('latest released version in CHANGELOG (한국어) matches package.json', () => {
    const [, korean] = changelog.split(/^# 한국어$/m);
    expect(korean).toBeDefined();
    const versions = releasedVersions(korean);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0]).toBe(pkg.version);
  });

  test('English and Korean changelog sections list the same releases', () => {
    const [english, korean] = changelog.split(/^# 한국어$/m);
    expect(releasedVersions(korean ?? '')).toEqual(releasedVersions(english));
  });

  test('CLAUDE.md Version field matches package.json', () => {
    const match = claudeMd.match(/\*\*Version\*\*: (\d+\.\d+\.\d+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(pkg.version);
  });

  test('Sidebar renders the version from lib/version (no hardcoded fallback)', () => {
    const sidebar = fs.readFileSync(
      path.join(ROOT, 'app/components/layout/Sidebar.tsx'),
      'utf8'
    );
    expect(sidebar).toContain("from '@/lib/version'");
    expect(sidebar).toContain('v{APP_VERSION}');
    // No literal version strings hiding in the sidebar
    expect(sidebar).not.toMatch(/v\d+\.\d+\.\d+/);
  });

  test('README version badge matches package.json', () => {
    // The badge is the one version copy no other test guards — it drifted on
    // two consecutive releases (1.5.0 stuck through 1.10.0, then 1.10.0
    // through 1.11.0) before this test existed.
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    expect(readme).toContain(`version-${pkg.version}-purple`);
  });
});
