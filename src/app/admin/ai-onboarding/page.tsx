/**
 * 旧路径 redirect stub — 老板已把 /admin/ai-onboarding URL 转发给同事群，
 * 不能 404。整个页面已搬到 /dept/ai/onboarding（PR 移到 AI 部 + 全员可见）。
 *
 * 这里 server-side redirect 一下，浏览器书签 / 转发链接都自动跳到新位置。
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Page() {
  redirect('/dept/ai/onboarding');
}
