/**
 * 旧路径 redirect stub — 老板已把 /admin/ai-onboarding/api-trigger URL 转发给
 * 同事群，不能 404。整个页面已搬到 /dept/ai/onboarding/api-trigger
 * （PR 移到 AI 部 + 全员可见）。
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Page() {
  redirect('/dept/ai/onboarding/api-trigger');
}
