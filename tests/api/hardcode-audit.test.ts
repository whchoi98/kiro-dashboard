/**
 * Regression guard against maintainer-specific values leaking into
 * runtime paths. If any of these strings show up in the app's code,
 * a fork/operator deploying to their own AWS account would hit 403s
 * (wrong S3 bucket) or receive bad SQL hints from the LLM (wrong
 * bucket name in the system prompt).
 *
 * Documentation files under `docs/` and CLAUDE.md are explicitly
 * allowed to mention these values as examples — this guard only
 * covers code that runs inside the container (app/ and lib/).
 */

import * as fs from 'fs';
import * as path from 'path';

const FORBIDDEN = [
  'whchoi01-titan-q-log',       // maintainer Athena bucket
  '120443221648',                // maintainer account id
];

const SKIP_DIRS = new Set(['node_modules', 'cdk.out', 'dist', '.next']);

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(p);
      } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

describe('runtime code does not hardcode maintainer AWS identifiers', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const runtimeDirs = [path.join(repoRoot, 'app'), path.join(repoRoot, 'lib')];
  const files = runtimeDirs.flatMap(listTsFiles);

  for (const forbidden of FORBIDDEN) {
    it(`no runtime file contains "${forbidden}"`, () => {
      const offenders = files.filter((f) => fs.readFileSync(f, 'utf8').includes(forbidden));
      expect(offenders.map((f) => path.relative(repoRoot, f))).toEqual([]);
    });
  }

  // 'titanlog' is the maintainer's database name. As the documented default it
  // may appear as an env-var fallback (`|| 'titanlog'` / `?? 'titanlog'`), but
  // nowhere else — embedding it in SQL (`FROM titanlog.x`) or in LLM-facing
  // text (Bedrock tool descriptions) bypasses ATHENA_DATABASE overrides.
  it(`"titanlog" appears in runtime code only as an env-var fallback default`, () => {
    const envFallbackRe = /(\|\||\?\?)\s*'titanlog'/g;
    const offenders = files.filter((f) => {
      const src = fs.readFileSync(f, 'utf8').replace(envFallbackRe, '');
      return src.includes('titanlog');
    });
    expect(offenders.map((f) => path.relative(repoRoot, f))).toEqual([]);
  });
});

describe('infra code pins maintainer identifiers only as documented defaults', () => {
  // PR #1 review found a maintainer account-id fallback hiding in infra/
  // (ecs-stack's S3_REPORT_PREFIX default) that the app/-and-lib/-only scan
  // above could not catch. Scan infra/ too: the account id must not appear
  // at all, and the two remaining maintainer defaults may live only in
  // ecs-stack.ts, where they are the documented back-compat fallbacks.
  const repoRoot = path.resolve(__dirname, '..', '..');
  const infraFiles = listTsFiles(path.join(repoRoot, 'infra'));

  it('no infra file contains the maintainer account id "120443221648"', () => {
    const offenders = infraFiles.filter((f) =>
      fs.readFileSync(f, 'utf8').includes('120443221648')
    );
    expect(offenders.map((f) => path.relative(repoRoot, f))).toEqual([]);
  });

  for (const pinned of ['whchoi01-titan-q-log', 'd-90663be888']) {
    it(`"${pinned}" appears in infra only inside ecs-stack.ts defaults`, () => {
      const offenders = infraFiles
        .filter((f) => fs.readFileSync(f, 'utf8').includes(pinned))
        .map((f) => path.relative(repoRoot, f));
      expect(offenders).toEqual([path.join('infra', 'lib', 'ecs-stack.ts')]);
    });
  }
});
