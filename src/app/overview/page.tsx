/**
 * /overview — 已搬到 /dept/ai 全员可见
 *
 * 老板决策：AI 总览公开给全公司（透明文化），不再仅 SUPER_ADMIN。
 * 新位置 /dept/ai 跟其他部门并列在 Department 体系下。
 *
 * 这里 308 redirect 让旧 URL（书签 / 邮件 / 文档）还能跳。
 * 保 query string（如 ?range=7d）直传过去。
 */
import { redirect } from 'next/navigation';

export default async function OverviewRedirect({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const target = sp.range ? `/dept/ai?range=${encodeURIComponent(sp.range)}` : '/dept/ai';
  redirect(target);
}
