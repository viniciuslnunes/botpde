import { describe, it, expect } from 'vitest'
import {
  addAreaChecklistItem,
  applyAreaChecklistModelo,
  AREA_CHECKLIST_MAX_ITENS,
  checklistItemsFromMeta,
  checklistProgress,
  removeAreaChecklistItem,
  toggleAreaChecklistItem,
} from '@torcida/types'

describe('checklistItemsFromMeta', () => {
  it('meta vazio ou inválido = lista vazia', () => {
    expect(checklistItemsFromMeta(null)).toEqual([])
    expect(checklistItemsFromMeta({})).toEqual([])
    expect(checklistItemsFromMeta({ checklist: { items: 'x' } })).toEqual([])
  })

  it('lê itens válidos e ignora lixo', () => {
    const items = checklistItemsFromMeta({
      checklist: {
        items: [
          { id: 'a', label: 'Coleta', done: true },
          { id: '', label: 'sem id' },
          { label: 'sem id 2', done: false },
          { id: 'b', label: '  Entrega  ', done: false },
        ],
      },
    })
    expect(items).toEqual([
      { id: 'a', label: 'Coleta', done: true },
      { id: 'b', label: 'Entrega', done: false },
    ])
  })
})

describe('add / toggle / remove', () => {
  it('adiciona, marca e remove sem perder outros campos de meta', () => {
    const base = { corPreferida: 'x' }
    const add = addAreaChecklistItem(base, 'Divulgação', 'divulgacao')
    expect('error' in add).toBe(false)
    if ('error' in add) return
    expect(add.meta).toMatchObject({ corPreferida: 'x' })
    expect(add.item).toEqual({ id: 'divulgacao', label: 'Divulgação', done: false })

    const toggled = toggleAreaChecklistItem(add.meta, 'divulgacao', true)
    expect(checklistProgress(toggled)).toEqual({ total: 1, done: 1 })

    const removed = removeAreaChecklistItem(toggled, 'divulgacao')
    expect(checklistItemsFromMeta(removed)).toEqual([])
    expect(removed).toMatchObject({ corPreferida: 'x' })
  })

  it('rejeita label curto e teto de itens', () => {
    expect(addAreaChecklistItem(null, 'a')).toMatchObject({ error: expect.any(String) })
    let meta: unknown = null
    for (let i = 0; i < AREA_CHECKLIST_MAX_ITENS; i++) {
      const r = addAreaChecklistItem(meta, `Item ${i}`, `item-${i}`)
      expect('error' in r).toBe(false)
      if ('error' in r) return
      meta = r.meta
    }
    expect(addAreaChecklistItem(meta, 'Extra', 'extra')).toMatchObject({
      error: expect.stringMatching(/No máximo/),
    })
  })
})

describe('applyAreaChecklistModelo', () => {
  it('aplica modelo Agasalho sem duplicar ids', () => {
    const first = applyAreaChecklistModelo(null, 'campanha-do-agasalho')
    expect('error' in first).toBe(false)
    if ('error' in first) return
    expect(first.adicionados).toBeGreaterThan(0)
    expect(checklistItemsFromMeta(first.meta).length).toBe(first.adicionados)

    const second = applyAreaChecklistModelo(first.meta, 'campanha-do-agasalho')
    expect(second).toMatchObject({ error: expect.any(String) })
  })

  it('slug sem modelo falha', () => {
    expect(applyAreaChecklistModelo(null, 'inexistente')).toMatchObject({
      error: expect.any(String),
    })
  })
})
