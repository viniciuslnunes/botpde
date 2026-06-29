import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',

  images: {
    remotePatterns: [
      // Discord avatars
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      // Google avatars
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
}

export default nextConfig
