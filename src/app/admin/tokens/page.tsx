/**
 * /admin/tokens — 已搬到 /overview「AI 总览」
 *
 * 老板在 PR #55 把 AI Token 监控合并进 /overview AI 总览统一入口。
 * 这里保留 308 redirect 让旧 URL（书签 / 外部链接 / 邮件提醒里的）还能跳。
 *
 * 保 query string（如 ?range=7d）直传过去。
 */
import { redirect } from 'next/navigation';

export default async function TokensRedirect({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const target = sp.range ? `/overview?range=${encodeURIComponent(sp.range)}` : '/overview';
  redirect(target);
}
