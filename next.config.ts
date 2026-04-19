import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @opennextjs/cloudflare は standalone 不要
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
