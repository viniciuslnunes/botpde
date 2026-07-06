import * as Sentry from '@sentry/nextjs'

Sentry.init({
  // DSN não é segredo (só permite enviar eventos, não lê-los) — mesma
  // variável é reaproveitada no client, server e edge config.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
