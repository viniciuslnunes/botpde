import * as Sentry from '@sentry/nextjs'
import { installChunkSkewRecovery } from './lib/chunk-skew-recovery'
import { beforeSend } from './lib/sentry-filter'

Sentry.init({
  // DSN não é segredo (só permite enviar eventos, não lê-los) — mesma
  // variável é reaproveitada no client, server e edge config.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  beforeSend,
})

// Version skew pós-deploy (Railway): chunk 404 → reload único com cooldown.
installChunkSkewRecovery()

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
