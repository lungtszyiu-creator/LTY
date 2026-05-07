'use client';

/**
 * 通用 confirm 包装：客户端 onSubmit 弹 confirm，取消则阻止 form action。
 * 用于删除按钮 —— server action 删除是不可逆的，必须前端拦一下。
 */
import { type ReactNode } from 'react';

export function ConfirmDeleteForm({
  action,
  message,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  message: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
