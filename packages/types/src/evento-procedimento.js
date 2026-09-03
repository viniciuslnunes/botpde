/**
 * Procedimento pré-embarque de caravana — catálogo fixo em `Evento.meta.procedimento`.
 * Regras puras; persistência via primitiva `procedimento.js`.
 */

import {
  mergeProcedimentoRecordItem,
  procedimentoItemsFromCatalog,
  procedimentoProgress,
  toggleProcedimentoRecord,
} from './procedimento.js'

/** @typedef {import('./procedimento.js').ProcedimentoItem} ProcedimentoItem */

export const EVENTO_PROCEDIMENTO_PATH = 'procedimento'

/** Itens sugeridos no programa cockpit admin (Onda 1 Caravanas). */
export const CARAVANA_PROCEDIMENTO_CATALOGO = Object.freeze([
  { id: 'documento-onibus', label: 'Documento do ônibus / autorização' },
  { id: 'contato-motorista', label: 'Contato do motorista confirmado' },
  { id: 'horario-concentracao', label: 'Horário e ponto de concentração divulgados' },
  { id: 'materiais', label: 'Materiais / bandeirão embarcados' },
  { id: 'agua', label: 'Água e lanches' },
  { id: 'primeiros-socorros', label: 'Kit primeiros socorros' },
])

/**
 * @param {unknown} meta
 * @returns {ProcedimentoItem[]}
 */
export function caravanaProcedimentoFromMeta(meta) {
  return procedimentoItemsFromCatalog(meta, EVENTO_PROCEDIMENTO_PATH, CARAVANA_PROCEDIMENTO_CATALOGO)
}

/**
 * @param {unknown} meta
 * @returns {{ total: number, done: number }}
 */
export function caravanaProcedimentoProgress(meta) {
  return procedimentoProgress(caravanaProcedimentoFromMeta(meta))
}

/**
 * @param {unknown} meta
 * @param {string} itemId
 * @param {boolean} done
 * @returns {object}
 */
export function toggleCaravanaProcedimento(meta, itemId, done) {
  return toggleProcedimentoRecord(meta, EVENTO_PROCEDIMENTO_PATH, itemId, done)
}

/**
 * @param {unknown} meta
 * @param {string} itemId
 * @param {{ done?: boolean, note?: string | null }} patch
 * @returns {object}
 */
export function mergeCaravanaProcedimentoItem(meta, itemId, patch) {
  return mergeProcedimentoRecordItem(meta, EVENTO_PROCEDIMENTO_PATH, itemId, patch)
}

/**
 * Pendência de ops: caravana a ≤72h com checklist incompleto.
 *
 * @param {unknown} meta
 * @param {Date | number} dataEvento
 * @param {Date | number} [agora]
 * @returns {boolean}
 */
export function caravanaProcedimentoEmUrgencia(meta, dataEvento, agora = new Date()) {
  const agoraMs = agora instanceof Date ? agora.getTime() : agora
  const eventoMs = dataEvento instanceof Date ? dataEvento.getTime() : dataEvento
  const dias = Math.ceil((eventoMs - agoraMs) / (24 * 60 * 60 * 1000))
  if (dias < 0 || dias > 3) return false
  const { total, done } = caravanaProcedimentoProgress(meta)
  return total > 0 && done < total
}
