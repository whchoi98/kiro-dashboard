'use client';

import { useEffect, useRef } from 'react';
import KiroMascot from '@/app/components/ui/KiroMascot';
import MessageList from './MessageList';
import ChatComposer from './ChatComposer';
import { ChatStream, CHAT_MODEL_ID } from '@/lib/useChatStream';
import { isNearBottom } from '@/lib/chat-scroll';
import { useI18n } from '@/lib/i18n';

const EXAMPLE_KEYS = [
  'analyze.example1',
  'analyze.example2',
  'analyze.example3',
  'analyze.example4',
  'analyze.example5',
  'analyze.example6',
] as const;

interface ChatPanelProps {
  chat: ChatStream;
  variant: 'page' | 'widget';
  onClose?: () => void;
}

export default function ChatPanel({ chat, variant, onClose }: ChatPanelProps) {
  const { t } = useI18n();
  const { messages, isStreaming, send, stop, reset } = chat;
  const hasMessages = messages.length > 0;
  const isWidget = variant === 'widget';
  const exampleKeys = isWidget ? EXAMPLE_KEYS.slice(0, 4) : EXAMPLE_KEYS;

  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user currently sits at the bottom of the conversation.
  // Ref (not state): scroll position must never trigger re-renders.
  const pinnedRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) pinnedRef.current = isNearBottom(el.scrollTop, el.scrollHeight, el.clientHeight);
  };

  // Auto-follow the stream only while pinned; scrolling up to read must win.
  // Instant scrollTop write — a smooth scrollIntoView per SSE chunk queues
  // animations that yank the view back down and also scrolls ancestor
  // containers (the page behind the widget).
  // isStreaming is a dep because stream end mounts the quick-prompt chip row,
  // shrinking this container without a messages change — a pinned view must
  // re-bottom or the answer's last lines hide below the fold.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  // Sending a question is an explicit "take me to the answer".
  const sendPinned = (text: string) => {
    pinnedRef.current = true;
    send(text);
  };

  const quickPromptButtons = exampleKeys.map((key) => (
    <button
      key={key}
      onClick={() => sendPinned(t(key))}
      className={`px-3 py-1 text-xs text-slate-400 bg-gray-800/40 hover:bg-gray-700/40 border border-gray-800 hover:border-[#9046FF]/40 rounded-full transition-all duration-150 ${
        isWidget ? 'flex-shrink-0 whitespace-nowrap' : ''
      }`}
    >
      {t(key)}
    </button>
  ));

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Widget header */}
      {isWidget && (
        <div
          data-chat-drag-handle
          className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/90 rounded-t-2xl cursor-move select-none"
          style={{ touchAction: 'none' }}
        >
          <div className="flex items-center gap-2">
            <KiroMascot size={26} mood="happy" theme="analyze" />
            <div>
              <p className="text-white text-sm font-semibold leading-tight">
                {t('chat.title')}
              </p>
              <p className="text-slate-500 text-[10px] leading-tight">{CHAT_MODEL_ID}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasMessages && (
              <button
                onClick={reset}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
              >
                {t('chat.reset')}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={t('chat.close')}
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Conversation area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto overscroll-contain min-h-0 p-4 ${
          isWidget
            ? 'bg-gray-950/95'
            : 'rounded-xl border border-gray-800 bg-gray-950/50'
        }`}
      >
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="flex flex-col items-center gap-3 text-center">
              <KiroMascot size={isWidget ? 52 : 72} mood="happy" theme="analyze" animate />
              <p className="text-white text-lg font-semibold">Kiro Analytics AI</p>
              <p className="text-slate-500 text-sm max-w-sm">{t('header.analyze.sub')}</p>
            </div>
            <div className={`grid ${isWidget ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-2 ${isWidget ? 'w-full' : 'max-w-2xl w-full'}`}>
              {exampleKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => sendPinned(t(key))}
                  className="px-4 py-2.5 text-sm text-slate-300 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 hover:border-[#9046FF]/60 rounded-xl transition-all duration-150 text-left leading-snug"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasMessages && (
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            exportable={!isWidget}
            compact={isWidget}
          />
        )}
      </div>

      {/* Quick prompts after the first exchange (page variant: wrapped pills
          below the conversation; widget: horizontal chip row lives inside the
          composer tray below) */}
      {!isWidget && hasMessages && !isStreaming && (
        <div className="flex flex-wrap gap-1.5 mt-2 flex-shrink-0">
          {quickPromptButtons}
        </div>
      )}

      {/* Composer */}
      <div className={`flex-shrink-0 ${isWidget ? 'p-3 border-t border-gray-800 bg-gray-900/90 rounded-b-2xl' : 'mt-3'}`}>
        {isWidget && hasMessages && !isStreaming && (
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {quickPromptButtons}
          </div>
        )}
        <ChatComposer isStreaming={isStreaming} onSend={sendPinned} onStop={stop} compact={isWidget} />
      </div>
    </div>
  );
}
