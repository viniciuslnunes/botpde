import type { ErrorEvent, EventHint } from '@sentry/nextjs'
import { isChunkLoadError } from './chunk-skew-recovery'
import { isExpectedError } from './expected-error'

/**
 * `beforeSend` do Sentry: descarta erros ESPERADOS (`ExpectedError`) —
 * validação Zod / regra de negócio já tratada na UI (toast/form). Não são bugs
 * e só geram ruído. Filtra por `name === 'ExpectedError'`, que também funciona
 * quando o erro chega serializado do servidor (via `onRequestError`), caso em
 * que `hint.originalException` não é a instância original.
 *
 * Também descarta `ChunkLoadError` (version skew pós-deploy) — recuperado via
 * reload em `instrumentation-client`.
 */
export function beforeSend(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isExpectedError(hint?.originalException)) return null
  if (isChunkLoadError(hint?.originalException)) return null
  if (
    event.exception?.values?.some(
      (v) =>
        v.type === 'ExpectedError' ||
        v.type === 'ChunkLoadError' ||
        (typeof v.value === 'string' && isChunkLoadError(v.value)),
    )
  ) {
    return null
  }
  return event
}
