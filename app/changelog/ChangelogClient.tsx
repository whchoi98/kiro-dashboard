'use client';

import { useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import { parseChangelog } from '@/lib/changelog-md';
import { GroupView } from '@/app/components/ui/ChangelogBlocks';

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
        <div
          key={si}
          // Anchor target for the release-notes dialog's "full changelog" links
          // (/changelog#v1.6.1), so a deep link lands on the right entry.
          id={`v${section.version}`}
          className="bg-dashboard-card rounded-xl p-5 border border-dashboard-border scroll-mt-20"
        >
          <h3 className="text-lg font-semibold text-slate-300 mb-4">
            <span className="text-[#9046FF]">{section.version}</span>
            {section.date && (
              <span className="text-slate-500 text-sm font-normal ml-2">{section.date}</span>
            )}
          </h3>
          {section.groups.map((g, gi) => (
            <GroupView key={gi} group={g} />
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
