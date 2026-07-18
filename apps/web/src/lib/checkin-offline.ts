/** Fila local de check-in QR para sincronizar quando a rede volta. */

export type CheckinOfflineItem = {
  id: string
  eventoId: string
  token: string
  enfileiradoEm: string
}

const PREFIX = 'torcida:checkin-offline:'

function key(eventoId: string) {
  return `${PREFIX}${eventoId}`
}

export function listCheckinOffline(eventoId: string): CheckinOfflineItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key(eventoId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CheckinOfflineItem =>
        typeof item === 'object' &&
        item != null &&
        typeof (item as CheckinOfflineItem).id === 'string' &&
        typeof (item as CheckinOfflineItem).token === 'string',
    )
  } catch {
    return []
  }
}

function save(eventoId: string, items: CheckinOfflineItem[]) {
  window.localStorage.setItem(key(eventoId), JSON.stringify(items))
}

export function enqueueCheckinOffline(eventoId: string, token: string): CheckinOfflineItem {
  const items = listCheckinOffline(eventoId)
  const existing = items.find((i) => i.token === token)
  if (existing) return existing
  const item: CheckinOfflineItem = {
    id: crypto.randomUUID(),
    eventoId,
    token,
    enfileiradoEm: new Date().toISOString(),
  }
  save(eventoId, [...items, item])
  return item
}

export function removeCheckinOffline(eventoId: string, id: string) {
  save(
    eventoId,
    listCheckinOffline(eventoId).filter((i) => i.id !== id),
  )
}

export function clearCheckinOffline(eventoId: string) {
  window.localStorage.removeItem(key(eventoId))
}
