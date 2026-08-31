/**
 * Confiança na torcida (eixo local). Ledger + saldo; NÃO concede permissão.
 * `assertPermission` continua o único critério de autorização — confiança é
 * sempre AND restritivo. Recortes 2–4: AND em grupo/canal/sala (tenant; não CN)
 * + badge de nível (score privado).
 */

import { SYSTEM_ROLES } from './permissions.js'

/** @typedef {'CHECKIN' | 'MENSALIDADE' | 'APROVACAO' | 'REPROVACAO'} SinalConfianca */
/** @typedef {'grupo:criar' | 'canal:criar' | 'sala:hospedar'} CapacidadeConfianca */

/** @type {readonly SinalConfianca[]} */
export const SINAIS_CONFIANCA = Object.freeze(['CHECKIN', 'MENSALIDADE', 'APROVACAO', 'REPROVACAO'])

/**
 * Peso por sinal. Barato (post/reação) não entra — farmaria o feed.
 * @type {Readonly<Record<SinalConfianca, { peso: number, origemTipo: string }>>}
 */
export const SINAL_CONFIANCA = Object.freeze({
  CHECKIN: { peso: 15, origemTipo: 'EventoRsvp' },
  MENSALIDADE: { peso: 20, origemTipo: 'CobrancaAssociacao' },
  APROVACAO: { peso: 20, origemTipo: 'SaasMembro' },
  REPROVACAO: { peso: -40, origemTipo: 'SaasMembro' },
})

/** Presença física: no máximo 3 check-ins (45 pts) na janela. */
export const TETO_CHECKIN_JANELA_DIAS = 30
export const TETO_CHECKIN_JANELA_PESO = 45

/** Mensalidade: 1 competência (20 pts) na janela — impede empilhar cobranças no mesmo mês. */
export const TETO_MENSALIDADE_JANELA_PESO = 20

/**
 * Níveis → capacidades. Mexer em limiar = mudar constante, não caçar if.
 * Recortes 2–4: `grupo:criar` / `canal:criar` / `sala:hospedar` no nível 2.
 *
 * @type {readonly { nivel: number, minScore: number, label: string, capacidades: readonly CapacidadeConfianca[] }[]}
 */
export const NIVEIS_CONFIANCA = Object.freeze([
  { nivel: 0, minScore: 0, label: 'Novato', capacidades: Object.freeze([]) },
  { nivel: 1, minScore: 20, label: 'Conhecido', capacidades: Object.freeze([]) },
  { nivel: 2, minScore: 50, label: 'De casa', capacidades: Object.freeze(['grupo:criar', 'canal:criar', 'sala:hospedar']) },
  { nivel: 3, minScore: 80, label: 'Referência', capacidades: Object.freeze(['grupo:criar', 'canal:criar', 'sala:hospedar']) },
])

/**
 * @param {string} sinal
 * @returns {sinal is SinalConfianca}
 */
export function isSinalConfianca(sinal) {
  return SINAIS_CONFIANCA.includes(/** @type {SinalConfianca} */ (sinal))
}

/**
 * @param {number} score
 * @returns {number}
 */
export function nivelPorScore(score) {
  const n = Math.max(0, Math.min(100, Math.floor(Number(score) || 0)))
  let nivel = 0
  for (const row of NIVEIS_CONFIANCA) {
    if (n >= row.minScore) nivel = row.nivel
  }
  return nivel
}

const CARGOS_PISO_CONFIANCA = Object.freeze([
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.VICE,
])

/**
 * Cargo de sistema dá piso: liderança opera no dia 1.
 * Nome tem de ser o canônico (`owner`/`admin`/`vice`) E `isSystem`.
 * @param {readonly { nome?: string | null, isSystem?: boolean }[] | null | undefined} cargos
 * @returns {number}
 */
export function pisoNivelPorCargos(cargos) {
  for (const c of cargos ?? []) {
    if (!c?.isSystem) continue
    if (CARGOS_PISO_CONFIANCA.includes(/** @type {typeof CARGOS_PISO_CONFIANCA[number]} */ (c.nome))) {
      return 2
    }
  }
  return 0
}

/**
 * @param {number} nivel
 * @param {number} piso
 * @returns {number}
 */
export function aplicarPisoNivel(nivel, piso) {
  const n = Math.max(0, Math.floor(Number(nivel) || 0))
  const p = Math.max(0, Math.floor(Number(piso) || 0))
  return Math.max(n, p)
}

/**
 * Capacidade no nível efetivo (nível 2 já inclui o que o 1 tinha).
 * @param {number} nivel
 * @param {CapacidadeConfianca} capacidade
 * @returns {boolean}
 */
export function temCapacidade(nivel, capacidade) {
  const n = Math.max(0, Math.floor(Number(nivel) || 0))
  return NIVEIS_CONFIANCA.some((row) => row.nivel <= n && row.capacidades.includes(capacidade))
}

/**
 * @param {number} nivel
 * @returns {string}
 */
