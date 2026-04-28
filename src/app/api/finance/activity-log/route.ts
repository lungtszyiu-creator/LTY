/**
 * AI 活动流 API（看板"今日活动"用）
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/permissions';
import { getRecentAiActivity } from '@/lib/ai-log';

export async function GET(req: NextRequest) {
  await requireUser(); // 仅登录用户能看活动流（不开放给 AI）

  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '50');
  const activities = await getRecentAiActivity(Math.min(limit, 200));

  return NextResponse.json({ activities });
}
