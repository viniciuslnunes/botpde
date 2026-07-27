const MAX_RECENTES = 5

function storageKey(namespace: string): string {
  return `context-switcher-recentes:${namespace}`
}

/** IDs recentemente selecionados no browser (por namespace: clube / torcida / unidade). */
export function lerRecentes(namespace: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(namespace))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0)
  } catch {
    return []
  }
}

export function registrarRecente(namespace: string, id: string): void {
  if (typeof window === 'undefined' || !id) return
  try {
    const next = [id, ...lerRecentes(namespace).filter((s) => s !== id)].slice(0, MAX_RECENTES)
    window.localStorage.setItem(storageKey(namespace), JSON.stringify(next))
  } catch {
    // quota / private mode — ignora
  }
}
