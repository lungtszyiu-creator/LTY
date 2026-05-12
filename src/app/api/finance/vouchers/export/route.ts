/**
 * 凭证 CSV 导出 (/api/finance/vouchers/export)
 *
 * GET 同 /api/finance/vouchers 的过滤参数（status / from / to / limit），
 * 返回 UTF-8 BOM CSV，Excel 直接打开不乱码。
 *
 * 老板/出纳实时对账用 — 任何时刻都能下载当下 DB 真实数据，不用等月报。
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFinanceViewSession } from '@/lib/finance-access';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  AI_DRAFT: '草稿',
  BOSS_REVIEWING: '审核中',
  POSTED: '已过账',
  REJECTED: '已驳回',
  VOIDED: '作废',
};

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const auth = await requireFinanceViewSession();
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status'); // ALL or specific
  const from = sp.get('from'); // YYYY-MM-DD
  const to = sp.get('to');
  const dim = sp.get('dim') === 'created' ? 'created' : 'date'; // 维度：业务日(date) / 入账日(created)
  const q = (sp.get('q') ?? '').trim();
  const limit = Math.min(Number(sp.get('limit') ?? '5000'), 10000);

  type DateFilter = { gte?: Date; lt?: Date };
  const where: {
    status?: string;
    date?: DateFilter;
    createdAt?: DateFilter;
    OR?: Array<{ summary?: { contains: string; mode: 'insensitive' }; debitAccount?: { contains: string; mode: 'insensitive' }; creditAccount?: { contains: string; mode: 'insensitive' } }>;
  } = {};
  if (status && status !== 'ALL') where.status = status;
  if (from || to) {
    const d: DateFilter = {};
    if (from) d.gte = new Date(from + 'T00:00:00.000Z');
    if (to) {
      // to 是闭区间含当天，所以要加一天
      const t = new Date(to + 'T00:00:00.000Z');
      t.setUTCDate(t.getUTCDate() + 1);
      d.lt = t;
    }
    if (dim === 'created') where.createdAt = d;
    else where.date = d;
  }
  if (q) {
    where.OR = [
      { summary: { contains: q, mode: 'insensitive' } },
      { debitAccount: { contains: q, mode: 'insensitive' } },
      { creditAccount: { contains: q, mode: 'insensitive' } },
    ];
  }

  const vouchers = await prisma.voucher.findMany({
    where,
    take: limit,
    orderBy: dim === 'created' ? { createdAt: 'asc' } : { date: 'asc' },
    include: {
      createdBy: { select: { name: true } },
      postedBy: { select: { name: true } },
    },
  });

  const headers = [
    '凭证号',
    '日期',
    '摘要',
    '借方科目',
    '贷方科目',
    '金额',
    '币种',
    '状态',
    '创建者',
    '过账人',
    '过账时间',
    '关联交易',
    '备注',
    '创建时间',
    '看板链接',
  ];

  const rows = vouchers.map((v) => {
    const txIds = (() => {
      if (!v.relatedTxIds) return '';
      try {
        const arr = JSON.parse(v.relatedTxIds);
        return Array.isArray(arr) ? arr.join(' | ') : String(v.relatedTxIds);
      } catch {
        return String(v.relatedTxIds);
      }
    })();
    return [
      v.voucherNumber ?? '',
      v.date.toISOString().slice(0, 10),
      v.summary,
      v.debitAccount,
      v.creditAccount,
      v.amount.toString(),
      v.currency,
      STATUS_LABEL[v.status] ?? v.status,
      v.createdByAi ? `AI · ${v.createdByAi}` : v.createdBy?.name ?? '',
      v.postedBy?.name ?? '',
      v.postedAt ? v.postedAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      txIds,
      (v.notes ?? '').replace(/\r?\n/g, ' / '),
      v.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      `https://lty-nu.vercel.app/finance/vouchers/${v.id}`,
    ];
  });

  const lines = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  // Excel 友好：UTF-8 BOM
  const body = '﻿' + lines + '\r\n';

  const today = new Date().toISOString().slice(0, 10);
  const rangeTag =
    from || to
      ? `_${from ?? 'all'}_${to ?? today}`
      : `_${today}`;
  const statusTag = status && status !== 'ALL' ? `_${status}` : '';
  const filename = `LTY凭证${rangeTag}${statusTag}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
