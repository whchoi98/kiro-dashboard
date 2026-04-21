'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import KiroMascot from '@/app/components/ui/KiroMascot';

interface HeaderProps {
  titleKey: string;
  subtitleKey: string;
  mascotMood?: 'happy' | 'excited' | 'thinking' | 'alert';
  mascotMessage?: string;
}

export default function Header({ titleKey, subtitleKey, mascotMood = 'happy', mascotMessage }: HeaderProps) {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <KiroMascot size={48} mood={mascotMood} message={mascotMessage} />
        <div>
          <h1 className="text-2xl font-bold text-white">{t(titleKey)}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t(subtitleKey)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="bg-gray-900/50 border border-gray-800 text-slate-400 text-xs font-medium px-3 py-1.5 rounded-full">
          {t('common.last30days')}
        </span>
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
