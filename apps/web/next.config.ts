import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

// Skew protection: após deploy no Railway, cliente com tab antiga força hard
// reload em vez de pedir chunk/hash que já não existe (ChunkLoadError 404).
// RAILWAY_GIT_COMMIT_SHA vem no build e no runtime do mesmo deploy.
const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID?.trim() ||
  process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
  process.env.RAILWAY_DEPLOYMENT_ID?.trim() ||
  undefined

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../..')

function readRootPackageVersion(): string {
  try {
    const raw = readFileSync(join(repoRoot, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { version?: string }
    return pkg.version?.trim() || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** 1.<commits_main>.<commits_totais> — ver scripts/lib/version-from-git.mjs */
function versionFromGitOrPackage(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION?.trim()
  if (fromEnv) return fromEnv

  try {
    const mainRef = (() => {
      for (const ref of ['origin/main', 'main'] as const) {
        try {
          execSync(`git rev-parse --verify ${ref}`, {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'ignore'],
          })
          return ref
        } catch {
          /* next */
        }
      }
      return 'HEAD'
    })()
    const count = (args: string) => {
      const out = execSync(`git rev-list --count ${args}`, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      return Number.parseInt(out, 10)
    }
    const minor = count(mainRef)
    let patch = count('--all')
    if (!Number.isFinite(patch) || patch < minor) patch = minor
    if (Number.isFinite(minor) && Number.isFinite(patch)) {
      return `1.${minor}.${patch}`
    }
  } catch {
    // sem .git no build → package.json
  }
  return readRootPackageVersion()
}

const appVersion = versionFromGitOrPackage()
const appCommit =
  process.env.NEXT_PUBLIC_APP_COMMIT?.trim() ||
  process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
  (process.env.NODE_ENV === 'production' ? 'unknown' : 'dev')
const appPublishedAt =
  process.env.NEXT_PUBLIC_APP_PUBLISHED_AT?.trim() || new Date().toISOString()
const appRepo =
  process.env.NEXT_PUBLIC_APP_REPO?.trim() ||
  process.env.GITHUB_REPOSITORY?.trim() ||
  'viniciuslnunes/botpde'

const nextConfig: NextConfig = {
  ...(deploymentId ? { deploymentId } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_APP_COMMIT: appCommit,
    NEXT_PUBLIC_APP_PUBLISHED_AT: appPublishedAt,
    NEXT_PUBLIC_APP_REPO: appRepo,
  },
  compiler: {
    // Tree-shaking do Sentry. O `webpack.treeshake` de withSentryConfig só roda
    // no caminho webpack (setupTreeshakingFromConfig) e o build é Turbopack —
    // lá aquilo é no-op. Aqui as flags viram literal em tempo de compilação e o
    // guard `typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__`
    // (@sentry/nextjs client/index.js) cai como código morto.
    define: {
      __SENTRY_TRACING__: false,
      __SENTRY_DEBUG__: false,
    },
  },
  experimental: {
    // Sem @torcida/ui: optimizePackageImports no barrel quebra o singleton do Sonner
    // (toast() e <Toaster /> em grafos distintos → toasts silenciosos).
    // Sem @torcida/types: medido, não tem efeito — optimizePackageImports não
    // reescreve barrel de `export *`. O corte ali é subpath export
    // (@torcida/types/design) no import, não flag. Ver packages/types/package.json.
    optimizePackageImports: ['lucide-react'],
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
  // CDN (Cloudflare Free): origin respeitado na edge — ver docs/ops/cloudflare-cdn.md
  // Em dev, Cache-Control immutable em /_next/static quebra HMR do Turbopack
  // (chunks stale → "module factory is not available"). Só em produção.
  async headers() {
    if (process.env.NODE_ENV !== 'production') return []
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/stickers/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ]
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Next 16 só otimiza as qualidades declaradas; 90 é usado nos avatares.
    qualities: [75, 90],
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
