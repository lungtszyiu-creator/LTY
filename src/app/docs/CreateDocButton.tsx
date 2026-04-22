'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Simple one-click new-doc button. POSTs to /api/docs then sends the user
// straight into the editor so they land ready to type.
export default function CreateDocButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'PUBLIC' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? '创建失败');
        return;
      }
      const d = await res.json();
      router.push(`/docs/${d.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={create} disabled={busy} className="btn btn-primary">
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
      {busy ? '创建中…' : '新建文档'}
    </button>
  );
}
