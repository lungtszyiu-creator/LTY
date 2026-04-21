import type { MetadataRoute } from 'next';

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
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
