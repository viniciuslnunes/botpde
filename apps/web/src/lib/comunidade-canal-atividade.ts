/** Prefixo do mapa last-seen da barra de escudos (localStorage). */
export const COMUNIDADE_CANAL_LAST_SEEN_KEY = 'comunidade_canal_last_seen_v1'

/** Cap alinhado ao tamanho prático da barra (fixos + zona móvel). */
export const MAX_CANAIS_ATIVIDADE = 20

export function chaveAtividadeNacional(afiliacaoId: string): string {
  return `nacional:${afiliacaoId}`
}

export function chaveAtividadeCanal(conversaId: string): string {
  return `canal:${conversaId}`
}

export function parseChaveAtividade(
  chave: string,
): { kind: 'nacional'; afiliacaoId: string } | { kind: 'canal'; conversaId: string } | null {
  if (chave.startsWith('nacional:')) {
    const afiliacaoId = chave.slice('nacional:'.length)
    return afiliacaoId ? { kind: 'nacional', afiliacaoId } : null
  }
  if (chave.startsWith('canal:')) {
    const conversaId = chave.slice('canal:'.length)
    return conversaId ? { kind: 'canal', conversaId } : null
  }
  return null
}

/** True quando a cabeça de atividade é estritamente mais nova que o last-seen. */
export function temAtividadeNova(
  maxCriadoEmIso: string | null | undefined,
  lastSeenIso: string | null | undefined,
): boolean {
  if (!maxCriadoEmIso) return false
  const maxMs = Date.parse(maxCriadoEmIso)
  if (Number.isNaN(maxMs)) return false
  if (!lastSeenIso) return true
  const seenMs = Date.parse(lastSeenIso)
  if (Number.isNaN(seenMs)) return true
  return maxMs > seenMs
}

export type LastSeenMap = Record<string, string>

export function lerLastSeenMap(storage: Pick<Storage, 'getItem'> | null): LastSeenMap {
  if (!storage) return {}
  try {
    const raw = storage.getItem(COMUNIDADE_CANAL_LAST_SEEN_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: LastSeenMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string' && !Number.isNaN(Date.parse(v))) {
        out[k] = v
      }
    }
    return out
  } catch {
    return {}
  }
}

export function gravarLastSeenMap(
  storage: Pick<Storage, 'setItem'> | null,
  map: LastSeenMap,
): void {
  if (!storage) return
  try {
    storage.setItem(COMUNIDADE_CANAL_LAST_SEEN_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}

/** Atualiza last-seen de uma chave para o instante (ou ISO) informado. */
export function marcarLastSeen(
  map: LastSeenMap,
  chave: string,
  iso: string = new Date().toISOString(),
): LastSeenMap {
  if (!chave) return map
  return { ...map, [chave]: iso }
}

/**
 * Dado o mapa de cabeças ISO e o last-seen, devolve o set de chaves com
 * novidade (exceto a chave ativa, se houver).
 */
export function calcularUnreadKeys(opts: {
  heads: Record<string, string | null | undefined>
  lastSeen: LastSeenMap
  activeKey: string | null
}): Set<string> {
  const unread = new Set<string>()
  for (const [chave, head] of Object.entries(opts.heads)) {
    if (opts.activeKey && chave === opts.activeKey) continue
    if (temAtividadeNova(head, opts.lastSeen[chave] ?? null)) {
      unread.add(chave)
    }
  }
  return unread
}
