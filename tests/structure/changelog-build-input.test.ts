/**
 * `/changelog` is `force-static`: it reads CHANGELOG.md from the filesystem at
 * BUILD time because the file is not shipped in the standalone runtime image.
 *
 * That makes CHANGELOG.md a required *build context* input, and `.dockerignore`
 * filters the build context — not just the runtime image. `.dockerignore` has
 * long carried a blanket `*.md`, which cut the file off from the builder stage.
 * Combined with a `try/catch` that fell back to an empty string, every image
 * built and passed CI while `/changelog` rendered "No changelog entries
 * available" in production.
 *
 * These tests pin both halves of the fix so the failure cannot return quietly.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function readRootFile(name: string): string {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

describe('CHANGELOG.md survives the Docker build context', () => {
  const dockerignore = readRootFile('.dockerignore');

  /** Non-comment, non-blank .dockerignore patterns, in file order. */
  const patterns = dockerignore
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  test('.dockerignore re-includes CHANGELOG.md after any markdown exclusion', () => {
    const excludesMarkdown = patterns.some((p) => p === '*.md' || p === '**/*.md');
    if (!excludesMarkdown) {
      // No blanket markdown exclusion — nothing to re-include.
      return;
    }
    expect(patterns).toContain('!CHANGELOG.md');
  });

  test('the re-include comes after the exclusion (Docker applies last match)', () => {
    const lastExclude = patterns.reduce(
      (acc, p, i) => (p === '*.md' || p === '**/*.md' ? i : acc),
      -1
    );
    if (lastExclude === -1) return;
    expect(patterns.lastIndexOf('!CHANGELOG.md')).toBeGreaterThan(lastExclude);
  });

  test('no pattern excludes CHANGELOG.md by name', () => {
    expect(patterns).not.toContain('CHANGELOG.md');
  });
});

describe('the changelog page fails loudly on a missing build input', () => {
  const page = readRootFile('app/changelog/page.tsx');

  test('reads CHANGELOG.md at build time', () => {
    // Loose on the path expression (it contains its own parens via
    // `process.cwd()`), strict on the two things that matter.
    expect(page).toMatch(/readFileSync\(/);
    expect(page).toContain("'CHANGELOG.md'");
  });

  test('stays force-static (the file is absent at runtime)', () => {
    expect(page).toContain("export const dynamic = 'force-static'");
  });

  test('does not swallow the read failure into an empty page', () => {
    // A `catch` around the read is what turned "build input missing" into
    // "page renders empty" — a green build with a broken page.
    expect(page).not.toMatch(/\bcatch\b/);
  });
});
