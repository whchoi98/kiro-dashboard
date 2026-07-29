/**
 * Parser for the subset of markdown CHANGELOG.md actually uses.
 *
 * Extracted from `app/changelog/ChangelogClient.tsx` so it can be unit-tested:
 * Jest is configured for `.ts` only (`testMatch: **\/*.test.ts`), so logic that
 * lives inside a `.tsx` component is unreachable from tests. Same reason
 * `lib/chat-scroll.ts` is separate from `ChatPanel`.
 *
 * Scope is deliberately narrow — this is not a general markdown implementation.
 * It handles what the changelog contains: version headings, category
 * subheadings, paragraphs, bullet lists, fenced code, and pipe tables.
 */

/**
 * Blocks are kept in source order inside a group. An earlier version held
 * `paras` and `items` as separate arrays and rendered every paragraph before
 * every bullet, which silently reordered any entry that interleaved the two —
 * invisible while entries were bullet-only, wrong as soon as one wasn't.
 */
export type Block =
  | { kind: 'para'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'code'; lines: string[]; lang: string | null }
  | { kind: 'table'; header: string[]; rows: string[][] };

export interface Group {
  label: string | null;
  blocks: Block[];
}

export interface VersionSection {
  version: string;
  date: string | null;
  groups: Group[];
}

/** A `| a | b |` row split into trimmed cells, outer pipes dropped. */
function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

const isTableDivider = (line: string) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line.trim());

export function parseChangelog(markdown: string): VersionSection[] {
  const sections: VersionSection[] = [];
  let section: VersionSection | null = null;
  let group: Group | null = null;

  const ensureGroup = (): Group | null => {
    if (!section) return null;
    if (!group) {
      group = { label: null, blocks: [] };
      section.groups.push(group);
    }
    return group;
  };

  /** The trailing block, but only when it is still open for appending. */
  const openBlock = <K extends Block['kind']>(kind: K): Extract<Block, { kind: K }> | null => {
    const last = group?.blocks[group.blocks.length - 1];
    return last?.kind === kind ? (last as Extract<Block, { kind: K }>) : null;
  };

  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const versionMatch = line.match(/^## \[([^\]]+)\](?:\s*-\s*(.+))?/);
    if (versionMatch) {
      section = { version: versionMatch[1], date: versionMatch[2]?.trim() ?? null, groups: [] };
      sections.push(section);
      group = null;
      continue;
    }
    if (!section) continue; // ignore everything before the first '## ' heading

    const subMatch = line.match(/^### (.+)/);
    if (subMatch) {
      group = { label: subMatch[1].trim(), blocks: [] };
      section.groups.push(group);
      continue;
    }

    // Fenced code: consume through the closing fence so its contents are never
    // parsed as markdown (a `# comment` line inside bash is not a heading).
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      ensureGroup()?.blocks.push({ kind: 'code', lines: body, lang: fence[1] || null });
      continue;
    }

    // Pipe table: header row followed by a `|---|` divider.
    if (line.trim().startsWith('|') && isTableDivider(lines[i + 1] ?? '')) {
      const header = tableCells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
        rows.push(tableCells(lines[i]));
      }
      i--; // the loop's own i++ consumes the first non-row line
      ensureGroup()?.blocks.push({ kind: 'table', header, rows });
      continue;
    }

    if (!line.trim() || /^---/.test(line) || /^\[!\[/.test(line) || /^\[[^\]]+\]:/.test(line)) {
      // A blank line closes the current paragraph/list so the next one starts fresh.
      if (group && !line.trim()) group.blocks.push({ kind: 'para', text: '' });
      continue;
    }

    if (/^\s*- /.test(line)) {
      const g = ensureGroup();
      if (!g) continue;
      const list = openBlock('list');
      const item = line.replace(/^\s*- /, '').trim();
      if (list) list.items.push(item);
      else g.blocks.push({ kind: 'list', items: [item] });
      continue;
    }

    const g = ensureGroup();
    if (!g) continue;

    // Indented continuation lines belong to whatever block is still open.
    if (/^\s{2,}/.test(line)) {
      const list = openBlock('list');
      if (list && list.items.length > 0) {
        list.items[list.items.length - 1] += ` ${line.trim()}`;
        continue;
      }
    }
    const para = openBlock('para');
    if (para && para.text) para.text += ` ${line.trim()}`;
    else if (para) para.text = line.trim();
    else g.blocks.push({ kind: 'para', text: line.trim() });
  }

  // Drop the empty paragraphs used above purely as block separators.
  for (const s of sections) {
    for (const g of s.groups) {
      g.blocks = g.blocks.filter((b) => b.kind !== 'para' || b.text.length > 0);
    }
  }
  return sections;
}

/** Split the bilingual CHANGELOG.md into its English and Korean halves. */
export function splitLocales(raw: string): { english: string; korean: string } {
  const koreanStart = raw.search(/^# 한국어$/m);
  return {
    english: koreanStart >= 0 ? raw.slice(0, koreanStart) : raw,
    korean: koreanStart >= 0 ? raw.slice(koreanStart) : raw,
  };
}
