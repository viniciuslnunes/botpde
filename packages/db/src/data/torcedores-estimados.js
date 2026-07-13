/**
 * Resolve estimativa de torcedores/inscritos por clube (offline).
 *
 * Prioridade:
 * 1. IBOPE Repucom — total publicado no Ranking Digital (Top 50)
 * 2. Top 50 sem total publicado — piso do ranking (menor total conhecido)
 * 3. Fora do Top 50 — teto conservador de 10 mil (LIMITE_ATE)
 *
 * Ver docs/data/torcedores-estimados.md
 */
import {
  CHAVES_IBOPE_TOP50_SEM_TOTAL,
  MENOR_TOTAL_IBOPE_PUBLICADO,
  FONTE_IBOPE_BASE,
  indiceIbopeDigital,
} from './ibope-ranking-digital.js'

/** Teto para clubes fora do Top 50 IBOPE (referência pedida pelo produto). */
export const LIMITE_TORCEDORES_FORA_IBOPE = 10_000

export const FONTE_LIMITE_FORA_IBOPE =
  'Estimativa conservadora: clube fora do Top 50 IBOPE Repucom; pode ter até 10 mil torcedores ou menos'

const FONTE_IBOPE_PISO = `${FONTE_IBOPE_BASE} — integrante do Top 50 (total exato pendente de coleta; piso = menor publicado: 471,6 mil inscritos)`

/**
 * @typedef {'IBOPE_DIGITAL' | 'LIMITE_ATE'} TorcedoresEstimadosTipo
 * @typedef {{ valor: number, tipo: TorcedoresEstimadosTipo, fonte: string, posicao: number | null }} TorcedoresEstimadosResolvido
 */

/** @param {string} chave chaveGrupoClube(nome, uf) */
/** @returns {TorcedoresEstimadosResolvido} */
export function resolverTorcedoresEstimados(chave) {
  const ibope = indiceIbopeDigital().get(chave)
  if (ibope) {
    return {
      valor: ibope.inscritos,
      tipo: 'IBOPE_DIGITAL',
      fonte: ibope.fonte,
      posicao: ibope.posicao,
    }
  }

  if (CHAVES_IBOPE_TOP50_SEM_TOTAL.has(chave)) {
    return {
      valor: MENOR_TOTAL_IBOPE_PUBLICADO,
      tipo: 'IBOPE_DIGITAL',
      fonte: FONTE_IBOPE_PISO,
      posicao: null,
    }
  }

  return {
    valor: LIMITE_TORCEDORES_FORA_IBOPE,
    tipo: 'LIMITE_ATE',
    fonte: FONTE_LIMITE_FORA_IBOPE,
    posicao: null,
  }
}
