import { put } from '@vercel/blob';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type SavedFile = {
  filename: string;    // original user-facing filename
  storedPath: string;  // Vercel Blob URL (acts as our identifier + CDN source)
  mimeType: string;
  size: number;
};

function safeExt(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

export async function saveUploadedFile(file: File): Promise<SavedFile> {
  const now = new Date();
  const sub = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  // `addRandomSuffix: false` combined with a UUID basename keeps the path stable and unguessable.
  const key = `${sub}/${randomUUID()}${safeExt(file.name)}`;
  const blob = await put(key, file, {
    access: 'public',
    addRandomSuffix: false,
    contentType: file.type || 'application/octet-stream',
  });
  return {
    filename: file.name,
    storedPath: blob.url,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
  };
}
