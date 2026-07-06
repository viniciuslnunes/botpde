import { describe, expect, it } from 'vitest'
import { canViewRecurso, resolveVisibility, SENSIBILIDADE } from '@torcida/types'

describe('resolveVisibility', () => {
  it('self sempre vê, mesmo recurso restrito', () => {
    expect(resolveVisibility('self', SENSIBILIDADE.RESTRITO)).toBe(true)
  })

  it('ancestor (sede vendo subsede/PDE) vê inclusive recurso restrito', () => {
    expect(resolveVisibility('ancestor', SENSIBILIDADE.RESTRITO)).toBe(true)
  })

  it('descendant (subsede/PDE vendo a sede) só vê recurso público', () => {
    expect(resolveVisibility('descendant', SENSIBILIDADE.PUBLICO)).toBe(true)
    expect(resolveVisibility('descendant', SENSIBILIDADE.RESTRITO)).toBe(false)
  })

  it('unrelated não vê nada — nem recurso público (tenant A não enxerga tenant B)', () => {
    expect(resolveVisibility('unrelated', SENSIBILIDADE.PUBLICO)).toBe(false)
    expect(resolveVisibility('unrelated', SENSIBILIDADE.RESTRITO)).toBe(false)
  })
})

describe('canViewRecurso', () => {
  it('tenant sem relação de hierarquia não vê a loja (recurso público) de outro tenant', () => {
    expect(canViewRecurso('unrelated', 'loja')).toBe(false)
  })

  it('tenant sem relação de hierarquia não vê membros (recurso restrito) de outro tenant', () => {
    expect(canViewRecurso('unrelated', 'membros')).toBe(false)
  })

  it('sede (ancestor) vê membros restritos da subsede', () => {
    expect(canViewRecurso('ancestor', 'membros')).toBe(true)
  })

  it('subsede (descendant) não vê membros restritos da sede, mas vê eventos públicos', () => {
    expect(canViewRecurso('descendant', 'membros')).toBe(false)
    expect(canViewRecurso('descendant', 'eventos')).toBe(true)
  })
})
