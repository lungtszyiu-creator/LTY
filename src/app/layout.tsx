import './globals.css';
import type { Metadata } from 'next';
import Providers from '@/components/Providers';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: '任务池',
  description: '任务发布与领取看板',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <Nav />
          <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
