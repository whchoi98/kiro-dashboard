'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import KiroMascot from '@/app/components/ui/KiroMascot';
import { useI18n } from '@/lib/i18n';

interface ToolEvent {
  tool: string;
  description?: string;
  rowCount?: number;
  done?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tools?: ToolEvent[];
  model?: string;
}

const EXAMPLE_KEYS = [
  'analyze.example1',
  'analyze.example2',
  'analyze.example3',
  'analyze.example4',
  'analyze.example5',
  'analyze.example6',
] as const;

const MODEL_ID = 'claude-sonnet-4-6';

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-xl font-bold text-white">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-lg font-bold text-white">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-3 text-base font-semibold text-slate-100">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 text-gray-300">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock)
      return <code className="text-xs">{children}</code>;
    return (
      <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-purple-400">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-gray-800/80 p-3 font-mono text-xs">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gray-800/50">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border-b border-gray-700 px-3 py-2 text-left text-xs font-semibold uppercase text-purple-400">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-gray-800/50 px-3 py-1.5 text-gray-300">
      {children}
    </td>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 list-inside list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-inside list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="text-gray-300">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-purple-400 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-purple-500 pl-3 italic text-gray-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-gray-700" />,
};

export default function AnalyzePage() {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const target = e.target;
    target.style.height = '46px';
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  };

  const handleSubmit = async (prompt: string) => {
    if (!prompt.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: prompt.trim() };

    // Build conversation history for context (exclude last in-progress assistant msg)
    const historyForApi = messages
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = '46px';
    }
    setLoading(true);

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      tools: [],
      model: MODEL_ID,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          history: historyForApi,
          sessionId: crypto.randomUUID(),
          days: 30,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'text') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + event.content,
                  };
                }
                return updated;
              });
            }

            if (event.type === 'tool_start') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  // Avoid duplicate tool_start entries for the same call
                  const existingPending = (last.tools ?? []).find(
                    (te) => te.tool === event.tool && !te.done,
                  );
                  if (existingPending) return prev;
                  updated[updated.length - 1] = {
                    ...last,
                    tools: [
                      ...(last.tools ?? []),
                      {
                        tool: event.tool,
                        description: event.description,
                      },
                    ],
                  };
                }
                return updated;
              });
            }

            if (event.type === 'tool_result') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant' && last.tools) {
                  const toolsCopy = [...last.tools];
                  for (let i = toolsCopy.length - 1; i >= 0; i--) {
                    if (
                      toolsCopy[i].tool === event.tool &&
                      !toolsCopy[i].done
                    ) {
                      toolsCopy[i] = {
                        ...toolsCopy[i],
                        rowCount: event.rowCount,
                        done: true,
                      };
                      break;
                    }
                  }
                  updated[updated.length - 1] = {
                    ...last,
                    tools: toolsCopy,
                  };
                }
                return updated;
              });
            }

            if (event.type === 'error') {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content:
                      last.content + `\n\n**오류:** ${event.content}`,
                  };
                }
                return updated;
              });
            }
          } catch {
            // Skip malformed SSE data
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: `연결 오류: ${message}`,
          };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(input);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4 flex-shrink-0">
        <KiroMascot
          size={56}
          mood="thinking"
          theme="analyze"
          message={loading ? t('analyze.thinking') : undefined}
        />
        <div>
          <h1 className="text-2xl font-bold text-white">
            {t('header.analyze')}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {t('header.analyze.sub')}
          </p>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto min-h-0 rounded-xl border border-gray-800 bg-gray-950/50 p-4">
        {/* Welcome state */}
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <KiroMascot size={72} mood="happy" theme="analyze" animate />
              <p className="text-white text-lg font-semibold">
                Kiro Analytics AI
              </p>
              <p className="text-slate-500 text-sm max-w-sm">
                {t('header.analyze.sub')}
              </p>
            </div>

            {/* 2-column suggestion grid */}
            <div className="grid grid-cols-2 gap-2 max-w-2xl w-full">
              {EXAMPLE_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => handleSubmit(t(key))}
                  className="px-4 py-3 text-sm text-slate-300 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 hover:border-[#9046FF]/60 rounded-xl transition-all duration-150 text-left leading-snug"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {hasMessages && (
          <div className="flex flex-col gap-4">
            {messages.map((msg, idx) => (
              <div key={idx}>
                {msg.role === 'user' ? (
                  /* User bubble — right-aligned, purple background */
                  <div className="flex justify-end">
                    <div className="max-w-[75%] bg-[#9046FF] text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  /* AI bubble — left-aligned, dark card */
                  <div className="flex justify-start">
                    <div className="max-w-[88%] flex flex-col gap-2">
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
                                    : '사용자 조회 중...'}
                                </>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* AI message content with markdown */}
                      {msg.content && (
                        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl rounded-bl-sm px-5 py-4 text-sm leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {msg.content}
                          </ReactMarkdown>

                          {/* Model badge */}
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

                      {/* Loading indicator (no content yet) */}
                      {!msg.content &&
                        idx === messages.length - 1 &&
                        loading && (
                          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl rounded-bl-sm px-5 py-4">
                            <div className="flex items-center gap-2 text-slate-400 text-sm">
                              <span className="flex gap-1">
                                <span
                                  className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"
                                  style={{ animationDelay: '0ms' }}
                                />
                                <span
                                  className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"
                                  style={{ animationDelay: '150ms' }}
                                />
                                <span
                                  className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"
                                  style={{ animationDelay: '300ms' }}
                                />
                              </span>
                              {t('analyze.thinking')}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quick prompts (shown after first message, not while loading) */}
      {hasMessages && !loading && (
        <div className="flex flex-wrap gap-1.5 mt-2 flex-shrink-0">
          {EXAMPLE_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => handleSubmit(t(key))}
              className="px-3 py-1 text-xs text-slate-400 bg-gray-800/40 hover:bg-gray-700/40 border border-gray-800 hover:border-[#9046FF]/40 rounded-full transition-all duration-150"
            >
              {t(key)}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="mt-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('analyze.placeholder')}
            disabled={loading}
            rows={1}
            className="flex-1 resize-none bg-gray-900/80 border border-gray-700 focus:border-[#9046FF] focus:ring-1 focus:ring-[#9046FF]/30 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-150 disabled:opacity-50"
            style={{ minHeight: '46px', maxHeight: '120px' }}
          />
          <button
            onClick={() => handleSubmit(input)}
            disabled={loading || !input.trim()}
            className="bg-[#9046FF] hover:bg-[#7c3aed] disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold text-sm px-5 py-3 rounded-xl transition-all duration-150 shadow-lg shadow-purple-500/20 disabled:shadow-none flex-shrink-0"
          >
            {t('analyze.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
