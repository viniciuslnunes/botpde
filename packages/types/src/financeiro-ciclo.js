/**
 * Ciclo financeiro automático — geração de mensalidade + régua por cron.
 * Config em `Tenant.financeiroCiclo` (JSON).
 */

import { z } from 'zod'

export const FinanceiroCicloSchema = z.object({
  ativo: z.boolean().default(false),
  /** Dia do mês (1–28) para gerar cobranças recorrentes. */
  diaGeracao: z.number().int().min(1).max(28).default(1),
  /** Dias após o vencimento para lembrete na régua (ex.: [0, 7, 14]). */
  diasRegua: z.array(z.number().int().min(0).max(90)).default([0, 7, 14]),
  /** Dias até o vencimento da cobrança gerada. */
  diasParaVencimento: z.number().int().min(1).max(60).default(10),
})

/** @typedef {z.infer<typeof FinanceiroCicloSchema>} FinanceiroCiclo */

export const FINANCEIRO_CICLO_PADRAO = Object.freeze({
  ativo: false,
  diaGeracao: 1,
  diasRegua: [0, 7, 14],
  diasParaVencimento: 10,
})

/**
 * @param {unknown} raw
 * @returns {FinanceiroCiclo}
 */
export function parseFinanceiroCiclo(raw) {
  if (raw == null) return { ...FINANCEIRO_CICLO_PADRAO }
  const parsed = FinanceiroCicloSchema.safeParse(raw)
  return parsed.success ? parsed.data : { ...FINANCEIRO_CICLO_PADRAO }
}

/**
 * Chave de competência `YYYY-MM` para idempotência da geração.
 *
 * @param {Date} [agora]
 * @returns {string}
 */
export function competenciaMensalAtual(agora = new Date()) {
  const y = agora.getFullYear()
  const m = String(agora.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Deve rodar geração hoje?
 *
 * @param {FinanceiroCiclo} ciclo
 * @param {Date} [agora]
 * @returns {boolean}
 */
export function deveGerarCobrancasHoje(ciclo, agora = new Date()) {
  if (!ciclo.ativo) return false
  const dia = agora.getDate()
  return dia === ciclo.diaGeracao
}

/**
 * Dias em atraso desde o vencimento (0 = vence hoje).
 *
 * @param {Date} vencimento
 * @param {Date} [agora]
 * @returns {number}
 */
export function diasEmAtraso(vencimento, agora = new Date()) {
  const DIA_MS = 24 * 60 * 60 * 1000
  return Math.floor((agora.getTime() - vencimento.getTime()) / DIA_MS)
}

/**
 * @param {FinanceiroCiclo} ciclo
 * @param {Date} vencimento
 * @param {Date} [agora]
 * @returns {boolean}
 */
export function deveDispararRegua(ciclo, vencimento, agora = new Date()) {
  const dias = diasEmAtraso(vencimento, agora)
  return ciclo.diasRegua.includes(dias)
}
