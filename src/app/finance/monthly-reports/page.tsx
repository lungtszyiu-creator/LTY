/**
 * /finance/monthly-reports → /finance/reports?cat=financial-monthly 重定向（兼容 PR #44 链接）
 *
 * 新综合页 /finance/reports 含 5 类：月报 / 财务季报 / 财务年报 / 运营季 / 运营年
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyMonthlyReportsRedirect() {
  redirect('/finance/reports?cat=financial-monthly');
}
