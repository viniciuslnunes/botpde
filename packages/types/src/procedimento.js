/**
 * Procedimento — checklist leve como primitiva compartilhada.
 *
 * Três consumidores, dois modos de armazenamento em `meta` JSON:
 *
 * | Consumidor        | path            | Modo     |
 * |-------------------|-----------------|----------|
 * | Barracão Carnaval | `barracao`      | catálogo |
 * | Área de atuação   | `checklist`     | array    |
 * | Caravana/evento   | `procedimento`  | catálogo |
 *
 * Catálogo: defs fixas + estado em `meta[path].items[id] = { done, note? }`.
 * Array: itens livres em `meta[path].items[] = { id, label, done }`.
 * Sem ERP — não é task-tracker.
 */

/** @typedef {{ id: string, label: string }} ProcedimentoItemDef */
/** @typedef {{ id: string, label: string, done: boolean, note?: string }} ProcedimentoItem */

export const PROCEDIMENTO_LABEL_MAX = 80
export const PROCEDIMENTO_MAX_ITENS = 30

/**
 * @param {unknown} meta
 * @returns {Record<string, unknown>}
 */
function cloneMeta(meta) {
  return meta && typeof meta === 'object' ? { .../** @type {Record<string, unknown>} */ (meta) } : {}
}

/**
 * @param {unknown} meta
 * @param {string} path
 * @returns {Record<string, unknown> | null}
 */
function readBranch(meta, path) {
  if (!meta || typeof meta !== 'object') return null
  const branch = /** @type {Record<string, unknown>} */ (meta)[path]
  return branch && typeof branch === 'object'
    ? { .../** @type {Record<string, unknown>} */ (branch) }
    : null
}

/**
 * @param {unknown} meta
 * @param {string} path
 * @param {Record<string, unknown>} branch
 * @returns {object}
 */
function writeBranch(meta, path, branch) {
  return { ...cloneMeta(meta), [path]: branch }
}

// ─── Modo catálogo (record por id) ───────────────────────────────────────────

/**
 * @param {unknown} meta
 * @param {string} path
 * @returns {Record<string, { done: boolean, note?: string }>}
 */
