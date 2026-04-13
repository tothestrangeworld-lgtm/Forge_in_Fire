import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cloudflare Pages (Edge Runtime)
  output: 'standalone',

  // 画像最適化を無効化（Cloudflare Pages ではデフォルトで不要）
  images: {
    unoptimized: true,
  },

  // 実験的機能
  experimental: {
    // App Router は Next.js 13.4+ でデフォルト有効
  },
};

export default nextConfig;
