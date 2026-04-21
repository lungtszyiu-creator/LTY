'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmtDateTime } from '@/lib/datetime';

type UserOpt = { id: string; name: string | null; email: string };
type Initial = {
  contentDone: string;
  contentPlan: string;
  contentBlockers: string;
  contentAsks: string;
  reportToId: string;
  reportToName: string | null;
  submitted: boolean;
  submittedAt?: string | null;
  status?: 'PENDING' | 'SUBMITTED' | 'LATE' | null;
};

const SECTIONS = [
  { key: 'contentDone',     label: '本期完成',  placeholder: '例：推进 AI 客服上线，解决用户反馈 23 条，培训新人 2 名…' },
  { key: 'contentPlan',     label: '下期计划',  placeholder: '例：接入 WhatsApp 渠道、完成 Q2 考核、发布培训手册 v2…' },
  { key: 'contentBlockers', label: '遇到问题',  placeholder: '例：第三方 API 限流、人手不足、与 X 部门协作卡点…' },
  { key: 'contentAsks',     label: '需要支持',  placeholder: '例：请财务加快 Q1 报销、请 HR 协助启动招聘…' },
] as const;

export default function ReportEditor({
  type,
  initial,
  users,
}: {
  type: 'WEEKLY' | 'MONTHLY';
  initial: Initial;
  users: UserOpt[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(initial.submitted);
  // Submitted reports render as read-only by default — cuts the "为什么还在
  // 显示旧内容" confusion. User clicks 修改 to re-enter edit mode.
  const [editMode, setEditMode] = useState(!initial.submitted);

  async function save(submit: boolean) {
    if (submit && !fields.contentDone.trim()) {
      setErr('提交前请至少写"本期完成"');
      return;
    }
    if (submit && !fields.reportToId) {
      setErr('提交前请选择"汇报对象"');
      return;
    }
    setBusy(submit ? 'submit' : 'save'); setErr(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          contentDone: fields.contentDone || null,
          contentPlan: fields.contentPlan || null,
          contentBlockers: fields.contentBlockers || null,
          contentAsks: fields.contentAsks || null,
          reportToId: fields.reportToId || null,
          submit,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '保存失败');
      const r = await res.json();
      if (r.submittedAt) {
        setSubmitted(true);
        setEditMode(false);
      }
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  function resetAndEdit() {
    setFields({
      contentDone: '',
      contentPlan: '',
      contentBlockers: '',
      contentAsks: '',
      reportToId: initial.reportToId,
      reportToName: initial.reportToName,
      submitted: false,
    });
    setSubmitted(false);
    setEditMode(true);
  }

  // Read-only display for a submitted report.
  if (submitted && !editMode) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-emerald-800">
                {fields.status === 'LATE' ? '⏰ 已逾期提交' : '✓ 已提交'}
              </span>
              {fields.submittedAt && (
                <span className="ml-2 text-xs text-emerald-700">
                  {fmtDateTime(fields.submittedAt)}
                </span>
              )}
              {fields.reportToName && (
                <span className="ml-2 text-xs text-emerald-700">· 汇报给 {fields.reportToName}</span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditMode(true)} className="btn btn-ghost text-xs">
                ✏️ 修改本期汇报
              </button>
              <button onClick={resetAndEdit} className="btn btn-ghost text-xs text-slate-500">
                🗑 清空重写
              </button>
            </div>
          </div>
        </div>

        {SECTIONS.map((s) => {
          const val = (fields as any)[s.key] as string;
          if (!val || !val.trim()) {
            return (
              <div key={s.key} className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-500">{s.label}</div>
                <div className="mt-1 text-xs text-slate-400">（未填写）</div>
              </div>
            );
          }
          return (
            <div key={s.key} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                {s.label}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{val}</div>
            </div>
          );
        })}
      </div>
    );
  }

  // Editable form.
  return (
    <div className="space-y-4">
      {submitted && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠️ 你正在修改已提交的 {type === 'WEEKLY' ? '周报' : '月报'}。保存后将覆盖原版本。
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-800">
          汇报对象 <span className="text-rose-500">*</span>
        </label>
        <select
          value={fields.reportToId}
          onChange={(e) => {
            const u = users.find((x) => x.id === e.target.value);
            setFields({ ...fields, reportToId: e.target.value, reportToName: u?.name ?? u?.email ?? null });
          }}
          className="select"
        >
          <option value="">—— 请选择汇报给谁 ——</option>
          {users.map((u) => (<option key={u.id} value={u.id}>{u.name ?? u.email}</option>))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          提交后对方会收到邮件提醒，且能在"汇报给我的"看到本次汇报。
        </p>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.key}>
          <label className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-800">{s.label}</span>
            <span className="text-xs text-slate-400">{(fields as any)[s.key].length}/5000</span>
          </label>
          <textarea
            value={(fields as any)[s.key]}
            onChange={(e) => setFields({ ...fields, [s.key]: e.target.value.slice(0, 5000) })}
            rows={s.key === 'contentDone' || s.key === 'contentPlan' ? 4 : 3}
            placeholder={s.placeholder}
            className="textarea"
          />
        </div>
      ))}

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {submitted && (
          <button onClick={() => setEditMode(false)} className="mr-auto btn btn-ghost text-xs text-slate-500">
            取消修改
          </button>
        )}
        <button onClick={() => save(false)} disabled={busy !== null} className="btn btn-ghost">
          {busy === 'save' ? '保存中…' : '保存草稿'}
        </button>
        <button onClick={() => save(true)} disabled={busy !== null} className="btn btn-primary">
          {busy === 'submit' ? '提交中…' : (submitted ? '确认修改并提交' : '提交')}
        </button>
      </div>
    </div>
  );
}
