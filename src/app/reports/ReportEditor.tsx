'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Initial = {
  contentDone: string;
  contentPlan: string;
  contentBlockers: string;
  contentAsks: string;
  submitted: boolean;
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
}: {
  type: 'WEEKLY' | 'MONTHLY';
  initial: Initial;
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(initial.submitted);

  async function save(submit: boolean) {
    if (submit && !fields.contentDone.trim()) {
      setErr('提交前请至少写"本期完成"');
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
          submit,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '保存失败');
      const r = await res.json();
      if (r.submittedAt) setSubmitted(true);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
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
        {submitted && <span className="mr-auto text-xs text-emerald-700">✓ 已提交，后续修改会保留但状态不变</span>}
        <button onClick={() => save(false)} disabled={busy !== null} className="btn btn-ghost">
          {busy === 'save' ? '保存中…' : '保存草稿'}
        </button>
        <button onClick={() => save(true)} disabled={busy !== null} className="btn btn-primary">
          {busy === 'submit' ? '提交中…' : (submitted ? '重新提交' : '提交')}
        </button>
      </div>
    </div>
  );
}
