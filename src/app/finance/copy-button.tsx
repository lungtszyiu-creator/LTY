'use client';

/**
 * 通用复制按钮 —— 钱包地址 / 账号 / 凭证号等场景共用
 */
import { useState } from 'react';

export function CopyButton({
  text,
  label = '复制',
  className = '',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback：选中文本让用户手动 cmd+c
      window.prompt('自动复制失败，请手动复制：', text);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200 ${className}`}
    >
      {copied ? '✅ 已复制' : `📋 ${label}`}
    </button>
  );
}
