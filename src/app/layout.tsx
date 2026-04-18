import './globals.css';
import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: {
    default: 'LTY 旭珑 · 任务池',
    template: '%s · LTY 旭珑 · 任务池',
  },
  description: 'LTY 旭珑内部任务看板 · 发布 · 领取 · 完成 · 验收',
  appleWebApp: {
    title: 'LTY 旭珑',
    capable: true,
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#3a0a14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <Providers>
          <Nav />
          <main className="mx-auto max-w-6xl px-6 pb-20">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
