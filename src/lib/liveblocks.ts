import { createClient } from '@liveblocks/client';
import { createRoomContext } from '@liveblocks/react';

// Public entry-point for Liveblocks on the client. authEndpoint hits our
// signed-token route so Liveblocks knows which user is connecting and what
// their permissions are; we don't leak the secret key.
const client = createClient({
  authEndpoint: async (room) => {
    const res = await fetch('/api/liveblocks-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room }),
    });
    if (!res.ok) throw new Error(`Liveblocks auth failed: ${res.status}`);
    return res.json();
  },
  // Throttle tuned for doc editing: 16ms = 60fps presence updates is smooth
  // but expensive; 40ms still feels "live" for cursors and saves bandwidth.
  throttle: 40,
});

export type Presence = { /* reserved for future: cursor, selection */ };
export type Storage = {};

export const {
  RoomProvider,
  useRoom,
  useMyPresence,
  useOthers,
} = createRoomContext<Presence, Storage>(client);

export function isLiveblocksEnabled(): boolean {
  // Client-side env var; inlined by Next at build time.
  return typeof process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY === 'string'
    && process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY.length > 0;
}
