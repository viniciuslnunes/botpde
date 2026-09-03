/**
 * Checklist leve do barracão (Carnaval) — sem ERP de escola de samba.
 * Persistência: `Departamento.meta.barracao` via primitiva `procedimento.js`.
 */

import {
  mergeProcedimentoRecordItem,
  procedimentoItemsFromCatalog,
  procedimentoProgress,
  toggleProcedimentoRecord,
} from './procedimento.js'

export const BARRACAO_PATH = 'barracao'

/** @typedef {{ id: string, label: string }} BarracaoItemDef */

/** @type {readonly BarracaoItemDef[]} */
export const BARRACAO_CHECKLIST = Object.freeze([
  { id: 'concentracao', label: 'Concentração / ponto de encontro' },
  { id: 'ensaio-rua', label: 'Ensaio de rua' },
  { id: 'fantasias', label: 'Fantasias / materiais' },
  { id: 'transporte', label: 'Transporte / logística' },
  { id: 'alimentacao', label: 'Alimentação / água' },
  { id: 'comunicacao', label: 'Comunicação / avisos à ala' },
])

/**
 * @param {unknown} meta
 * @returns {Record<string, { done: boolean, note?: string }>}
 */
export function barracaoItemsFromMeta(meta) {
  const items = procedimentoItemsFromCatalog(meta, BARRACAO_PATH, BARRACAO_CHECKLIST)
  /** @type {Record<string, { done: boolean, note?: string }>} */
  const out = {}
  for (const item of items) {
    out[item.id] = {
      done: item.done,
      ...(item.note ? { note: item.note } : {}),
    }
  }
  return out
}

/**
 * @param {unknown} meta
 * @param {string} itemId
 * @param {boolean} done
 * @returns {object}
 */
export function mergeBarracaoItem(meta, itemId, done) {
  return toggleProcedimentoRecord(meta, BARRACAO_PATH, itemId, done)
}

/**
 * @param {unknown} meta
 * @returns {{ total: number, done: number }}
 */
export function barracaoProgress(meta) {
  return procedimentoProgress(procedimentoItemsFromCatalog(meta, BARRACAO_PATH, BARRACAO_CHECKLIST))
}

/**
 * Data do desfile / concentração principal (ISO yyyy-mm-dd ou ISO datetime).
 * @param {unknown} meta
 * @returns {Date | null}
 */
export function desfileEmFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return null
  const raw = /** @type {{ desfileEm?: unknown }} */ (meta).desfileEm
  if (typeof raw !== 'string' || !raw.trim()) return null
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d : null
}

/**
 * @param {unknown} meta
 * @param {Date | number} [agora]
 * @returns {number | null} dias restantes (ceil); negativo se passado
 */
export function diasAteDesfile(meta, agora = new Date()) {
  const desfile = desfileEmFromMeta(meta)
  if (!desfile) return null
  const agoraMs = agora instanceof Date ? agora.getTime() : agora
  const DIA_MS = 24 * 60 * 60 * 1000
  return Math.ceil((desfile.getTime() - agoraMs) / DIA_MS)
}

/** Janela de urgência do barracão: faltam ≤14 dias para o desfile. */
export const BARRACAO_URGENCIA_DIAS = 14

/**
 * @param {unknown} meta
 * @param {Date | number} [agora]
 * @returns {boolean}
 */
export function barracaoEmUrgencia(meta, agora = new Date()) {
  const dias = diasAteDesfile(meta, agora)
  return dias != null && dias >= 0 && dias <= BARRACAO_URGENCIA_DIAS
}

/**
 * Grava `desfileEm` (ISO date string ou null para limpar).
 * @param {unknown} meta
 * @param {string | null} desfileEmIso
 * @returns {object}
 */
export function mergeDesfileEm(meta, desfileEmIso) {
  const base =
    meta && typeof meta === 'object' ? { .../** @type {Record<string, unknown>} */ (meta) } : {}
  if (!desfileEmIso || !String(desfileEmIso).trim()) {
    const { desfileEm: _drop, ...rest } = base
    return rest
  }
  return { ...base, desfileEm: String(desfileEmIso).trim() }
}

// Reexport para quem precisa de nota no barracão (futuro).
export { mergeProcedimentoRecordItem as mergeBarracaoItemNota }
