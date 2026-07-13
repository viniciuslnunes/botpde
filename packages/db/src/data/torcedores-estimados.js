/**
 * Resolve estimativa de torcedores/inscritos por clube (offline).
 *
 * Prioridade:
 * 1. IBOPE Repucom — total publicado no Ranking Digital (Top 50)
 * 2. Top 50 sem total publicado — piso do ranking (menor total IBOPE publicado)
 * 3. Fora do Top 50 — teto = **menor valor conhecido na base curada** (LIMITE_ATE)
 *
 * O teto do item 3 **não é fixo**: acompanha o menor inscrito digital publicado
 * no JSON IBOPE (ex.: 471 mil hoje; 10 mil era só exemplo ilustrativo).
 * Na UI, clubes com contagem real na plataforma sobrescrevem LIMITE_ATE (ver onboarding.ts).
 *
 * Ver docs/data/torcedores-estimados.md
 */
import {
  CHAVES_IBOPE_TOP50_SEM_TOTAL,
  MENOR_TOTAL_IBOPE_PUBLICADO,
  FONTE_IBOPE_BASE,
  IBOPE_RANKING_DIGITAL,
  indiceIbopeDigital,
} from './ibope-ranking-digital.js'

const FONTE_IBOPE_PISO = `${FONTE_IBOPE_BASE} — integrante do Top 50 (total exato pendente de coleta; piso = menor publicado: 471,6 mil inscritos)`

/**
 * Menor total **publicado** na base curada (IBOPE Repucom).
 * Usado como teto conservador para clubes sem dado próprio (LIMITE_ATE).
 */
export function calcularMenorValorEstimadosConhecido() {
  const valores = IBOPE_RANKING_DIGITAL.map((r) => r.inscritos).filter(
    (n) => Number.isFinite(n) && n > 0,
  )
  if (valores.length === 0) return 1
  return Math.min(...valores)
}

/** @deprecated Use calcularMenorValorEstimadosConhecido() — mantido para testes legados. */
export const LIMITE_TORCEDORES_FORA_IBOPE = calcularMenorValorEstimadosConhecido()

export function fonteLimiteDesconhecido(teto = calcularMenorValorEstimadosConhecido()) {
  return (
    `Estimativa conservadora: clube fora do Top 50 IBOPE Repucom, sem contagem na plataforma; ` +
    `menor valor conhecido na base curada — até ${teto.toLocaleString('pt-BR')} torcedores ou menos`
  )
}

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

  const teto = calcularMenorValorEstimadosConhecido()
  return {
    valor: teto,
    tipo: 'LIMITE_ATE',
    fonte: fonteLimiteDesconhecido(teto),
    posicao: null,
  }
}
