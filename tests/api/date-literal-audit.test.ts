/**
 * No Athena route may resolve its own date window.
 *
 * `ResultReuseByAgeConfiguration` matches on the query STRING, so a single
 * `CURRENT_DATE` left in a route makes that route permanently unreusable while
 * looking completely fine in review — the string is stable, and only the engine
 * knows the window moved. Measured live: the CURRENT_DATE form scanned the full
 * 100304 bytes on both consecutive runs; the literal form went to 0 bytes and
 * 808ms -> 242ms.
 *
 * This audit reads the route files off disk rather than importing them, because
 * the failure mode is textual: it is a phrase reappearing in SQL, not a behaviour
 * a functional test would notice.
 *
 * `/api/analyze` is exempt: its SQL is authored by the model at runtime, so
 * there is no interpolation site to convert. `lib/analyze-prompt.ts` therefore
 * still documents the CURRENT_DATE form for the LLM, and RESULT_REUSE_MAX_AGE
 * is 60 minutes precisely so those queries cannot straddle an 02:00 UTC drop.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const API_DIR = join(__dirname, '..', '..', 'app', 'api');

/** Every `route.ts` under app/api, recursively. */
function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full));
    } else if (entry === 'route.ts') {
      out.push(full);
    }
  }
  return out;
}

/** Routes whose SQL the model writes, not us. */
const EXEMPT = ['analyze'];

function relative(file: string): string {
  return file.slice(file.indexOf('app/api'));
}

/**
 * Source with comments stripped.
 *
 * The banned phrases are the whole point of the comments that explain why they
 * are banned, so a raw text scan flags every file that documents the rule. Only
 * the executable text can be judged — and stripping comments here rather than
 * rewording them keeps the test honest: the alternative (deleting the words from
 * the comments to get green) would be editing production code to satisfy a test.
 */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('Athena route date windows are literals', () => {
  const files = routeFiles(API_DIR).filter(
    (f) => !EXEMPT.some((name) => f.includes(join('api', name) + '/'))
  );

  it('finds the route files (guards against a silently empty audit)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [relative(f), f]))(
    '%s interpolates no CURRENT_DATE',
    (_label, file) => {
      const src = withoutComments(readFileSync(file as string, 'utf8'));
      expect(src).not.toMatch(/CURRENT_DATE/);
    }
  );

  it.each(files.map((f) => [relative(f), f]))(
    '%s interpolates no DATE_ADD',
    (_label, file) => {
      const src = withoutComments(readFileSync(file as string, 'utf8'));
      // DATE_ADD is how the window was computed engine-side. Its absence is what
      // proves the conversion is complete rather than half-done.
      expect(src).not.toMatch(/DATE_ADD\s*\(/);
    }
  );

  it('routes that filter by date import the window helper', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const filtersByDate = /\bdate\s*>=|\bdate\s+BETWEEN|DATE_PARSE\s*\(/i.test(src);
      if (!filtersByDate) continue;
      if (!/from '@\/lib\/athena-window'/.test(src)) offenders.push(relative(file));
    }
    expect(offenders).toEqual([]);
  });
});
