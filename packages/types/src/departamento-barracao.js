/**
 * Checklist leve do barracão (Carnaval) — sem ERP de escola de samba.
 * Persistência: Departamento.meta.barracao.items[id] = { done, note? }
 */

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
  if (!meta || typeof meta !== 'object') return {}
  const barracao = /** @type {{ barracao?: { items?: unknown } }} */ (meta).barracao
  if (!barracao?.items || typeof barracao.items !== 'object') return {}
  /** @type {Record<string, { done: boolean, note?: string }>} */
  const out = {}
  for (const [id, raw] of Object.entries(barracao.items)) {
    if (!raw || typeof raw !== 'object') continue
    const row = /** @type {{ done?: unknown, note?: unknown }} */ (raw)
    out[id] = {
      done: Boolean(row.done),
      ...(typeof row.note === 'string' && row.note.trim() ? { note: row.note.trim() } : {}),
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
  const base =
    meta && typeof meta === 'object' ? { .../** @type {Record<string, unknown>} */ (meta) } : {}
  const prevBarracao =
    base.barracao && typeof base.barracao === 'object'
      ? { .../** @type {Record<string, unknown>} */ (base.barracao) }
      : {}
  const prevItems =
    prevBarracao.items && typeof prevBarracao.items === 'object'
      ? { .../** @type {Record<string, unknown>} */ (prevBarracao.items) }
      : {}
  const prevItem =
    prevItems[itemId] && typeof prevItems[itemId] === 'object'
      ? { .../** @type {Record<string, unknown>} */ (prevItems[itemId]) }
      : {}
  prevItems[itemId] = { ...prevItem, done }
  return { ...base, barracao: { ...prevBarracao, items: prevItems } }
}

/**
 * @param {unknown} meta
 * @returns {{ total: number, done: number }}
 */
export function barracaoProgress(meta) {
  const items = barracaoItemsFromMeta(meta)
  let done = 0
  for (const def of BARRACAO_CHECKLIST) {
    if (items[def.id]?.done) done += 1
  }
  return { total: BARRACAO_CHECKLIST.length, done }
}