export function labelNivelConfianca(nivel) {
  const n = Math.max(0, Math.floor(Number(nivel) || 0))
  const row = [...NIVEIS_CONFIANCA].reverse().find((r) => r.nivel <= n)
  return row?.label ?? 'Novato'
}

/**
 * Progresso privado (próprio perfil). Não é ranking.
 * @param {number} score
 * @param {number} nivelEfetivo
 * @returns {{ label: string, faltam: number } | null}
 */
export function progressoProximoNivel(score, nivelEfetivo) {
  const n = Math.max(0, Math.floor(Number(nivelEfetivo) || 0))
  const proximo = NIVEIS_CONFIANCA.find((row) => row.nivel === n + 1)
  if (!proximo) return null
  const s = Math.max(0, Math.floor(Number(score) || 0))
  return { label: proximo.label, faltam: Math.max(0, proximo.minScore - s) }
}

/** @type {Readonly<Record<CapacidadeConfianca, string>>} */
export const MENSAGEM_CAPACIDADE_CONFIANCA = Object.freeze({
  'grupo:criar':
    'Para criar grupo nesta torcida é preciso o nível De casa — presença em evento, mensalidade em dia ou aprovação da liderança.',
  'canal:criar':
    'Para criar canal nesta torcida é preciso o nível De casa — presença em evento, mensalidade em dia ou aprovação da liderança.',
  'sala:hospedar':
    'Para abrir sala nesta torcida é preciso o nível De casa — presença em evento, mensalidade em dia ou aprovação da liderança.',
})

/**
 * @param {string} sinal
 * @returns {number | null}
 */
function tetoJanelaDoSinal(sinal) {
  if (sinal === 'CHECKIN') return TETO_CHECKIN_JANELA_PESO
  if (sinal === 'MENSALIDADE') return TETO_MENSALIDADE_JANELA_PESO
  return null
}

/**
 * Soma o ledger. Check-in e mensalidade têm teto na janela; o antigo conta
 * metade (não evapora). Clamp 0–100.
 *
 * @param {readonly { sinal: string, peso: number, criadoEm: Date | string }[]} eventos
 * @param {Date} [agora]
 * @returns {number}
 */
export function somarScoreEventos(eventos, agora = new Date()) {
  const janelaMs = TETO_CHECKIN_JANELA_DIAS * 24 * 60 * 60 * 1000
  const agoraMs = agora instanceof Date ? agora.getTime() : new Date(agora).getTime()
  /** @type {Record<string, number>} */
  const usadoNaJanela = { CHECKIN: 0, MENSALIDADE: 0 }
  let total = 0
  for (const e of eventos ?? []) {
    const peso = Number(e?.peso) || 0
    const teto = tetoJanelaDoSinal(e?.sinal)
    if (teto != null) {
      const t = e.criadoEm instanceof Date ? e.criadoEm.getTime() : new Date(e.criadoEm).getTime()
      const naJanela = Number.isFinite(t) && agoraMs - t <= janelaMs
      if (naJanela) {
        const resto = teto - (usadoNaJanela[e.sinal] ?? 0)
        if (resto <= 0) continue
        const aplicado = Math.min(peso, resto)
        usadoNaJanela[e.sinal] = (usadoNaJanela[e.sinal] ?? 0) + aplicado
        total += aplicado
      } else {
        total += Math.floor(peso / 2)
      }
    } else {
      total += peso
    }
  }
  return Math.max(0, Math.min(100, Math.round(total)))
}

/**
 * @param {{ score: number, pisoNivel?: number }} input
 * @returns {{ score: number, nivel: number }}
 */
export function materializarSaldoConfianca(input) {
  const score = Math.max(0, Math.min(100, Math.round(Number(input?.score) || 0)))
  const nivel = aplicarPisoNivel(nivelPorScore(score), input?.pisoNivel ?? 0)
  return { score, nivel }
}

/**
 * A origem tem de ser daquela pessoa naquele tenant, no estado que o sinal pede.
 * @param {SinalConfianca} sinal
 * @param {{ userId: string, tenantId: string }} esperado
 * @param {{
 *   userId?: string | null
 *   tenantId?: string | null
 *   tipo?: string | null
 *   status?: string | null
 *   checkedInAt?: Date | string | null
 * } | null | undefined} origem
 * @returns {boolean}
 */
export function origemConfereConfianca(sinal, esperado, origem) {
  if (!origem || !esperado?.userId || !esperado?.tenantId) return false
  if (origem.userId !== esperado.userId || origem.tenantId !== esperado.tenantId) return false
  if (sinal === 'CHECKIN') return Boolean(origem.checkedInAt)
  if (sinal === 'MENSALIDADE') return origem.tipo === 'MENSALIDADE' && origem.status === 'PAGA'
  if (sinal === 'APROVACAO') return origem.status === 'APROVADO'
  if (sinal === 'REPROVACAO') return origem.status === 'REPROVADO'
  return false
}
