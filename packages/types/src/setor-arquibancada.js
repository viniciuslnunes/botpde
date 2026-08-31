/**
 * Contrato do setor da torcida na arquibancada. Espelha
 * `enum SetorArquibancada` do Prisma. Copy canônica: sempre
 * “Setor Norte / Sul / Leste / Oeste” — nunca “Gol Norte”.
 */

import { z } from 'zod'

/** @typedef {'NORTE'|'SUL'|'LESTE'|'OESTE'} SetorArquibancadaCardeal */

export const SETORES_ARQUIBANCADA = /** @type {const} */ (['NORTE', 'SUL', 'LESTE', 'OESTE'])

/** Rótulo de UI — invariante: começa com “Setor ”, nunca “Gol”. */
export const SETOR_ARQUIBANCADA_LABEL = {
  NORTE: 'Setor Norte',
  SUL: 'Setor Sul',
  LESTE: 'Setor Leste',
  OESTE: 'Setor Oeste',
}

export const SetorArquibancadaCardealSchema = z.enum(SETORES_ARQUIBANCADA)

const textoOpcional = z
  .string()
  .trim()
  .max(80, 'No máximo 80 caracteres')
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))

export const SalvarSetorArquibancadaSchema = z
  .object({
    cardeal: SetorArquibancadaCardealSchema,
    geral: z
      .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
      .optional()
      .transform((v) => v === 'on' || v === 'true'),
    nomeLocal: textoOpcional,
    portao: textoOpcional,
  })
  .transform((data) => {
    const cabeceira = data.cardeal === 'NORTE' || data.cardeal === 'SUL'
    return {
      cardeal: data.cardeal,
      geral: cabeceira ? data.geral : false,
      nomeLocal: data.nomeLocal ?? null,
      portao: data.portao ?? null,
    }
  })

/**
 * @param {string | null | undefined} cardeal
 * @returns {string}
 */
export function rotuloSetorArquibancada(cardeal) {
  if (!cardeal) return ''
  return SETOR_ARQUIBANCADA_LABEL[cardeal] ?? ''
}

/**
 * @param {{
 *   cardeal: string | null | undefined
 *   geral?: boolean | null
 *   nomeLocal?: string | null
 *   portao?: string | null
 * } | null | undefined} setor
 * @returns {string}
 */
export function formatarSetorArquibancada(setor) {
  if (!setor?.cardeal) return ''
  const label = rotuloSetorArquibancada(setor.cardeal)
  if (!label) return ''
  const partes = [label]
  if (setor.geral) partes.push('Geral')
  const nome = setor.nomeLocal?.trim()
  if (nome && nome.toLocaleLowerCase('pt-BR') !== label.toLocaleLowerCase('pt-BR')) {
    partes.push(nome)
  }
  const portao = setor.portao?.trim()
  if (portao) partes.push(portao)
  return partes.join(' · ')
}

/**
 * Geral (em pé) só faz sentido na cabeceira.
 * @param {string | null | undefined} cardeal
 */
export function setorAceitaGeral(cardeal) {
  return cardeal === 'NORTE' || cardeal === 'SUL'
}
