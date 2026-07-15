const STORAGE_KEY = 'torcida-switcher-recentes'
export const MAX_TORCIDAS_RECENTES = 5

/** Slugs das torcidas recentemente selecionadas pelo operador (browser local). */
export function lerTorcidasRecentes(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0)
  } catch {
    return []
  }
}

export function registrarTorcidaRecente(slug: string): void {
  if (typeof window === 'undefined' || !slug) return
  try {
    const next = [slug, ...lerTorcidasRecentes().filter((s) => s !== slug)].slice(
      0,
      MAX_TORCIDAS_RECENTES,
    )
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // quota / private mode — ignora
  }
}
