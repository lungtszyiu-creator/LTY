'use server';

/**
 * 行政部 server actions —— License + FixedAsset CRUD
 *
 * 都走 requireDeptEdit('admin') 权限（LEAD/SUPER_ADMIN）。
 * 删除收紧到 SUPER_ADMIN（同财务凭证 PR 28 的策略）。
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireDeptEdit } from '@/lib/dept-access';

// ===== License =====
const licenseSchema = z.object({
  type: z.enum(['BUSINESS_LICENSE', 'CONTRACT', 'QUALIFICATION', 'CERTIFICATE', 'OTHER']),
  name: z.string().min(1).max(200),
  identifier: z.string().max(200).optional().nullable(),
  issuedAt: z.string().optional().nullable(), // YYYY-MM-DD
  expireAt: z.string().optional().nullable(),
  responsibleId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

function deriveLicenseStatus(expireAt: Date | null): 'ACTIVE' | 'EXPIRING' | 'EXPIRED' {
  if (!expireAt) return 'ACTIVE';
  const now = Date.now();
  const t = expireAt.getTime();
  if (t < now) return 'EXPIRED';
  if (t - now < 30 * 24 * 60 * 60 * 1000) return 'EXPIRING';
  return 'ACTIVE';
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  if (!v || typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function createLicense(formData: FormData) {
  const ctx = await requireDeptEdit('admin');
  const parsed = licenseSchema.safeParse({
    type: formData.get('type'),
    name: formData.get('name'),
    identifier: formData.get('identifier') || null,
    issuedAt: formData.get('issuedAt') || null,
    expireAt: formData.get('expireAt') || null,
    responsibleId: formData.get('responsibleId') || null,
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) {
    throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const data = parsed.data;
  const expireAt = parseDate(data.expireAt ?? null);
  await prisma.adminLicense.create({
    data: {
      type: data.type,
      name: data.name,
      identifier: data.identifier?.trim() || null,
      issuedAt: parseDate(data.issuedAt ?? null),
      expireAt,
      status: deriveLicenseStatus(expireAt),
      responsibleId: data.responsibleId?.trim() || null,
      notes: data.notes?.trim() || null,
      createdById: ctx.userId,
    },
  });
  revalidatePath('/dept/admin');
  redirect('/dept/admin?tab=licenses');
}

export async function updateLicense(id: string, formData: FormData) {
  await requireDeptEdit('admin');
  const parsed = licenseSchema.safeParse({
    type: formData.get('type'),
    name: formData.get('name'),
    identifier: formData.get('identifier') || null,
    issuedAt: formData.get('issuedAt') || null,
    expireAt: formData.get('expireAt') || null,
    responsibleId: formData.get('responsibleId') || null,
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) {
    throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const data = parsed.data;
  const expireAt = parseDate(data.expireAt ?? null);
  const archive = formData.get('archive') === 'on';
  await prisma.adminLicense.update({
    where: { id },
    data: {
      type: data.type,
      name: data.name,
      identifier: data.identifier?.trim() || null,
      issuedAt: parseDate(data.issuedAt ?? null),
      expireAt,
      status: archive ? 'ARCHIVED' : deriveLicenseStatus(expireAt),
      responsibleId: data.responsibleId?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath('/dept/admin');
  revalidatePath(`/dept/admin/licenses/${id}`);
  redirect(`/dept/admin/licenses/${id}`);
}

export async function deleteLicense(id: string) {
  const ctx = await requireDeptEdit('admin');
  // 删除收紧到 SUPER_ADMIN：避免部门负责人误删历史证照
  if (!ctx.isSuperAdmin) {
    throw new Error('仅总管可永久删除证照');
  }
  await prisma.adminLicense.delete({ where: { id } });
  revalidatePath('/dept/admin');
  redirect('/dept/admin?tab=licenses');
}

// ===== FixedAsset =====
const assetSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['OFFICE_EQUIPMENT', 'FURNITURE', 'ELECTRONICS', 'OTHER']),
  location: z.string().max(200).optional().nullable(),
  purchasedAt: z.string().optional().nullable(),
  purchasePrice: z.string().optional().nullable(), // string -> Decimal
  currency: z.enum(['HKD', 'USD', 'CNY', 'USDT']).default('HKD'),
  status: z.enum(['IN_USE', 'IDLE', 'RETIRED', 'LOST']).default('IN_USE'),
  responsibleId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

async function generateAssetCode(purchasedAt: Date | null): Promise<string> {
  const d = purchasedAt ?? new Date();
  const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `FA-${yyyymm}-`;
  const last = await prisma.adminFixedAsset.findFirst({
    where: { assetCode: { startsWith: prefix } },
    orderBy: { assetCode: 'desc' },
    select: { assetCode: true },
  });
  const nextSeq = last?.assetCode
    ? parseInt(last.assetCode.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export async function createAsset(formData: FormData) {
  const ctx = await requireDeptEdit('admin');
  const parsed = assetSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category'),
    location: formData.get('location') || null,
    purchasedAt: formData.get('purchasedAt') || null,
    purchasePrice: formData.get('purchasePrice') || null,
    currency: formData.get('currency') || 'HKD',
    status: formData.get('status') || 'IN_USE',
    responsibleId: formData.get('responsibleId') || null,
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) {
    throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const d = parsed.data;
  const purchasedAt = parseDate(d.purchasedAt ?? null);
  const assetCode = await generateAssetCode(purchasedAt);
  await prisma.adminFixedAsset.create({
    data: {
      assetCode,
      name: d.name,
      category: d.category,
      location: d.location?.trim() || null,
      purchasedAt,
      purchasePrice: d.purchasePrice?.trim() ? d.purchasePrice : null,
      currency: d.currency,
      status: d.status,
      responsibleId: d.responsibleId?.trim() || null,
      notes: d.notes?.trim() || null,
      createdById: ctx.userId,
    },
  });
  revalidatePath('/dept/admin');
  redirect('/dept/admin?tab=assets');
}

export async function updateAsset(id: string, formData: FormData) {
  await requireDeptEdit('admin');
  const parsed = assetSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category'),
    location: formData.get('location') || null,
    purchasedAt: formData.get('purchasedAt') || null,
    purchasePrice: formData.get('purchasePrice') || null,
    currency: formData.get('currency') || 'HKD',
    status: formData.get('status') || 'IN_USE',
    responsibleId: formData.get('responsibleId') || null,
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) {
    throw new Error(`输入校验失败：${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const d = parsed.data;
  await prisma.adminFixedAsset.update({
    where: { id },
    data: {
      name: d.name,
      category: d.category,
      location: d.location?.trim() || null,
      purchasedAt: parseDate(d.purchasedAt ?? null),
      purchasePrice: d.purchasePrice?.trim() ? d.purchasePrice : null,
      currency: d.currency,
      status: d.status,
      responsibleId: d.responsibleId?.trim() || null,
      notes: d.notes?.trim() || null,
    },
  });
  revalidatePath('/dept/admin');
  revalidatePath(`/dept/admin/assets/${id}`);
  redirect(`/dept/admin/assets/${id}`);
}

export async function deleteAsset(id: string) {
  const ctx = await requireDeptEdit('admin');
  if (!ctx.isSuperAdmin) {
    throw new Error('仅总管可永久删除资产');
  }
  await prisma.adminFixedAsset.delete({ where: { id } });
  revalidatePath('/dept/admin');
  redirect('/dept/admin?tab=assets');
}
