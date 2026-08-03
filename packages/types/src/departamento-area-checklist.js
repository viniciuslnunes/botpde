/**
 * Checklist leve por área de atuação — mesmo espírito do barracão Carnaval,
 * sem ERP. Persistência: `DepartamentoArea.meta.checklist.items[]`.
 *
 * Itens são livres (o gestor cria/remove). Modelos sugeridos por slug de área
 * são semente de UX, nunca sobrescrevem meta no seed.
 */

import { slugifyArea } from './departamento-areas-canonicas.js'

/** @typedef {{ id: string, label: string, done: boolean }} AreaChecklistItem */

/** Limite operacional — checklist, não task-tracker. */
export const AREA_CHECKLIST_MAX_ITENS = 30
export const AREA_CHECKLIST_LABEL_MAX = 80

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
  if (!meta || typeof meta !== 'object') return []
  const checklist = /** @type {{ checklist?: { items?: unknown } }} */ (meta).checklist
  if (!checklist?.items || !Array.isArray(checklist.items)) return []
  /** @type {AreaChecklistItem[]} */
  const out = []
  for (const raw of checklist.items) {
    if (!raw || typeof raw !== 'object') continue
    const row = /** @type {{ id?: unknown, label?: unknown, done?: unknown }} */ (raw)
    if (typeof row.id !== 'string' || !row.id.trim()) continue
    if (typeof row.label !== 'string' || !row.label.trim()) continue
    out.push({
      id: row.id.trim().slice(0, 64),
      label: row.label.trim().slice(0, AREA_CHECKLIST_LABEL_MAX),
      done: Boolean(row.done),
    })
  }
  return out
}

/**
 * @param {unknown} meta
 * @returns {{ total: number, done: number }}
 */
export function checklistProgress(meta) {
  const items = checklistItemsFromMeta(meta)
  return {
    total: items.length,
    done: items.filter((i) => i.done).length,
  }
}

/**
 * @param {unknown} meta
 * @param {AreaChecklistItem[]} items
 * @returns {object}
 */
function writeChecklistItems(meta, items) {
  const base =
    meta && typeof meta === 'object' ? { .../** @type {Record<string, unknown>} */ (meta) } : {}
  const prevChecklist =
    base.checklist && typeof base.checklist === 'object'
      ? { .../** @type {Record<string, unknown>} */ (base.checklist) }
      : {}
  return { ...base, checklist: { ...prevChecklist, items } }
}

/**
 * @param {unknown} meta
 * @param {string} itemId
 * @param {boolean} done
 * @returns {object}
 */
export function toggleAreaChecklistItem(meta, itemId, done) {
  const items = checklistItemsFromMeta(meta).map((i) =>
    i.id === itemId ? { ...i, done: Boolean(done) } : i,
  )
  return writeChecklistItems(meta, items)
}

/**
 * @param {unknown} meta
 * @param {string} label
 * @param {string} [itemId]
 * @returns {{ meta: object, item: AreaChecklistItem } | { error: string }}
 */
export function addAreaChecklistItem(meta, label, itemId) {
  const texto = typeof label === 'string' ? label.trim() : ''
  if (texto.length < 2) return { error: 'Informe um item (mín. 2 caracteres)' }
  if (texto.length > AREA_CHECKLIST_LABEL_MAX) return { error: 'Item muito longo' }

  const items = checklistItemsFromMeta(meta)
  if (items.length >= AREA_CHECKLIST_MAX_ITENS) {
    return { error: `No máximo ${AREA_CHECKLIST_MAX_ITENS} itens na checklist` }
  }

  const id =
    typeof itemId === 'string' && itemId.trim()
      ? itemId.trim().slice(0, 64)
      : newAreaChecklistItemId(texto)
  if (items.some((i) => i.id === id)) return { error: 'Item já existe' }

  /** @type {AreaChecklistItem} */
  const item = { id, label: texto, done: false }
  return { meta: writeChecklistItems(meta, [...items, item]), item }
}

/**
 * @param {unknown} meta
 * @param {string} itemId
 * @returns {object}
 */
export function removeAreaChecklistItem(meta, itemId) {
  const items = checklistItemsFromMeta(meta).filter((i) => i.id !== itemId)
  return writeChecklistItems(meta, items)
}

/**
 * Aplica modelo sugerido: acrescenta itens do modelo que ainda não existem
 * (por id). Não apaga itens customizados nem marca done.
 *
 * @param {unknown} meta
 * @param {string} areaSlug
 * @returns {{ meta: object, adicionados: number } | { error: string }}
 */
export function applyAreaChecklistModelo(meta, areaSlug) {
  const modelo = AREA_CHECKLIST_MODELOS[areaSlug]
  if (!modelo || modelo.length === 0) return { error: 'Esta área não tem modelo sugerido' }

  const items = checklistItemsFromMeta(meta)
  const ids = new Set(items.map((i) => i.id))
  /** @type {AreaChecklistItem[]} */
  const next = [...items]
  let adicionados = 0
  for (const def of modelo) {
    if (ids.has(def.id)) continue
    if (next.length >= AREA_CHECKLIST_MAX_ITENS) break
    next.push({ id: def.id, label: def.label, done: false })
    ids.add(def.id)
    adicionados += 1
  }
  if (adicionados === 0) return { error: 'Modelo já aplicado (ou checklist cheia)' }
  return { meta: writeChecklistItems(meta, next), adicionados }
}
