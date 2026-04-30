import './globals.css';
import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';
import Nav from '@/components/Nav';
import { FONT_SCALE_ZOOM } from '@/lib/font-scale';
import { getFontScale } from '@/lib/font-scale.server';

export const metadata: Metadata = {
  title: {
    default: 'LTY 旭珑 · 公司总看板',
    template: '%s · LTY 旭珑 · 公司总看板',
  },
  description: 'LTY 旭珑公司总看板 · 任务 · 审批 · 公告 · 汇报 · 文件 · 项目',
  // PWA: linked manifest + icons. iOS picks up apple-touch-icon for the
  // home-screen tile; Android uses the manifest's icon array.
  manifest: '/manifest.json',
  icons: {
    // 浏览器 tab favicon —— 透明背景的纯 logo 在浏览器深/浅主题下都贴合
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/icon-512.png',
    // iOS 主屏幕 / "添加到主屏幕" —— iOS 不支持透明 icon（会自动填白底），
    // 必须用预带酒红渐变底的预渲染图，否则桌面图标会变成白底纯金色 logo
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    title: 'LTY 旭珑',
    capable: true,
    // 'default' lets iOS reserve space for the status bar instead of rendering
    // the page under it. 'black-translucent' caused the nav to sit under the
    // time/battery and be untappable in PWA mode.
    statusBarStyle: 'default',
    // iOS splash: 用酒红底版本，保持品牌视觉一致
    startupImage: [{ url: '/icon-512.png' }],
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
  // 读 cookie 设全局 zoom —— 等比缩放整个文档（含硬编码 px），无 FOUC
  const fontScale = getFontScale();
  const zoom = FONT_SCALE_ZOOM[fontScale];
  return (
    <html lang="zh-CN" style={{ zoom }}>
      <body className="min-h-screen">
        <Providers>
          <Nav fontScale={fontScale} />
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
