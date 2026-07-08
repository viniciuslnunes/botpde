/**
 * Seleção do comunicado em destaque na Home — função pura, sem banco
 * (testável em Vitest). A lista de entrada já vem ordenada pelo feed
 * (prioridade > fixado > data, ver getFeedComunidade).
 *
 * Regra de produto (VIN-19): a Home destaca na primeira dobra o primeiro
 * comunicado NÃO LIDO que seja relevante (URGENTE, IMPORTANTE ou fixado).
 * Comunicado NORMAL não fixado não ganha banner — aparece só no widget e no
 * feed. Sem estado de leitura (usuário deslogado), nada é destacado.
 */

export interface ComunicadoDestacavel {
  id: string
  titulo: string
  corpo: string
  prioridade: 'NORMAL' | 'IMPORTANTE' | 'URGENTE'
  fixado: boolean
  lido?: boolean
}

export function escolherComunicadoDestaque<T extends ComunicadoDestacavel>(
  announcements: T[],
): T | null {
  for (const a of announcements) {
    if (a.lido !== false) continue // só não-lido (lido === false explícito)
    if (a.prioridade === 'URGENTE' || a.prioridade === 'IMPORTANTE' || a.fixado) return a
  }
  return null
}
