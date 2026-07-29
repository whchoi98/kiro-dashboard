'use client';

import type { Block, Group } from '@/lib/changelog-md';

/**
 * Shared renderer for parsed CHANGELOG.md blocks.
 *
 * Extracted from ChangelogClient so the /changelog page and the sidebar's
 * release-notes dialog render from the same code. A copy would let the dialog
 * silently regress the v1.6.1 fixes — literal `**` markers, flattened fenced
 * code, and raw `|---` tables were all shipped once already.
 */

const DOT_COLORS: Record<string, string> = {
  Added: '#22c55e',
  추가됨: '#22c55e',
  Fixed: '#f97316',
  수정됨: '#f97316',
  Changed: '#3b82f6',
  변경됨: '#3b82f6',
  Removed: '#ef4444',
  제거됨: '#ef4444',
  Performance: '#a855f7',
  성능: '#a855f7',
};

export function groupDotColor(label: string): string {
  return DOT_COLORS[label] ?? '#64748b';
}

/**
 * Inline `code` and **bold**. Backticks are split first so a `**` inside a code
 * span stays literal.
 */
export function renderInline(text: string, keyPrefix = '') {
  return text.split('`').map((part, i) =>
    i % 2 === 1 ? (
      <code
        key={`${keyPrefix}c${i}`}
        className="text-[#9046FF] bg-gray-900/80 px-1 rounded text-xs"
      >
        {part}
      </code>
    ) : (
      <span key={`${keyPrefix}s${i}`}>
        {part.split(/\*\*/).map((seg, j) =>
          j % 2 === 1 ? (
            <strong key={j} className="font-semibold text-slate-200">
              {seg}
            </strong>
          ) : (
            <span key={j}>{seg}</span>
          )
        )}
      </span>
    )
  );
}

export function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'para':
      return <p className="text-slate-400 text-sm mb-2">{renderInline(block.text)}</p>;

    case 'list':
      return (
        <ul className="flex flex-col gap-1.5 list-disc pl-5 mb-2 marker:text-slate-600">
          {block.items.map((item, ii) => (
            <li key={ii} className="text-slate-300 text-sm">
              {renderInline(item, `${ii}-`)}
            </li>
          ))}
        </ul>
      );

    case 'code':
      return (
        <pre className="bg-gray-900/80 border border-dashboard-border rounded-lg p-3 mb-3 overflow-x-auto">
          <code className="text-xs text-slate-300 whitespace-pre">
            {block.lines.join('\n')}
          </code>
        </pre>
      );

    case 'table':
      return (
        <div className="overflow-x-auto mb-3">
          <table className="text-xs text-left border-collapse">
            <thead>
              <tr>
                {block.header.map((h, hi) => (
                  <th
                    key={hi}
                    className="border border-dashboard-border px-2 py-1 font-semibold text-slate-200"
                  >
                    {renderInline(h, `h${hi}-`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-dashboard-border px-2 py-1 text-slate-400 align-top"
                    >
                      {renderInline(cell, `r${ri}c${ci}-`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** A category ("Added" / "Fixed" / …) with its colored dot and blocks. */
export function GroupView({ group }: { group: Group }) {
  return (
    <div className="mb-4 last:mb-0">
      {group.label && (
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-2">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: groupDotColor(group.label) }}
          />
          {group.label}
        </h4>
      )}
      {group.blocks.map((b, bi) => (
        <BlockView key={bi} block={b} />
      ))}
    </div>
  );
}
