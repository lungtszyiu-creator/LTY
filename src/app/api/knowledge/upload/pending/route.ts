/**
 * Mac 端 BlobSync 线程拉取 pending 上传列表
 *
 * 鉴权：Authorization: Bearer <BLOB_SYNC_SECRET>（共享密钥）
 * 不走 NextAuth，因为 Mac worker 没浏览器 cookie。
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.BLOB_SYNC_SECRET;

  if (!expected) {
    return NextResponse.json({ error: 'SERVER_NOT_CONFIGURED: BLOB_SYNC_SECRET 未设' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const pending = await prisma.pendingUpload.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 50, // 防止一次拉太多
    select: {
      id: true,
      blobUrl: true,
      blobPathname: true,
      filename: true,
      contentType: true,
      // 老板手填的说明，Mac 端 BlobSync 写到 raw/_inbox/from_dashboard/<日期>/.notes.json
      // 让仓库员/管家归档时能读到（"这是 Q1 财务月报"等提示）
      description: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ pending });
}
