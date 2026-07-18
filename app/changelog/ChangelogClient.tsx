'use client';

import { useMemo } from 'react';
import { useI18n } from '@/lib/i18n';

interface Group {
  label: string | null;
  items: string[];
  paras: string[];
}

interface VersionSection {
  version: string;
  date: string | null;
  groups: Group[];
}

const DOT_COLORS: Record<string, string> = {
  Added: '#22c55e',
  추가됨: '#22c55e',
  Fixed: '#f97316',
  수정됨: '#f97316',
  Changed: '#3b82f6',
  변경됨: '#3b82f6',
  Removed: '#ef4444',
  제거됨: '#ef4444',
};

/** Minimal changelog markdown parser — version sections, category subheadings, list items. */
function parseChangelog(markdown: string): VersionSection[] {
  const sections: VersionSection[] = [];
  let section: VersionSection | null = null;
  let group: Group | null = null;

  const ensureGroup = (): Group | null => {
    if (!section) return null;
    if (!group) {
      group = { label: null, items: [], paras: [] };
      section.groups.push(group);
    }
    return group;
  };

  for (const line of markdown.split('\n')) {
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
      group = { label: subMatch[1].trim(), items: [], paras: [] };
      section.groups.push(group);
      continue;
    }
    if (!line.trim() || /^---/.test(line) || /^\[!\[/.test(line) || /^\[[^\]]+\]:/.test(line)) {
      continue; // blank, ruler, badge, or link-definition lines
    }
    if (/^- /.test(line)) {
      ensureGroup()?.items.push(line.slice(2).trim());
      continue;
    }
    const g = ensureGroup();
    if (!g) continue;
    if (/^\s{2,}/.test(line) && g.items.length > 0) {
      // 2-space continuation line — merge into the previous list item
      g.items[g.items.length - 1] += ` ${line.trim()}`;
    } else {
      g.paras.push(line.trim()); // unknown line → plain paragraph
    }
  }
  return sections;
}

/** Render inline `code` spans; odd-indexed split segments are inside backticks. */
function renderInline(text: string) {
  return text.split('`').map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="text-[#9046FF] bg-gray-900/80 px-1 rounded text-xs">
        {part}
      </code>
    ) : (
      <span key={i}>{part}</span>
    )
  );
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
              {g.paras.map((p, pi) => (
                <p key={pi} className="text-slate-400 text-sm mb-2">
                  {renderInline(p)}
                </p>
              ))}
              {g.items.length > 0 && (
                <ul className="flex flex-col gap-1.5 list-disc pl-5 marker:text-slate-600">
                  {g.items.map((item, ii) => (
                    <li key={ii} className="text-slate-300 text-sm">
                      {renderInline(item)}
                    </li>
                  ))}
                </ul>
              )}
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
