import * as Sentry from '@sentry/nextjs'
import { beforeSend } from './src/lib/sentry-filter'

// DSN vazio em dev = Sentry inerte: sem instrumentar cada request nem mandar
// trace pela internet. Erro local aparece no terminal, não no Sentry de
// produção — e o dev deixa de pagar overhead por request.
const dsn = process.env.NODE_ENV === 'development' ? undefined : process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  tracesSampleRate: 0.1,
  debug: false,
  beforeSend,
})
