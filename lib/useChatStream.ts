'use client';

import { useCallback, useRef, useState } from 'react';

export interface ToolEvent {
  tool: string;
  description?: string;
  rowCount?: number;
  done?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools?: ToolEvent[];
  model?: string;
  error?: string;
}

export const CHAT_MODEL_ID = 'claude-sonnet-4-6';

// Multi-turn context sent back to /api/analyze — cap borrowed from the
// claude-code-dashboard chatbot (12 turns keeps prompts bounded while
// preserving enough context for follow-up questions).
const HISTORY_MAX = 12;

export interface ChatStream {
  messages: ChatMessage[];
  isStreaming: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

/**
 * Shared chat state + SSE streaming against the /api/analyze agent
 * (Bedrock agentic loop with query_athena / lookup_users tools).
 * Used by both the /analyze page and the global FloatingChat widget.
 */
export function useChatStream(): ChatStream {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const update = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessages((prev) => {
        const next = updater(prev);
        messagesRef.current = next;
        return next;
      });
    },
    []
  );

  const patchLastAssistant = useCallback(
    (patch: (m: ChatMessage) => ChatMessage) => {
      update((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        return [...prev.slice(0, -1), patch(last)];
      });
    },
    [update]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
    update(() => []);
    setIsStreaming(false);
  }, [update]);

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt || streamingRef.current) return;

      // History is {role, content} text pairs only — tool calls are
      // request-scoped on the server and never round-trip to the client.
      const historyForApi = messagesRef.current
        .filter((m) => m.content.trim().length > 0)
        .slice(-HISTORY_MAX)
        .map((m) => ({ role: m.role, content: m.content }));

      update((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: prompt },
        // Optimistic empty assistant message so the panel shows typing
        // dots before the first stream chunk arrives.
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          tools: [],
          model: CHAT_MODEL_ID,
        },
      ]);

      streamingRef.current = true;
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            history: historyForApi,
            sessionId: crypto.randomUUID(),
            days: 30,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            let event: {
              type: string;
              content?: string;
              tool?: string;
              description?: string;
              rowCount?: number;
            };
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue; // skip malformed SSE data
            }

            if (event.type === 'text' && event.content) {
              const text = event.content;
              patchLastAssistant((m) => ({ ...m, content: m.content + text }));
            } else if (event.type === 'tool_start' && event.tool) {
              patchLastAssistant((m) => {
                const pending = (m.tools ?? []).find(
                  (te) => te.tool === event.tool && !te.done
                );
                if (pending) return m;
                return {
                  ...m,
                  tools: [
                    ...(m.tools ?? []),
                    { tool: event.tool!, description: event.description },
                  ],
                };
              });
            } else if (event.type === 'tool_result' && event.tool) {
              patchLastAssistant((m) => {
                const tools = [...(m.tools ?? [])];
                for (let i = tools.length - 1; i >= 0; i--) {
                  if (tools[i].tool === event.tool && !tools[i].done) {
                    tools[i] = {
                      ...tools[i],
                      rowCount: event.rowCount,
                      done: true,
                    };
                    break;
                  }
                }
                return { ...m, tools };
              });
            } else if (event.type === 'error') {
              const message = event.content ?? 'Unknown error';
              patchLastAssistant((m) => ({ ...m, error: message }));
            }
          }
        }
      } catch (err: unknown) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          const message = err instanceof Error ? err.message : String(err);
          patchLastAssistant((m) => ({ ...m, error: message }));
        }
      } finally {
        // Guard against a stale request's cleanup clobbering a newer one
        // (stop → immediate resend), borrowed from the reference hook.
        if (abortRef.current === controller) {
          abortRef.current = null;
          streamingRef.current = false;
          setIsStreaming(false);
        }
      }
    },
    [patchLastAssistant, update]
  );

  return { messages, isStreaming, send, stop, reset };
}
