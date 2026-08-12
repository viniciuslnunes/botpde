import * as Sentry from '@sentry/nextjs'
import { installChunkSkewRecovery } from './lib/chunk-skew-recovery'
import { beforeSend } from './lib/sentry-filter'

// Inerte em dev — ver sentry.server.config.ts.
const dsn = process.env.NODE_ENV === 'development' ? undefined : process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  // DSN não é segredo (só permite enviar eventos, não lê-los) — mesma
  // variável é reaproveitada no client, server e edge config.
  dsn,
  // Sem tracesSampleRate: o tracing do client é removido em tempo de build por
  // `compiler.define.__SENTRY_TRACING__ = false` (next.config.ts) — custava
  // 26,5 KB gz em toda página. Erro/core continua, e o tracing do SERVIDOR
  // (sentry.server.config.ts) não é afetado. Ver ARCHITECTURE §5.6.2.
  debug: false,
  beforeSend,
})

// Version skew pós-deploy (Railway): chunk 404 → reload único com cooldown.
installChunkSkewRecovery()

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
