/**
 * The /changelog renderer is a deliberately small markdown subset, so its
 * limits are load-bearing: content the changelog contains but the parser drops
 * silently becomes a wrong page, not an error.
 *
 * These tests run the parser against the REAL CHANGELOG.md (both language
 * trees) as well as focused fixtures, because the failures worth catching are
 * "the file grew a construct the parser mangles", not synthetic edge cases.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Block, parseChangelog, splitLocales } from '../../lib/changelog-md';

const RAW = fs.readFileSync(
  path.join(path.resolve(__dirname, '../..'), 'CHANGELOG.md'),
  'utf8'
);

const kinds = (blocks: Block[]) => blocks.map((b) => b.kind);
const allBlocks = (markdown: string) =>
  parseChangelog(markdown).flatMap((s) => s.groups.flatMap((g) => g.blocks));

describe('block ordering is preserved', () => {
  // The bug this guards: paragraphs and lists used to live in separate arrays,
  // so every paragraph rendered before every bullet regardless of source order.
  const md = [
    '## [9.9.9] - 2026-01-01',
    '',
    '### Fixed',
    '',
    'Opening paragraph.',
    '',
    '- first bullet',
    '- second bullet',
    '',
    'Closing paragraph.',
    '',
    '- trailing bullet',
  ].join('\n');

  const blocks = parseChangelog(md)[0].groups[0].blocks;

  test('paragraph → list → paragraph → list, in that order', () => {
    expect(kinds(blocks)).toEqual(['para', 'list', 'para', 'list']);
  });

  test('consecutive bullets coalesce into one list', () => {
    expect(blocks[1]).toEqual({ kind: 'list', items: ['first bullet', 'second bullet'] });
  });

  test('a paragraph between bullets starts a new list', () => {
    expect(blocks[3]).toEqual({ kind: 'list', items: ['trailing bullet'] });
  });
});

describe('fenced code blocks', () => {
  const md = [
    '## [9.9.9] - 2026-01-01',
    '',
    '### Fixed',
    '',
    '```bash',
    'git pull   # or merge the tag',
    '## not a heading',
    '- not a bullet',
    '| not | a table |',
    '```',
    '',
    'after the fence',
  ].join('\n');

  const blocks = parseChangelog(md)[0].groups[0].blocks;

  test('captured as a single code block with its language', () => {
    expect(blocks[0]).toEqual({
      kind: 'code',
      lang: 'bash',
      lines: [
        'git pull   # or merge the tag',
        '## not a heading',
        '- not a bullet',
        '| not | a table |',
      ],
    });
  });

  test('markdown inside the fence is inert — no stray section, list, or table', () => {
    // A `##` line inside bash must not open a new version section, or the
    // upgrade instructions would fragment the page.
    expect(parseChangelog(md)).toHaveLength(1);
    expect(kinds(blocks)).toEqual(['code', 'para']);
  });

  test('multi-line commands keep their line breaks', () => {
    const code = blocks[0] as Extract<Block, { kind: 'code' }>;
    expect(code.lines).toHaveLength(4);
  });
});

describe('pipe tables', () => {
  const md = [
    '## [9.9.9] - 2026-01-01',
    '',
    '### Added',
    '',
    '| Feature | Needs | Without it |',
    '|---------|-------|-----------|',
    '| `/rollout` | `Client_Type` | empty charts |',
    '| Dormancy | nothing new | graded `never` |',
    '',
    'trailing text',
  ].join('\n');

  const blocks = parseChangelog(md)[0].groups[0].blocks;

  test('header and rows are split into cells, outer pipes dropped', () => {
    expect(blocks[0]).toEqual({
      kind: 'table',
      header: ['Feature', 'Needs', 'Without it'],
      rows: [
        ['`/rollout`', '`Client_Type`', 'empty charts'],
        ['Dormancy', 'nothing new', 'graded `never`'],
      ],
    });
  });

  test('the divider row is not emitted as data', () => {
    const table = blocks[0] as Extract<Block, { kind: 'table' }>;
    expect(table.rows.every((r) => !r.join('').includes('---'))).toBe(true);
  });

  test('parsing resumes after the table', () => {
    expect(kinds(blocks)).toEqual(['table', 'para']);
  });
});

describe('list continuation lines', () => {
  test('2-space continuations merge into the preceding bullet', () => {
    const md = [
      '## [9.9.9] - 2026-01-01',
      '',
      '### Changed',
      '',
      '- a bullet that wraps',
      '  onto a second line',
      '  and a third',
    ].join('\n');
    const blocks = parseChangelog(md)[0].groups[0].blocks;
    expect(blocks).toEqual([
      { kind: 'list', items: ['a bullet that wraps onto a second line and a third'] },
    ]);
  });
});

describe('the real CHANGELOG.md parses in both languages', () => {
  const { english, korean } = splitLocales(RAW);

  test('splitLocales actually splits (Korean heading present)', () => {
    expect(korean.startsWith('# 한국어')).toBe(true);
    expect(english).not.toContain('# 한국어');
  });

  test.each([
    ['english', english],
    ['korean', korean],
  ])('%s: every release section is found and non-empty', (_label, md) => {
    const sections = parseChangelog(md);
    expect(sections.length).toBeGreaterThan(1);
    for (const s of sections) {
      if (s.version === 'Unreleased') continue; // legitimately empty
      const blocks = s.groups.flatMap((g) => g.blocks);
      expect(blocks.length).toBeGreaterThan(0);
    }
  });

  test.each([
    ['english', english],
    ['korean', korean],
  ])('%s: the upgrade guide keeps its code and table blocks', (_label, md) => {
    // The 1.5.0 upgrade section is the only place the changelog uses fenced
    // code and a table. If the parser regressed to line-by-line handling,
    // these would arrive as paragraphs full of literal backticks and pipes.
    const blocks = allBlocks(md);
    expect(blocks.filter((b) => b.kind === 'code').length).toBeGreaterThan(0);
    expect(blocks.filter((b) => b.kind === 'table').length).toBeGreaterThan(0);
  });

  test.each([
    ['english', english],
    ['korean', korean],
  ])('%s: no rendered text leaks a raw fence or table divider', (_label, md) => {
    const text = allBlocks(md)
      .filter((b) => b.kind === 'para' || b.kind === 'list')
      .map((b) => (b.kind === 'para' ? b.text : (b as { items: string[] }).items.join(' ')))
      .join('\n');
    expect(text).not.toContain('```');
    expect(text).not.toMatch(/\|\s*-{3,}/);
  });

  test('every version heading in the file becomes a section', () => {
    const headingCount = (RAW.match(/^## \[/gm) ?? []).length;
    const parsed =
      parseChangelog(english).length + parseChangelog(korean).length;
    expect(parsed).toBe(headingCount);
  });
});
