import { normalizarTexto } from '@/lib/onboarding-unidade'
import type { ReactiveSearchOption } from './types'

/** Filtra opções no cliente por label/sublabel/searchText. */
export function filtrarOpcoesBusca(
  items: ReactiveSearchOption[],
  termo: string,
  max: number,
): ReactiveSearchOption[] {
  const alvo = normalizarTexto(termo)
  const filtradas = items.filter((item) => {
    if (!alvo) return true
    const hay = item.searchText ?? [item.label, item.sublabel ?? ''].join(' ')
    return normalizarTexto(hay).includes(alvo)
  })
  return filtradas.slice(0, max)
}

/** Mescla semente local com resultado remoto, deduplicando por id. */
export function mesclarUniversoBusca(
  semente: ReactiveSearchOption[],
  remoto: ReactiveSearchOption[],
): ReactiveSearchOption[] {
  const ids = new Set<string>()
  const merged: ReactiveSearchOption[] = []
  for (const item of [...semente, ...remoto]) {
    if (ids.has(item.id)) continue
    ids.add(item.id)
    merged.push(item)
  }
  return merged
}

export function resolverOpcoesVisiveis(
  universo: ReactiveSearchOption[],
  termo: string,
  maxResults: number,
): { opcoes: ReactiveSearchOption[]; truncado: boolean; totalOcultos: number } {
  const alvo = normalizarTexto(termo.trim())
  const filtradas = universo.filter((item) => {
    if (!alvo) return true
    const hay = item.searchText ?? [item.label, item.sublabel ?? ''].join(' ')
    return normalizarTexto(hay).includes(alvo)
  })
  return {
    opcoes: filtradas.slice(0, maxResults),
    truncado: filtradas.length > maxResults,
    totalOcultos: Math.max(filtradas.length - maxResults, 0),
  }
}
