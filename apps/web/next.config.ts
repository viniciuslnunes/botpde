import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const rootDomain = process.env.ROOT_DOMAIN?.trim()
const serverActionOrigins = [
  '*.up.railway.app',
  ...(rootDomain ? [rootDomain, `*.${rootDomain}`] : []),
]

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@torcida/ui'],
    staleTimes: {
      dynamic: 120,
      static: 180,
    },
    serverActions: {
      // Origin (subdomínio público) vs Host interno do proxy — sem isso o POST
      // da Server Action é rejeitado antes de executar (parece “nada dispara”).
      allowedOrigins: serverActionOrigins,
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
      { protocol: 'https', hostname: 'maps.googleapis.com' },
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
