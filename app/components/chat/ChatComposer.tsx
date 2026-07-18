'use client';

import { useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

interface ChatComposerProps {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  compact?: boolean;
}

export default function ChatComposer({
  isStreaming,
  onSend,
  onStop,
  compact = false,
}: ChatComposerProps) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = '46px';
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const target = e.target;
    target.style.height = '46px';
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <textarea
        ref={inputRef}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={t('analyze.placeholder')}
        disabled={isStreaming}
        rows={1}
        className="flex-1 resize-none bg-gray-900/80 border border-gray-700 focus:border-[#9046FF] focus:ring-1 focus:ring-[#9046FF]/30 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-150 disabled:opacity-50"
        style={{ minHeight: '46px', maxHeight: '120px' }}
      />
      {isStreaming ? (
        <button
          onClick={onStop}
          className="bg-gray-800 hover:bg-gray-700 text-slate-300 font-semibold text-sm px-4 py-3 rounded-xl border border-gray-700 transition-all duration-150 flex-shrink-0"
        >
          {t('chat.stop')}
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={!input.trim()}
          className={`bg-[#9046FF] hover:bg-[#7c3aed] disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold text-sm ${compact ? 'px-4' : 'px-5'} py-3 rounded-xl transition-all duration-150 shadow-lg shadow-purple-500/20 disabled:shadow-none flex-shrink-0`}
        >
          {t('analyze.send')}
        </button>
      )}
    </div>
  );
}
