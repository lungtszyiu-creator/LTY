import type { MetadataRoute } from 'next';

// Next.js 约定文件：app/manifest.ts 自动暴露成 /manifest.webmanifest，
// 优先级高于 public/manifest.json 和 metadata.manifest 字段。
//
// icons 必须用预带酒红渐变底的 PNG（脚本：scripts/build-app-icons.sh），
// 因为 iOS / Android 主屏幕都不支持透明背景（会自动填白）。
// 历史教训：之前用 /logo.png（透明）当 icon，iOS 桌面变成"白底纯金 logo"。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LTY 旭珑 · 公司总看板',
    short_name: 'LTY 旭珑',
    description: 'LTY 旭珑公司总看板',
    start_url: '/',
    display: 'standalone',
    background_color: '#1a0f0a',
    theme_color: '#3a0a14',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
