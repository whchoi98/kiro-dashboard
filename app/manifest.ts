import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kiro Dashboard',
    short_name: 'Kiro',
    description: 'Kiro IDE 사용자 분석 대시보드',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      // Same full-bleed asset serves both purposes: largest 'any' icon feeds
      // Android splash/install surfaces; 'maskable' feeds adaptive masks.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