export function procedimentoEstadoFromRecord(meta, path) {
  const branch = readBranch(meta, path)
  if (!branch?.items || typeof branch.items !== 'object') return {}
  /** @type {Record<string, { done: boolean, note?: string }>} */
  const out = {}
  for (const [id, raw] of Object.entries(
    /** @type {Record<string, unknown>} */ (branch.items),
  )) {
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
 * @param {string} path
 * @param {readonly ProcedimentoItemDef[]} catalog
 * @returns {ProcedimentoItem[]}
 */
export function procedimentoItemsFromCatalog(meta, path, catalog) {
  const estado = procedimentoEstadoFromRecord(meta, path)
  return catalog.map((def) => ({
    id: def.id,
    label: def.label,
    done: Boolean(estado[def.id]?.done),
    ...(estado[def.id]?.note ? { note: estado[def.id].note } : {}),
  }))
}

/**
 * @param {readonly ProcedimentoItem[]} items
 * @returns {{ total: number, done: number }}
 */
export function procedimentoProgress(items) {
  const list = Array.isArray(items) ? items : []
  return {
    total: list.length,
    done: list.filter((i) => i.done).length,
  }
}

/**
 * @param {unknown} meta
 * @param {string} path
 * @param {string} itemId
 * @param {boolean} done
 * @returns {object}
 */
export function toggleProcedimentoRecord(meta, path, itemId, done) {
  return mergeProcedimentoRecordItem(meta, path, itemId, { done: Boolean(done) })
}

/**
 * @param {unknown} meta
 * @param {string} path
 * @param {string} itemId
 * @param {{ done?: boolean, note?: string | null }} patch
 * @returns {object}
 */
export function mergeProcedimentoRecordItem(meta, path, itemId, patch) {
  const branch = readBranch(meta, path) ?? {}
  const prevItems =
    branch.items && typeof branch.items === 'object'
      ? { .../** @type {Record<string, unknown>} */ (branch.items) }
      : {}
  const prevItem =
    prevItems[itemId] && typeof prevItems[itemId] === 'object'
      ? { .../** @type {Record<string, unknown>} */ (prevItems[itemId]) }
      : {}
  const next = { ...prevItem }
  if (typeof patch.done === 'boolean') next.done = patch.done
  if (patch.note === null || patch.note === '') {
    delete next.note
  } else if (typeof patch.note === 'string' && patch.note.trim()) {
    next.note = patch.note.trim()
  }
  prevItems[itemId] = next
  return writeBranch(meta, path, { ...branch, items: prevItems })
}

// ─── Modo array (itens livres) ─────────────────────────────────────────────

/**
 * @param {unknown} meta
 * @param {string} path
 * @returns {ProcedimentoItem[]}
 */
export function procedimentoItemsFromArray(meta, path) {
  const branch = readBranch(meta, path)
  if (!branch?.items || !Array.isArray(branch.items)) return []
  /** @type {ProcedimentoItem[]} */
  const out = []
  for (const raw of branch.items) {
    if (!raw || typeof raw !== 'object') continue
    const row = /** @type {{ id?: unknown, label?: unknown, done?: unknown }} */ (raw)
    if (typeof row.id !== 'string' || !row.id.trim()) continue
    if (typeof row.label !== 'string' || !row.label.trim()) continue
    out.push({
      id: row.id.trim().slice(0, 64),
      label: row.label.trim().slice(0, PROCEDIMENTO_LABEL_MAX),
      done: Boolean(row.done),
    })
  }
  return out
}

/**
 * @param {unknown} meta
 * @param {string} path
 * @param {ProcedimentoItem[]} items
 * @returns {object}
 */
function writeProcedimentoArray(meta, path, items) {
  const branch = readBranch(meta, path) ?? {}
  return writeBranch(meta, path, { ...branch, items })
}

/**
 * @param {unknown} meta
 * @param {string} path
 * @param {string} itemId
 * @param {boolean} done
 * @returns {object}
 */
export function toggleProcedimentoArray(meta, path, itemId, done) {
  const items = procedimentoItemsFromArray(meta, path).map((i) =>
    i.id === itemId ? { ...i, done: Boolean(done) } : i,
  )
  return writeProcedimentoArray(meta, path, items)
}

/**
 * @param {unknown} meta
 * @param {string} path
 * @param {string} label
 * @param {string} [itemId]
 * @param {{ maxItens?: number, newId?: (label: string, suffix?: string) => string }} [opts]
 * @returns {{ meta: object, item: ProcedimentoItem } | { error: string }}
 */
export function addProcedimentoArrayItem(meta, path, label, itemId, opts = {}) {
  const texto = typeof label === 'string' ? label.trim() : ''
  if (texto.length < 2) return { error: 'Informe um item (mín. 2 caracteres)' }
  if (texto.length > PROCEDIMENTO_LABEL_MAX) return { error: 'Item muito longo' }

  const max = opts.maxItens ?? PROCEDIMENTO_MAX_ITENS
  const items = procedimentoItemsFromArray(meta, path)
  if (items.length >= max) return { error: `No máximo ${max} itens na checklist` }

  const id =
    typeof itemId === 'string' && itemId.trim()
      ? itemId.trim().slice(0, 64)
      : (opts.newId?.(texto) ?? `item-${Math.random().toString(36).slice(2, 8)}`)
  if (items.some((i) => i.id === id)) return { error: 'Item já existe' }

  /** @type {ProcedimentoItem} */
  const item = { id, label: texto, done: false }
  return { meta: writeProcedimentoArray(meta, path, [...items, item]), item }
}

/**
 * @param {unknown} meta
 * @param {string} path
 * @param {string} itemId
 * @returns {object}
 */
export function removeProcedimentoArrayItem(meta, path, itemId) {
  const items = procedimentoItemsFromArray(meta, path).filter((i) => i.id !== itemId)
  return writeProcedimentoArray(meta, path, items)
}

/**
 * @param {unknown} meta
 * @param {string} path
 * @param {readonly ProcedimentoItemDef[]} modelo
 * @param {{ maxItens?: number }} [opts]
 * @returns {{ meta: object, adicionados: number } | { error: string }}
 */
export function applyProcedimentoModelo(meta, path, modelo, opts = {}) {
  if (!modelo || modelo.length === 0) return { error: 'Modelo vazio' }
  const max = opts.maxItens ?? PROCEDIMENTO_MAX_ITENS
  const items = procedimentoItemsFromArray(meta, path)
  const ids = new Set(items.map((i) => i.id))
  /** @type {ProcedimentoItem[]} */
  const next = [...items]
  let adicionados = 0
  for (const def of modelo) {
    if (ids.has(def.id)) continue
    if (next.length >= max) break
    next.push({ id: def.id, label: def.label, done: false })
    ids.add(def.id)
    adicionados += 1
  }
  if (adicionados === 0) return { error: 'Modelo já aplicado (ou checklist cheia)' }
  return { meta: writeProcedimentoArray(meta, path, next), adicionados }
}
