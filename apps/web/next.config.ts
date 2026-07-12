import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@torcida/ui'],
    staleTimes: {
      dynamic: 120,
      static: 180,
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Stickers locais — Next 16 exige localPatterns explícito para assets em public/.
    localPatterns: [{ pathname: '/stickers/**' }],
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'gavioes.jetassets.com.br' },
      { protocol: 'https', hostname: 'www.lojagavioes.com.br' },
    ],
  },
}

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: 'devinicius',
  project: 'torcida-web',

  // Upload de sourcemaps só roda se SENTRY_AUTH_TOKEN estiver definido
  // (não está no CI hoje) — sem o token, essa etapa é pulada silenciosamente.
  silent: !process.env.CI,
  widenClientFileUpload: true,

  webpack: {
    // Deploy é Railway, não Vercel — desliga integração automática de cron
    // monitors específica da Vercel.
    automaticVercelMonitors: false,
    treeshake: { removeDebugLogging: true },
  },
})
