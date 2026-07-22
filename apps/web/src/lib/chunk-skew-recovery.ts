/**
 * Recuperação de version skew pós-deploy: tab antiga pede chunk com hash
 * que o Railway já não serve → ChunkLoadError / 404. Um reload puxa o HTML
 * novo com os assets atuais.
 *
 * O `deploymentId` no next.config cobre navegação SPA; este listener cobre
 * o caso em que o chunk falha antes/sem navegação (lazy import, bfcache).
 */

const STORAGE_KEY = 'torcida:chunk-skew-reload'
const COOLDOWN_MS = 30_000

const CHUNK_ERROR_RE =
  /Failed to load chunk|Loading chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i

export function isChunkLoadError(error: unknown): boolean {
  if (error == null) return false
  if (typeof error === 'string') return CHUNK_ERROR_RE.test(error)
  if (typeof error !== 'object') return false
  const e = error as { name?: string; message?: string }
  if (e.name === 'ChunkLoadError') return true
  return typeof e.message === 'string' && CHUNK_ERROR_RE.test(e.message)
}

/** Retorna true se deve recarregar (e registra o timestamp do cooldown). */
export function claimChunkSkewReload(now = Date.now()): boolean {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw != null) {
      const last = Number(raw)
      if (Number.isFinite(last) && now - last < COOLDOWN_MS) return false
    }
    sessionStorage.setItem(STORAGE_KEY, String(now))
    return true
  } catch {
    // sessionStorage indisponível — ainda tenta um reload
    return true
  }
}

export function installChunkSkewRecovery(
  reload: () => void = () => {
    window.location.reload()
  },
): () => void {
  const maybeReload = (error: unknown) => {
    if (!isChunkLoadError(error)) return
    if (!claimChunkSkewReload()) return
    reload()
  }

  const onError = (event: ErrorEvent) => {
    maybeReload(event.error ?? event.message)
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    maybeReload(event.reason)
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
