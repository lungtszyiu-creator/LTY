import './globals.css';
import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: {
    default: 'LTY 旭珑 · 公司总看板',
    template: '%s · LTY 旭珑 · 公司总看板',
  },
  description: 'LTY 旭珑公司总看板 · 任务 · 审批 · 公告 · 汇报 · 文件 · 项目',
  appleWebApp: {
    title: 'LTY 旭珑',
    capable: true,
    // 'default' lets iOS reserve space for the status bar instead of rendering
    // the page under it. 'black-translucent' caused the nav to sit under the
    // time/battery and be untappable in PWA mode.
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#3a0a14',
  // Explicit viewport so iOS Safari doesn't apply its own scaling (which can
  // make the dashboard appear "cut off" and unscrollable on smaller phones).
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <Providers>
          <Nav />
          <main
            className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6"
            style={{ paddingBottom: 'max(6rem, env(safe-area-inset-bottom))' }}
          >
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
