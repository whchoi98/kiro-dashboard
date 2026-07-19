'use client';

import KiroMascot from '@/app/components/ui/KiroMascot';
import ChatPanel from '@/app/components/chat/ChatPanel';
import { useChatStream } from '@/lib/useChatStream';
import { useI18n } from '@/lib/i18n';

export default function AnalyzePage() {
  const { t } = useI18n();
  const chat = useChatStream();

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)] md:h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4 flex-shrink-0">
        <KiroMascot
          size={56}
          mood="thinking"
          theme="analyze"
          message={chat.isStreaming ? t('analyze.thinking') : undefined}
        />
        <div>
          <h1 className="text-2xl font-bold text-white">{t('header.analyze')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('header.analyze.sub')}</p>
        </div>
      </div>

      <ChatPanel chat={chat} variant="page" />
    </div>
  );
}
