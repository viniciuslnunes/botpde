/**
 * Casamento Afiliacao ↔ catálogo Ogol para seed de escudos.
 */
import { scoreWikiAfiliacao } from './escudos-wiki-match.js'

/** Homônimos menores que não devem casar com a âncora nacional (mesmo UF). */
export const OGOL_IDS_REJEITADOS = new Set([
  '232754', // Palmeiras FC — São João da Boa Vista (≠ SE Palmeiras)
])

/**
 * Nome usado no casamento — prioriza razão social, com UF explícita quando disponível.
 * @param {{ ogolId?: string | null, nomeOficial?: string | null, titulo?: string | null, uf?: string | null, cidade?: string | null }} ogol
 */
export function nomeCasamentoOgol(ogol) {
  const base = (ogol.nomeOficial || ogol.titulo || '').trim()
  if (!base) return ''
  if (ogol.uf && !base.includes(`(${ogol.uf})`)) return `${base} (${ogol.uf})`
  return base
}

/**
 * @param {{ ogolId?: string | null, nomeOficial?: string | null, titulo?: string | null, uf?: string | null, cidade?: string | null }} ogol
 * @param {{ nome: string, estado: string | null, cidade?: string | null }} afiliacao
 * @returns {number}
 */
export function scoreOgolAfiliacao(ogol, afiliacao) {
  if (ogol.ogolId && OGOL_IDS_REJEITADOS.has(String(ogol.ogolId))) return 0
  const nome = nomeCasamentoOgol(ogol)
  if (!nome) return 0
  return scoreWikiAfiliacao({ nome, cidade: ogol.cidade ?? null }, afiliacao)
}
