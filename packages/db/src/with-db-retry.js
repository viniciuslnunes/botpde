/**
 * Retry com backoff exponencial para perda de conexão com o Postgres
 * (blips do proxy Railway: P1001 "Can't reach database server", P1017
 * "Server has closed the connection", P1000 falha de autenticação transitória).
 *
 * USE APENAS EM LEITURAS IDEMPOTENTES — nunca em mutações (duplicaria
 * escrita/AuditLog). Qualquer erro que não seja de conexão re-propaga
 * imediatamente.
 */

const RETRYABLE_CODES = ['P1001', 'P1017', 'P1000']

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetryableConnError(err) {
  return Boolean(
    err &&
      typeof err === 'object' &&
      RETRYABLE_CODES.includes(/** @type {{ code?: string }} */ (err).code ?? ''),
  )
}

/**
 * Reexecuta `fn` em caso de perda de conexão com o banco.
 *
 * @template T
 * @param {() => Promise<T>} fn leitura idempotente
 * @param {{ attempts?: number, baseDelayMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function withDbRetry(fn, options = {}) {
  const attempts = options.attempts ?? 3
  const baseDelayMs = options.baseDelayMs ?? 100
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i === attempts - 1 || !isRetryableConnError(err)) throw err
      const delay = baseDelayMs * 2 ** i // 100ms → 200ms → 400ms
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastErr
}
