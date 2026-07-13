/**
 * Casamento Afiliacao ↔ catálogo Ogol para seed de escudos.
 */
import { scoreWikiAfiliacao } from './escudos-wiki-match.js'

/**
 * Nome usado no casamento — prioriza razão social, com UF explícita quando disponível.
 * @param {{ nomeOficial?: string | null, titulo?: string | null, uf?: string | null, cidade?: string | null }} ogol
 */
export function nomeCasamentoOgol(ogol) {
  const base = (ogol.nomeOficial || ogol.titulo || '').trim()
  if (!base) return ''
  if (ogol.uf && !base.includes(`(${ogol.uf})`)) return `${base} (${ogol.uf})`
  return base
}

/**
 * @param {{ nomeOficial?: string | null, titulo?: string | null, uf?: string | null, cidade?: string | null }} ogol
 * @param {{ nome: string, estado: string | null }} afiliacao
 * @returns {number}
 */
export function scoreOgolAfiliacao(ogol, afiliacao) {
  const nome = nomeCasamentoOgol(ogol)
  if (!nome) return 0
  return scoreWikiAfiliacao({ nome, cidade: ogol.cidade ?? null }, afiliacao)
}
