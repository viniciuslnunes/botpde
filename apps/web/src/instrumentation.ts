import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Antes de qualquer fetch HTTPS (imagem otimizada, Sentry, etc.).
    const { applySystemCaCertificates } = await import('./lib/system-ca')
    applySystemCaCertificates()
    await import('../sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
