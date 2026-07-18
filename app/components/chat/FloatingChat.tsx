'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import KiroMascot from '@/app/components/ui/KiroMascot';
import ChatPanel from './ChatPanel';
import { useChatStream } from '@/lib/useChatStream';
import { useI18n } from '@/lib/i18n';

const PANEL_W = 400;
const PANEL_H = 600;
const MARGIN = 8;

/**
 * Global chatbot widget (structure borrowed from claude-code-dashboard's
 * FloatingChat): a minimized launcher bottom-right that expands into a
 * draggable panel. One chat session lives here for the whole SPA session —
 * history survives route changes because this component never unmounts.
 * Hidden on /analyze, which hosts the full-page version of the same chat.
 */
export default function FloatingChat() {
  const pathname = usePathname();
  const { t } = useI18n();
  const chat = useChatStream();
  const [open, setOpen] = useState(false);
  // Drag offset from the bottom-right anchor; survives open/close.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const clamp = useCallback((x: number, y: number) => {
    // Anchor is bottom-right: offset.x/y are negative-left/negative-up shifts.
    const maxLeft = -(window.innerWidth - PANEL_W - MARGIN * 2);
    const maxUp = -(window.innerHeight - PANEL_H - MARGIN * 2);
    return {
      x: Math.min(0, Math.max(maxLeft, x)),
      y: Math.min(0, Math.max(maxUp, y)),
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const handle = (e.target as HTMLElement).closest('[data-chat-drag-handle]');
      if (!handle) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: offset.x,
        baseY: offset.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offset]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !panelRef.current) return;
      const { startX, startY, baseX, baseY } = dragRef.current;
      const next = clamp(baseX + e.clientX - startX, baseY + e.clientY - startY);
      // Write transform directly to the DOM during the drag for smoothness;
      // React state is only committed on release.
      panelRef.current.style.transform = `translate(${next.x}px, ${next.y}px)`;
    },
    [clamp]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const { startX, startY, baseX, baseY } = dragRef.current;
      dragRef.current = null;
      setOffset(clamp(baseX + e.clientX - startX, baseY + e.clientY - startY));
    },
    [clamp]
  );

  // Keep the committed offset applied when not dragging.
  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    }
  }, [offset, open]);

  // The /analyze page hosts the full-page chat — no widget there.
  if (pathname === '/analyze') return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label={t('chat.open')}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 pl-2.5 pr-4 py-2 bg-gray-900/95 hover:bg-gray-800 border border-gray-700 hover:border-[#9046FF]/60 rounded-full shadow-xl shadow-black/40 transition-all duration-150 group"
      >
        <KiroMascot size={34} mood="happy" theme="analyze" />
        <span className="text-sm font-semibold text-slate-200 group-hover:text-white">
          {t('chat.open')}
        </span>
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="fixed bottom-5 right-5 z-40 flex flex-col rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl shadow-black/60 overflow-hidden"
      style={{ width: PANEL_W, height: PANEL_H, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)' }}
    >
      <ChatPanel chat={chat} variant="widget" onClose={() => setOpen(false)} />
    </div>
  );
}
