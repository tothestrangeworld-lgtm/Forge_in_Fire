import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '百錬自得 | 剣道稽古記録',
    short_name: '百錬自得',
    description: '剣道の稽古を記録し、成長を可視化する稽古管理アプリ',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f0e1a',
    theme_color: '#1e1b4b',
    categories: ['sports', 'health', 'lifestyle'],
    lang: 'ja',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    screenshots: [],
  };
}
