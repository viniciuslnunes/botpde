import { describe, expect, it } from 'vitest'
import {
  podeAbrirDepartamentoPortal,
  resolverDepartamentosHub,
  type DeptoHubBase,
} from '@/lib/departamentos-portal-access'

const base = (partial: Partial<DeptoHubBase> & Pick<DeptoHubBase, 'id' | 'slug' | 'nome'>): DeptoHubBase => ({
  cor: '#000',
  permissions: [],
  permissionsGestor: [],
  moduloPortal: null,
  ordem: 0,
  ...partial,
})

describe('departamentos portal access', () => {
  const diretoria = base({ id: 'd1', slug: 'diretoria', nome: 'Diretoria', ordem: 1 })
  const financeiro = base({ id: 'd2', slug: 'financeiro', nome: 'Financeiro', ordem: 2 })
  const bateria = base({ id: 'd3', slug: 'bateria', nome: 'Bateria', ordem: 3 })

  it('membro comum só vê áreas de atuação', () => {
    const items = resolverDepartamentosHub({
      todos: [diretoria, financeiro, bateria],
      membershipIds: ['d2'],
      gestorIds: [],
      diretoriaId: 'd1',
    })
    expect(items.map((i) => i.slug)).toEqual(['financeiro'])
    expect(items[0]?.isAtuacao).toBe(true)
    expect(items[0]?.visaoDiretoria).toBe(false)
    expect(items[0]?.isGestor).toBe(false)
  })

  it('diretoria vê todas; gestão só onde é gestor', () => {
    const items = resolverDepartamentosHub({
      todos: [diretoria, financeiro, bateria],
      membershipIds: ['d1'],
      gestorIds: ['d1'],
      diretoriaId: 'd1',
    })
    expect(items.map((i) => i.slug)).toEqual(['diretoria', 'financeiro', 'bateria'])
    const fin = items.find((i) => i.slug === 'financeiro')
    expect(fin?.visaoDiretoria).toBe(true)
    expect(fin?.isGestor).toBe(false)
    const dir = items.find((i) => i.slug === 'diretoria')
    expect(dir?.isGestor).toBe(true)
    expect(dir?.isAtuacao).toBe(true)
  })

  it('pode abrir: atuação ou diretoria', () => {
    expect(
      podeAbrirDepartamentoPortal({
        departamentoId: 'd2',
        membershipIds: ['d1'],
        diretoriaId: 'd1',
      }),
    ).toBe(true)
    expect(
      podeAbrirDepartamentoPortal({
        departamentoId: 'd3',
        membershipIds: ['d2'],
        diretoriaId: 'd1',
      }),
    ).toBe(false)
  })
})
