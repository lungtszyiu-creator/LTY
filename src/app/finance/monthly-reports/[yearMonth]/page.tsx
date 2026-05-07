/**
 * /finance/monthly-reports/[yearMonth] → /finance/reports/financial-monthly/[yearMonth] 重定向
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LegacyMonthlyReportDetailRedirect({
  params,
}: {
  params: Promise<{ yearMonth: string }>;
}) {
  const { yearMonth } = await params;
  redirect(`/finance/reports/financial-monthly/${yearMonth}`);
}
