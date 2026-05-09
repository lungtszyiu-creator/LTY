/**
 * 旧路径 redirect stub — AI 平台月订阅已搬到 /dept/ai/subscriptions
 * （老板 5/10 决策：订阅当作 AI 部范畴 + 全员可填，不再放财务）。
 *
 * 留这个 stub 让以前的书签 / 转发链接不 404。
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Page() {
  redirect('/dept/ai/subscriptions');
}
