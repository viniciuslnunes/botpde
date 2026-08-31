/**
 * Resolve estimativa de torcedores/inscritos por clube (offline).
 *
 * Prioridade:
 * 0. PESQUISA — Datafolha × base populacional do IBGE. É a única fonte que
 *    responde "quantos TORCEDORES", então ganha do IBOPE (que mede seguidor de
 *    rede social). Cobre ~17 clubes; ver `torcedores-pesquisa-datafolha.js`.
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
import { DATAFOLHA_REFERENCIA, TORCEDORES_PESQUISA } from './torcedores-pesquisa-datafolha.js'
import { chaveGrupoClube } from './afiliacoes-normalize.js'

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

export function fonteLimiteDesconhecido() {
  return 'Fora do Top 50 IBOPE Repucom; não há dado publicado de inscritos digitais para este clube'
}

/** Índice memoizado da pesquisa Datafolha: `chaveGrupoClube` → linha. */
let cachePesquisa = null

/** @returns {Map<string, import('./torcedores-pesquisa-datafolha.js').TorcedorPesquisaSeed>} */
export function indicePesquisa() {
  if (cachePesquisa) return cachePesquisa
  cachePesquisa = new Map(
    TORCEDORES_PESQUISA.map((linha) => [chaveGrupoClube(linha.nome, linha.uf), linha]),
  )
  return cachePesquisa
}

/**
 * A fonte precisa carregar a ressalva: percentual dentro da margem de erro vira
 * ordem de grandeza, não medição.
 * @param {import('./torcedores-pesquisa-datafolha.js').TorcedorPesquisaSeed} linha
 * @returns {string}
 */
export function fontePesquisa(linha) {
  const base =
    `Datafolha ${DATAFOLHA_REFERENCIA.coletaEm.replace('/', ' e ')} ` +
    `(${linha.percentual}% dos brasileiros de 16+, margem ±${DATAFOLHA_REFERENCIA.margemErroPontos} p.p.) ` +
    '× população 16+ do Censo 2022 (IBGE)'
  return linha.dentroDaMargem ? `${base} — percentual dentro da margem: ordem de grandeza` : base
}

/**
 * @typedef {'PESQUISA' | 'IBOPE_DIGITAL' | 'LIMITE_ATE'} TorcedoresEstimadosTipo
 * @typedef {{ valor: number, tipo: TorcedoresEstimadosTipo, fonte: string, posicao: number | null }} TorcedoresEstimadosResolvido
 */

/** @param {string} chave chaveGrupoClube(nome, uf) */
/** @returns {TorcedoresEstimadosResolvido} */
export function resolverTorcedoresEstimados(chave) {
  const pesquisa = indicePesquisa().get(chave)
  if (pesquisa) {
    return {
      valor: pesquisa.torcedores,
      tipo: 'PESQUISA',
      fonte: fontePesquisa(pesquisa),
      posicao: null,
    }
  }

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
    fonte: fonteLimiteDesconhecido(),
    posicao: null,
  }
}
