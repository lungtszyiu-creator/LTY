'use client';

/**
 * 字体大小调节按钮（Aa 图标 + 弹层）—— 4 档：小 / 标准 / 大 / 超大
 *
 * 写 cookie + 立刻改 <html style.fontSize>（避免 router.refresh 等 SSR 回来前 FOUC）+ refresh 让 SSR 同步。
 * 持久化：cookie 1 年。
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FONT_SCALE_COOKIE,
  FONT_SCALE_ZOOM,
  FONT_SCALE_LABEL,
  type FontScale,
} from '@/lib/font-scale';

const ORDER: FontScale[] = ['sm', 'base', 'lg', 'xl'];

export function FontScaler({ current }: { current: FontScale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }
  }, [open]);

  function pick(key: FontScale) {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${FONT_SCALE_COOKIE}=${key}; path=/; max-age=${oneYear}; samesite=lax`;
    // 立刻设 zoom 避免 router.refresh 等 SSR 回来前 FOUC
    document.documentElement.style.zoom = String(FONT_SCALE_ZOOM[key]);
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="字体大小"
        aria-expanded={open}
        title="字体大小"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 transition hover:bg-amber-100/30"
      >
        <span className="leading-none">
          <span className="text-[15px] font-semibold">A</span>
          <span className="ml-[1px] text-[10px] font-semibold align-baseline">a</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <ul className="py-1">
            {ORDER.map((k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => pick(k)}
                  className={`flex w-full items-center justify-between px-4 py-2 transition hover:bg-slate-50 ${
                    current === k
                      ? 'bg-amber-50 font-medium text-amber-900'
                      : 'text-slate-700'
                  }`}
                  // 弹层项里用对应 zoom 比例预览效果（不用 css zoom 避免影响 li 布局）
                  style={{ fontSize: `${14 * FONT_SCALE_ZOOM[k]}px` }}
                >
                  <span>{FONT_SCALE_LABEL[k]}</span>
                  {current === k && <span className="text-xs">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
