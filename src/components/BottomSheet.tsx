'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Generic slide-up bottom sheet used for H5-style pickers (leave category,
// overtime hours, etc.). Rendered via portal so backdrop covers everything,
// and click-outside-to-close + ESC-to-close are wired by default.
export default function BottomSheet({
  open,
  title,
  onClose,
  children,
  maxHeight = '80vh',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    // Lock background scroll so the sheet content scrolls alone.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (typeof document === 'undefined' || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end" onClick={onClose}>
      <div className="flex-1 bg-black/40 backdrop-blur-[2px] transition-opacity" aria-hidden />
      <div
        className="rounded-t-2xl bg-white shadow-2xl"
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="text-base font-semibold text-slate-800">{title}</div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: `calc(${maxHeight} - 60px)` }}>
          {children}
        </div>
        <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
      </div>
    </div>,
    document.body
  );
}
