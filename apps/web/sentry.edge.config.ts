import * as Sentry from '@sentry/nextjs'
import { beforeSend } from './src/lib/sentry-filter'

// Ver sentry.server.config.ts — inerte em dev.
const dsn = process.env.NODE_ENV === 'development' ? undefined : process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  tracesSampleRate: 0.1,
  debug: false,
  beforeSend,
})
