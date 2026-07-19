import * as Sentry from '@sentry/nextjs'
import { beforeSend } from './src/lib/sentry-filter'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  beforeSend,
})
