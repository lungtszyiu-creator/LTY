import { put } from '@vercel/blob';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type SavedFile = {
  filename: string;
  storedPath: string;         // Blob URL; empty string if content is inline
  content: Buffer | null;     // Inline bytes when DB-backed; null if Blob-backed
  mimeType: string;
  size: number;
};

// 5 MB cap for DB-inline storage. Vercel Blob (when enabled) handles up to
// 25 MB per /api/upload. Keep receipts/screenshots/PDFs well within this.
export const DB_INLINE_LIMIT = 5 * 1024 * 1024;

function safeExt(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

export function hasBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function saveUploadedFile(file: File): Promise<SavedFile> {
  const mimeType = file.type || 'application/octet-stream';

  // Cloud path — used whenever Vercel Blob is configured. Files go to the
  // public bucket with unguessable paths; DB row just stores the URL.
  if (hasBlobConfigured()) {
    const now = new Date();
    const sub = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const key = `${sub}/${randomUUID()}${safeExt(file.name)}`;
    const blob = await put(key, file, {
      access: 'public',
      addRandomSuffix: false,
      contentType: mimeType,
    });
    return { filename: file.name, storedPath: blob.url, content: null, mimeType, size: file.size };
  }

  // DB-inline fallback — zero-config. Keep files small so Postgres rows
  // don't get obese; caller decides whether to reject or 413.
  if (file.size > DB_INLINE_LIMIT) {
    const mb = (DB_INLINE_LIMIT / 1024 / 1024).toFixed(0);
    throw new Error(`FILE_TOO_LARGE_FOR_DB_STORAGE:单文件不可超过 ${mb} MB（未配置云存储时）。请把大文件压缩或分拆后再传。`);
  }
  const ab = await file.arrayBuffer();
  return {
    filename: file.name,
    storedPath: '',
    content: Buffer.from(ab),
    mimeType,
    size: file.size,
  };
}
