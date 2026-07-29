'use client';

import { useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import { Block, parseChangelog } from '@/lib/changelog-md';

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

/**
 * Inline `code` and **bold**. Backticks are split first so a `**` inside a code
 * span stays literal.
 */
function renderInline(text: string, keyPrefix = '') {
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

function BlockView({ block }: { block: Block }) {
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

export default function ChangelogClient({ english, korean }: { english: string; korean: string }) {
  const { locale, t } = useI18n();
  const sections = useMemo(
    () => parseChangelog(locale === 'ko' ? korean : english),
    [locale, korean, english]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('header.changelog')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('header.changelog.sub')}</p>
        </div>
      </div>

      {sections.map((section, si) => (
        <div key={si} className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <h3 className="text-lg font-semibold text-slate-300 mb-4">
            <span className="text-[#9046FF]">{section.version}</span>
            {section.date && (
              <span className="text-slate-500 text-sm font-normal ml-2">{section.date}</span>
            )}
          </h3>
          {section.groups.map((g, gi) => (
            <div key={gi} className="mb-4 last:mb-0">
              {g.label && (
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-2">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: DOT_COLORS[g.label] ?? '#64748b' }}
                  />
                  {g.label}
                </h4>
              )}
              {g.blocks.map((b, bi) => (
                <BlockView key={bi} block={b} />
              ))}
            </div>
          ))}
        </div>
      ))}

      {sections.length === 0 && (
        <div className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border">
          <p className="text-slate-500 text-sm">No changelog entries available</p>
        </div>
      )}
    </div>
  );
}
