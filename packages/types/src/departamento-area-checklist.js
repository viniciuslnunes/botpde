/**
 * Checklist leve por área de atuação — mesmo espírito do barracão Carnaval,
 * sem ERP. Persistência: `DepartamentoArea.meta.checklist` via `procedimento.js`.
 *
 * Itens são livres (o gestor cria/remove). Modelos sugeridos por slug de área
 * são semente de UX, nunca sobrescrevem meta no seed.
 */

import { slugifyArea } from './departamento-areas-canonicas.js'
import {
  PROCEDIMENTO_LABEL_MAX,
  PROCEDIMENTO_MAX_ITENS,
  addProcedimentoArrayItem,
  applyProcedimentoModelo,
  procedimentoItemsFromArray,
  procedimentoProgress,
  removeProcedimentoArrayItem,
  toggleProcedimentoArray,
} from './procedimento.js'

/** @typedef {{ id: string, label: string, done: boolean }} AreaChecklistItem */

/** Limite operacional — checklist, não task-tracker. */
export const AREA_CHECKLIST_MAX_ITENS = PROCEDIMENTO_MAX_ITENS
export const AREA_CHECKLIST_LABEL_MAX = PROCEDIMENTO_LABEL_MAX

export const AREA_CHECKLIST_PATH = 'checklist'

/**
 * Modelos opcionais por slug canônico — CTA "Usar modelo" no cockpit.
 * @type {Readonly<Record<string, readonly { id: string, label: string }[]>>}
 */
export const AREA_CHECKLIST_MODELOS = Object.freeze({
  'campanha-do-agasalho': Object.freeze([
    { id: 'divulgacao', label: 'Divulgação / pontos de coleta' },
    { id: 'coleta', label: 'Coleta em andamento' },
    { id: 'triagem', label: 'Triagem e higiene' },
    { id: 'distribuicao', label: 'Distribuição / entrega' },
    { id: 'prestacao', label: 'Prestação de contas' },
  ]),
  'festa-das-criancas': Object.freeze([
    { id: 'local', label: 'Local e data confirmados' },
    { id: 'brinquedos', label: 'Brinquedos / lembranças' },
    { id: 'alimentacao', label: 'Alimentação / bolo' },
    { id: 'voluntarios', label: 'Escala de voluntários' },
    { id: 'registro', label: 'Registro / fotos' },
  ]),
  barracao: Object.freeze([
    { id: 'cronograma', label: 'Cronograma de obra' },
    { id: 'materiais', label: 'Materiais em estoque' },
    { id: 'alegorias', label: 'Alegorias em montagem' },
    { id: 'fantasias', label: 'Fantasias / adereços' },
    { id: 'entrega', label: 'Checklist de entrega' },
  ]),
  'alegorias-e-aderecos': Object.freeze([
    { id: 'medidas', label: 'Medidas / lista de componentes' },
    { id: 'corte', label: 'Corte e costura' },
    { id: 'acabamento', label: 'Acabamento / prova' },
    { id: 'entrega', label: 'Entrega à ala' },
  ]),
  'escala-de-jogo': Object.freeze([
    { id: 'convocacao', label: 'Convocação publicada' },
    { id: 'confirmacoes', label: 'Confirmações de presença' },
    { id: 'instrumentos', label: 'Instrumentos / transporte' },
    { id: 'ponto', label: 'Ponto de encontro' },
  ]),
})

/**
 * @param {string} label
 * @param {string} [suffix]
 * @returns {string}
 */
export function newAreaChecklistItemId(label, suffix) {
  const base = slugifyArea(label).slice(0, 40) || 'item'
  const s =
    typeof suffix === 'string' && suffix.trim()
      ? suffix.trim().slice(0, 12)
      : Math.random().toString(36).slice(2, 8)
  return `${base}-${s}`.slice(0, 64)
}

/**
 * @param {unknown} meta
 * @returns {AreaChecklistItem[]}
 */
export function checklistItemsFromMeta(meta) {
  return procedimentoItemsFromArray(meta, AREA_CHECKLIST_PATH)
}

/**
 * @param {unknown} meta
 * @returns {{ total: number, done: number }}
 */
export function checklistProgress(meta) {
  return procedimentoProgress(checklistItemsFromMeta(meta))
}

/**
 * @param {unknown} meta
 * @param {string} itemId
 * @param {boolean} done
 * @returns {object}
 */
export function toggleAreaChecklistItem(meta, itemId, done) {
  return toggleProcedimentoArray(meta, AREA_CHECKLIST_PATH, itemId, done)
}

/**
 * @param {unknown} meta
 * @param {string} label
 * @param {string} [itemId]
 * @returns {{ meta: object, item: AreaChecklistItem } | { error: string }}
 */
export function addAreaChecklistItem(meta, label, itemId) {
  return addProcedimentoArrayItem(meta, AREA_CHECKLIST_PATH, label, itemId, {
    maxItens: AREA_CHECKLIST_MAX_ITENS,
    newId: newAreaChecklistItemId,
  })
}

/**
 * @param {unknown} meta
 * @param {string} itemId
 * @returns {object}
 */
export function removeAreaChecklistItem(meta, itemId) {
  return removeProcedimentoArrayItem(meta, AREA_CHECKLIST_PATH, itemId)
}

/**
 * @param {unknown} meta
 * @param {string} areaSlug
 * @returns {{ meta: object, adicionados: number } | { error: string }}
 */
export function applyAreaChecklistModelo(meta, areaSlug) {
  const modelo = AREA_CHECKLIST_MODELOS[areaSlug]
  if (!modelo || modelo.length === 0) return { error: 'Esta área não tem modelo sugerido' }
  return applyProcedimentoModelo(meta, AREA_CHECKLIST_PATH, modelo, {
    maxItens: AREA_CHECKLIST_MAX_ITENS,
  })
}
