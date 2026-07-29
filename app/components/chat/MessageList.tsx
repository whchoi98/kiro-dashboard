'use client';

import { useRef, useState } from 'react';
import ChatMarkdown from './ChatMarkdown';
import { ChatMessage } from '@/lib/useChatStream';
import { exportMarkdown, exportPdf } from '@/lib/export-report';
import { useI18n } from '@/lib/i18n';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  /** Show MD/PDF save buttons under completed assistant answers (page variant). */
  exportable?: boolean;
  compact?: boolean;
}

export default function MessageList({
  messages,
  isStreaming,
  exportable = false,
  compact = false,
}: MessageListProps) {
  const { t, locale } = useI18n();
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportErrorId, setExportErrorId] = useState<string | null>(null);

  // Auto-scroll lives in ChatPanel (it owns the scroll container) — an
  // unconditional scrollIntoView here per streamed chunk hijacked user scroll.

  const questionFor = (idx: number): string | undefined => {
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return undefined;
  };

  const handlePdf = async (msg: ChatMessage) => {
    const el = cardRefs.current[msg.id];
    if (!el || exportingId) return;
    setExportingId(msg.id);
    setExportErrorId(null);
    try {
      await exportPdf(el);
    } catch (err) {
      // Surfaces stale-chunk 404s after a redeploy and capture failures —
      // a silent flip back to the idle label reads as "button is broken".
      console.error('[export-pdf]', err);
      setExportErrorId(msg.id);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg, idx) => {
        const isLast = idx === messages.length - 1;
        const streamingThis = isLast && isStreaming && msg.role === 'assistant';

        if (msg.role === 'user') {
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[75%] bg-[#9046FF] text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          );
        }

        return (
          <div key={msg.id} className="flex justify-start">
            <div className={`${compact ? 'max-w-full' : 'max-w-[88%]'} flex flex-col gap-2 w-full`}>
              {/* Tool execution badges */}
              {msg.tools && msg.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.tools.map((te, tIdx) => (
                    <span
                      key={tIdx}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                        te.done
                          ? 'bg-green-900/30 text-green-400 border border-green-800/50'
                          : 'bg-amber-900/30 text-amber-400 border border-amber-800/50'
                      }`}
                    >
                      {te.done ? (
                        <>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                          {te.tool === 'query_athena'
                            ? `Athena: ${te.rowCount}${t('analyze.queryDone')}`
                            : `IdC: ${te.rowCount} users`}
                        </>
                      ) : (
                        <>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          {te.tool === 'query_athena'
                            ? t('analyze.queryRunning')
                            : t('chat.lookingUpUsers')}
                        </>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Assistant content card */}
              {msg.content && (
                <div
                  ref={(el) => {
                    cardRefs.current[msg.id] = el;
                  }}
                  className="bg-gray-900/80 border border-gray-800 rounded-2xl rounded-bl-sm px-5 py-4 text-sm leading-relaxed"
                >
                  <ChatMarkdown content={msg.content} />
                  {msg.model && (
                    <div className="mt-3 pt-2 border-t border-gray-800/60 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#9046FF]/10 text-[#9046FF] border border-[#9046FF]/20">
                        <span className="w-1 h-1 rounded-full bg-[#9046FF]" />
                        {msg.model}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Save buttons — only for finished answers */}
              {exportable && msg.content && !streamingThis && (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => exportMarkdown(msg.content, questionFor(idx), locale)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-400 bg-gray-800/40 hover:bg-gray-700/60 hover:text-white border border-gray-800 rounded-lg transition-all duration-150"
                  >
                    {t('analyze.saveMd')}
                  </button>
                  <button
                    onClick={() => handlePdf(msg)}
                    disabled={exportingId !== null}
                    className="px-2.5 py-1 text-xs font-medium text-slate-400 bg-gray-800/40 hover:bg-gray-700/60 hover:text-white border border-gray-800 rounded-lg transition-all duration-150 disabled:opacity-50"
                  >
                    {exportingId === msg.id
                      ? t('analyze.savingPdf')
                      : t('analyze.savePdf')}
                  </button>
                  {exportErrorId === msg.id && (
                    <span className="self-center text-xs text-red-400">
                      {t('analyze.pdfError')}
                    </span>
                  )}
                </div>
              )}

              {/* Error box */}
              {msg.error && (
                <div className="bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-2.5 text-xs text-red-400">
                  {t('chat.error')}: {msg.error}
                </div>
              )}

              {/* Typing dots before first chunk */}
              {!msg.content && !msg.error && streamingThis && (
                <div className="bg-gray-900/80 border border-gray-800 rounded-2xl rounded-bl-sm px-5 py-4">
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    {t('analyze.thinking')}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
