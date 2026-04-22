'use client';

import { useCallback } from 'react';
import DocEditor from '../DocEditor';
import CollaborativeDocEditor from './CollaborativeDocEditor';
import { isLiveblocksEnabled } from '@/lib/liveblocks';

// Branches based on whether Liveblocks env keys are present:
//   - key configured → CollaborativeDocEditor (Yjs + live cursors)
//   - no key         → single-user DocEditor (Phase 1 behaviour)
// Postgres autosave fires in both paths so the DB stays the durable truth.
export default function DocWorkspace({
  docId, initialTitle, initialBodyJson, canEdit,
}: {
  docId: string;
  initialTitle: string;
  initialBodyJson: string;
  canEdit: boolean;
}) {
  const onSave = useCallback(async (state: { title: string; bodyJson: string; bodyText: string }) => {
    const res = await fetch(`/api/docs/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: state.title,
        bodyJson: state.bodyJson,
        bodyText: state.bodyText,
        snapshot: Math.random() < 0.1,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'SAVE_FAILED');
    }
  }, [docId]);

  const collab = isLiveblocksEnabled();

  if (collab) {
    return (
      <CollaborativeDocEditor
        docId={docId}
        initialTitle={initialTitle}
        initialBodyJson={initialBodyJson}
        canEdit={canEdit}
        onSave={onSave}
      />
    );
  }

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
