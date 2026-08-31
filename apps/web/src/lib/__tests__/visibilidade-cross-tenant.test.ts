import { describe, expect, it } from 'vitest'
import {
  canViewRecurso,
  podeDescobrirTorcida,
  relationFromLineage,
  resolveVisibility,
  SENSIBILIDADE,
} from '@torcida/types'

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

  it('allied vê apenas recurso público, nunca restrito', () => {
    expect(resolveVisibility('allied', SENSIBILIDADE.PUBLICO)).toBe(true)
    expect(resolveVisibility('allied', SENSIBILIDADE.RESTRITO)).toBe(false)
  })

  it('rival não vê nada — nem recurso público', () => {
    expect(resolveVisibility('rival', SENSIBILIDADE.PUBLICO)).toBe(false)
    expect(resolveVisibility('rival', SENSIBILIDADE.RESTRITO)).toBe(false)
    expect(canViewRecurso('rival', 'comunidade')).toBe(false)
    expect(canViewRecurso('rival', 'memoria')).toBe(false)
    expect(canViewRecurso('rival', 'loja')).toBe(false)
    expect(canViewRecurso('rival', 'eventos')).toBe(false)
    expect(canViewRecurso('rival', 'membros')).toBe(false)
  })
})

describe('podeDescobrirTorcida', () => {
  it('rival é inexistente — nem a vitrine pública', () => {
    expect(podeDescobrirTorcida('rival')).toBe(false)
  })

  it('hierarquia e aliados descobrem; unrelated pode avaliar aliança', () => {
    expect(podeDescobrirTorcida('self')).toBe(true)
    expect(podeDescobrirTorcida('ancestor')).toBe(true)
    expect(podeDescobrirTorcida('descendant')).toBe(true)
    expect(podeDescobrirTorcida('allied')).toBe(true)
    expect(podeDescobrirTorcida('unrelated')).toBe(true)
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

  it('tenant aliado vê recursos públicos, mas não vê dados restritos', () => {
    expect(canViewRecurso('allied', 'eventos')).toBe(true)
    expect(canViewRecurso('allied', 'loja')).toBe(true)
    expect(canViewRecurso('allied', 'memoria')).toBe(true)
    expect(canViewRecurso('allied', 'membros')).toBe(false)
    expect(canViewRecurso('allied', 'socios')).toBe(false)
  })
})

describe('relationFromLineage (VIN-18 — direção da relação)', () => {
  it('alvo é ancestral do ator → ator é descendant (PDE olhando a sede)', () => {
    expect(relationFromLineage(true, false)).toBe('descendant')
  })

  it('alvo é descendente do ator → ator é ancestor (sede olhando o PDE)', () => {
    expect(relationFromLineage(false, true)).toBe('ancestor')
  })

  it('sem parentesco → unrelated', () => {
    expect(relationFromLineage(false, false)).toBe('unrelated')
  })

  it('regressão da inversão: PDE nunca ganha acesso a restrito da sede via linhagem', () => {
    // Antes do VIN-18, o alvo-ancestral virava relation 'ancestor' e liberava
    // RESTRITO indevidamente. A combinação correta nega:
    const relation = relationFromLineage(true, false)
    expect(canViewRecurso(relation, 'membros')).toBe(false)
    expect(canViewRecurso(relation, 'socios')).toBe(false)
    expect(canViewRecurso(relation, 'financeiro')).toBe(false)
    expect(canViewRecurso(relation, 'patrimonio')).toBe(false)
    // ...e mantém o público visível (comportamento existente preservado):
    expect(canViewRecurso(relation, 'loja')).toBe(true)
    expect(canViewRecurso(relation, 'comunidade')).toBe(true)
  })

  it('sede mantém acesso total aos descendentes (público + restrito)', () => {
    const relation = relationFromLineage(false, true)
    expect(canViewRecurso(relation, 'membros')).toBe(true)
    expect(canViewRecurso(relation, 'eventos')).toBe(true)
  })
})
