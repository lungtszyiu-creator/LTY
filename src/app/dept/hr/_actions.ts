'use server';

/**
 * HR 部 server actions
 *
 * 三套 CRUD：员工档案 / 岗位 / 候选人。删除统一收紧到 SUPER_ADMIN（同财务凭证策略）。
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireDeptEdit } from '@/lib/dept-access';

function parseDate(v: FormDataEntryValue | null): Date | null {
  if (!v || typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ===== 员工档案 =====
const profileSchema = z.object({
  userId: z.string().min(1),
  department: z.string().max(100).optional().nullable(),
  positionTitle: z.string().max(100).optional().nullable(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR']).default('FULL_TIME'),
  workLocation: z.enum(['ONSITE', 'REMOTE']).default('ONSITE'),
  hireDate: z.string().optional().nullable(),
  probationEnd: z.string().optional().nullable(),
  contractEnd: z.string().optional().nullable(),
  idType: z.enum(['ID_CARD', 'PASSPORT', 'WORK_PERMIT']).optional().nullable(),
  idNumber: z.string().max(64).optional().nullable(),
  idExpireAt: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'PROBATION', 'RESIGNED']).default('ACTIVE'),
  notes: z.string().max(2000).optional().nullable(),
});

function parseProfileForm(formData: FormData) {
  return {
    userId: formData.get('userId'),
    department: formData.get('department') || null,
    positionTitle: formData.get('positionTitle') || null,
    employmentType: formData.get('employmentType') || 'FULL_TIME',
    workLocation: formData.get('workLocation') || 'ONSITE',
    hireDate: formData.get('hireDate') || null,
    probationEnd: formData.get('probationEnd') || null,
    contractEnd: formData.get('contractEnd') || null,
    idType: formData.get('idType') || null,
    idNumber: formData.get('idNumber') || null,
    idExpireAt: formData.get('idExpireAt') || null,
    status: formData.get('status') || 'ACTIVE',
    notes: formData.get('notes') || null,
  };
}

export async function createHrEmployeeProfile(formData: FormData) {
  await requireDeptEdit('hr');
  const parsed = profileSchema.safeParse(parseProfileForm(formData));
  if (!parsed.success) throw new Error(`输入校验失败：${parsed.error.issues[0]?.message}`);
  const d = parsed.data;
  await prisma.hrEmployeeProfile.create({
    data: {
      userId: d.userId,
      department: d.department?.toString().trim() || null,
      positionTitle: d.positionTitle?.toString().trim() || null,
      employmentType: d.employmentType,
      workLocation: d.workLocation,
      hireDate: parseDate(d.hireDate ?? null),
      probationEnd: parseDate(d.probationEnd ?? null),
      contractEnd: parseDate(d.contractEnd ?? null),
      idType: d.idType || null,
      idNumber: d.idNumber?.toString().trim() || null,
      idExpireAt: parseDate(d.idExpireAt ?? null),
      status: d.status,
      notes: d.notes?.toString().trim() || null,
    },
  });
  revalidatePath('/dept/hr');
  revalidatePath('/dept/hr/employees');
  redirect('/dept/hr/employees');
}

export async function updateHrEmployeeProfile(id: string, formData: FormData) {
  await requireDeptEdit('hr');
  const parsed = profileSchema.safeParse(parseProfileForm(formData));
  if (!parsed.success) throw new Error(`输入校验失败：${parsed.error.issues[0]?.message}`);
  const d = parsed.data;
  await prisma.hrEmployeeProfile.update({
    where: { id },
    data: {
      department: d.department?.toString().trim() || null,
      positionTitle: d.positionTitle?.toString().trim() || null,
      employmentType: d.employmentType,
      workLocation: d.workLocation,
      hireDate: parseDate(d.hireDate ?? null),
      probationEnd: parseDate(d.probationEnd ?? null),
      contractEnd: parseDate(d.contractEnd ?? null),
      idType: d.idType || null,
      idNumber: d.idNumber?.toString().trim() || null,
      idExpireAt: parseDate(d.idExpireAt ?? null),
      status: d.status,
      resignedAt: d.status === 'RESIGNED' ? new Date() : null,
      notes: d.notes?.toString().trim() || null,
    },
  });
  revalidatePath('/dept/hr');
  revalidatePath(`/dept/hr/employees/${id}`);
  redirect(`/dept/hr/employees/${id}`);
}

export async function deleteHrEmployeeProfile(id: string) {
  const ctx = await requireDeptEdit('hr');
  if (!ctx.isSuperAdmin) throw new Error('仅总管可永久删除员工档案');
  await prisma.hrEmployeeProfile.delete({ where: { id } });
  revalidatePath('/dept/hr');
  redirect('/dept/hr/employees');
}

// ===== 岗位 =====
const positionSchema = z.object({
  title: z.string().min(1).max(200),
  department: z.string().max(100).optional().nullable(),
  status: z.enum(['RECRUITING', 'PAUSED', 'CLOSED']).default('RECRUITING'),
  headcount: z.coerce.number().int().min(1).default(1),
  description: z.string().max(2000).optional().nullable(),
  deadline: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createHrPosition(formData: FormData) {
  await requireDeptEdit('hr');
  const parsed = positionSchema.safeParse({
    title: formData.get('title'),
    department: formData.get('department') || null,
    status: formData.get('status') || 'RECRUITING',
    headcount: formData.get('headcount') || 1,
    description: formData.get('description') || null,
    deadline: formData.get('deadline') || null,
    leadId: formData.get('leadId') || null,
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) throw new Error(`输入校验失败：${parsed.error.issues[0]?.message}`);
  const d = parsed.data;
  await prisma.hrPosition.create({
    data: {
      title: d.title,
      department: d.department?.toString().trim() || null,
      status: d.status,
      headcount: d.headcount,
      description: d.description?.toString().trim() || null,
      deadline: parseDate(d.deadline ?? null),
      leadId: d.leadId?.toString().trim() || null,
      notes: d.notes?.toString().trim() || null,
    },
  });
  revalidatePath('/dept/hr');
  revalidatePath('/dept/hr/positions');
  redirect('/dept/hr/positions');
}

export async function deleteHrPosition(id: string) {
  const ctx = await requireDeptEdit('hr');
  if (!ctx.isSuperAdmin) throw new Error('仅总管可永久删除岗位');
  await prisma.hrPosition.delete({ where: { id } });
  revalidatePath('/dept/hr');
  redirect('/dept/hr/positions');
}

// ===== 候选人 =====
const candidateSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  positionId: z.string().optional().nullable(),
  stage: z
    .enum(['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'HIRED', 'REJECTED'])
    .default('APPLIED'),
  resumeUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createHrCandidate(formData: FormData) {
  const ctx = await requireDeptEdit('hr');
  const parsed = candidateSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone') || null,
    email: formData.get('email') || null,
    positionId: formData.get('positionId') || null,
    stage: formData.get('stage') || 'APPLIED',
    resumeUrl: formData.get('resumeUrl') || null,
    notes: formData.get('notes') || null,
  });
  if (!parsed.success) throw new Error(`输入校验失败：${parsed.error.issues[0]?.message}`);
  const d = parsed.data;
  await prisma.hrCandidate.create({
    data: {
      name: d.name,
      phone: d.phone?.toString().trim() || null,
      email: d.email?.toString().trim() || null,
      positionId: d.positionId?.toString().trim() || null,
      stage: d.stage,
      resumeUrl: d.resumeUrl?.toString().trim() || null,
      notes: d.notes?.toString().trim() || null,
      createdById: ctx.userId,
    },
  });
  revalidatePath('/dept/hr');
  revalidatePath('/dept/hr/candidates');
  redirect('/dept/hr/candidates');
}

export async function updateHrCandidateStage(id: string, formData: FormData) {
  await requireDeptEdit('hr');
  const stage = formData.get('stage');
  const allowed = ['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'HIRED', 'REJECTED'];
  if (typeof stage !== 'string' || !allowed.includes(stage)) {
    throw new Error('非法 stage 值');
  }
  await prisma.hrCandidate.update({
    where: { id },
    data: { stage, notes: formData.get('notes')?.toString() || undefined },
  });
  revalidatePath('/dept/hr');
  revalidatePath('/dept/hr/candidates');
}

export async function deleteHrCandidate(id: string) {
  const ctx = await requireDeptEdit('hr');
  if (!ctx.isSuperAdmin) throw new Error('仅总管可永久删除候选人');
  await prisma.hrCandidate.delete({ where: { id } });
  revalidatePath('/dept/hr');
  redirect('/dept/hr/candidates');
}
