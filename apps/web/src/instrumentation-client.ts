import * as Sentry from '@sentry/nextjs'
import { installChunkSkewRecovery } from './lib/chunk-skew-recovery'
import { beforeSend } from './lib/sentry-filter'

// Inerte em dev — ver sentry.server.config.ts.
const dsn = process.env.NODE_ENV === 'development' ? undefined : process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  // DSN não é segredo (só permite enviar eventos, não lê-los) — mesma
  // variável é reaproveitada no client, server e edge config.
  dsn,
  tracesSampleRate: 0.1,
  debug: false,
  beforeSend,
})

// Version skew pós-deploy (Railway): chunk 404 → reload único com cooldown.
installChunkSkewRecovery()

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
