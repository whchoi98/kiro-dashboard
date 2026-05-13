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

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
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
});
