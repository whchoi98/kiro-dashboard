'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import KiroMascot from '@/app/components/ui/KiroMascot';
import DateRangePicker from '@/app/components/ui/DateRangePicker';

interface HeaderProps {
  titleKey: string;
  subtitleKey: string;
  mascotMood?: 'happy' | 'excited' | 'thinking' | 'alert';
  mascotTheme?: 'dashboard' | 'users' | 'trends' | 'credits' | 'productivity' | 'engagement' | 'analyze';
  mascotMessage?: string;
  days: number;
  onDaysChange: (days: number) => void;
}

export default function Header({
  titleKey,
  subtitleKey,
  mascotMood = 'happy',
  mascotTheme = 'dashboard',
  mascotMessage,
  days,
  onDaysChange,
}: HeaderProps) {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <KiroMascot size={56} mood={mascotMood} theme={mascotTheme} message={mascotMessage} />
        <div>
          <h1 className="text-2xl font-bold text-white">{t(titleKey)}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t(subtitleKey)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <DateRangePicker value={days} onChange={onDaysChange} />
        <button
          onClick={() => router.refresh()}
          className="bg-[#9046FF] hover:bg-[#7c3aed] text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors duration-150 shadow-lg shadow-purple-500/20"
        >
          {t('common.refresh')}
        </button>
      </div>
    </div>
  );
}
