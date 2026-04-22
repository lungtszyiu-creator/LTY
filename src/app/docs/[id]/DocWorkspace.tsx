'use client';

import { useCallback } from 'react';
import DocEditor from '../DocEditor';

// Thin wrapper that owns the save closure. When real-time collab lands in
// Phase 2 this is where the Liveblocks provider will sit — the editor
// itself stays unchanged.
export default function DocWorkspace({
  docId, initialTitle, initialBodyJson, canEdit,
}: {
  docId: string;
  initialTitle: string;
  initialBodyJson: string;
  canEdit: boolean;
}) {
  const onSave = useCallback(async (state: { title: string; bodyJson: string; bodyText: string }) => {
    // Snapshot flag is the autosave-side's call; we always send it false
    // here and let the server-side bundle snapshots on its own cadence.
    const res = await fetch(`/api/docs/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: state.title,
        bodyJson: state.bodyJson,
        bodyText: state.bodyText,
        snapshot: Math.random() < 0.1, // ~1 in 10 saves also writes a version row
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'SAVE_FAILED');
    }
  }, [docId]);

  return (
    <DocEditor
      docId={docId}
      initialTitle={initialTitle}
      initialBodyJson={initialBodyJson}
      canEdit={canEdit}
      onSave={canEdit ? onSave : undefined}
    />
  );
}
