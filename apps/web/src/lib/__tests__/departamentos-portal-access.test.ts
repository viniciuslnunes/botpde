import { describe, expect, it } from 'vitest'
import {
  podeAbrirDepartamentoPortal,
  resolverAreasDepartamento,
  resolverDepartamentosHub,
  type AreaBase,
  type DeptoHubBase,
} from '@/lib/departamentos-portal-access'
import {
  kindDepartamento,
  resolverModuloPortalDepartamento,
  rotuloAreaDepartamento,
} from '@torcida/types'

const base = (
  partial: Partial<DeptoHubBase> & Pick<DeptoHubBase, 'id' | 'slug' | 'nome'>,
): DeptoHubBase => ({
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

describe('resolverAreasDepartamento', () => {
  const areaBase = (
    partial: Partial<AreaBase> & Pick<AreaBase, 'id' | 'slug' | 'nome'>,
  ): AreaBase => ({
    descricao: null,
    icone: null,
    ordem: 0,
    ativa: true,
    sazonal: false,
    ...partial,
  })

  const agasalho = areaBase({ id: 'a1', slug: 'campanha-do-agasalho', nome: 'Campanha do Agasalho', ordem: 1 })
  const inclusao = areaBase({ id: 'a2', slug: 'inclusao-digital', nome: 'Inclusão Digital', ordem: 2 })

  it('responsável de área NÃO recebe podeGerir', () => {
    const items = resolverAreasDepartamento({
      areas: [agasalho, inclusao],
      membroAreaIds: ['a1'],
      responsavelAreaIds: ['a1'],
      isGestorDepartamento: false,
    })
    const item = items.find((i) => i.id === 'a1')
    expect(item?.isResponsavel).toBe(true)
    expect(item?.podeGerir).toBe(false)
  })

  it('gestor do departamento recebe podeGerir em TODAS as áreas, mesmo onde não é membro', () => {
    const items = resolverAreasDepartamento({
      areas: [agasalho, inclusao],
      membroAreaIds: [],
      responsavelAreaIds: [],
      isGestorDepartamento: true,
    })
    expect(items.every((i) => i.podeGerir)).toBe(true)
    expect(items.every((i) => i.isMembro === false)).toBe(true)
  })

  it('super-admin recebe podeGerir em todas as áreas', () => {
    const items = resolverAreasDepartamento({
      areas: [agasalho, inclusao],
      membroAreaIds: [],
      responsavelAreaIds: [],
      isGestorDepartamento: false,
      isSuperAdmin: true,
    })
    expect(items.every((i) => i.podeGerir)).toBe(true)
  })

  it('ordenação: minha área inativa antes de área ativa que não é minha', () => {
    const minhaInativa = areaBase({ id: 'a3', slug: 'ensaios', nome: 'Ensaios', ordem: 1, ativa: false })
    const items = resolverAreasDepartamento({
      areas: [inclusao, minhaInativa],
      membroAreaIds: ['a3'],
      responsavelAreaIds: [],
      isGestorDepartamento: false,
    })
    expect(items.map((i) => i.id)).toEqual(['a3', 'a2'])
  })

  it('aceita arrays em vez de Set com o mesmo resultado', () => {
    const viaSet = resolverAreasDepartamento({
      areas: [agasalho, inclusao],
      membroAreaIds: new Set(['a1']),
      responsavelAreaIds: new Set(['a1']),
      isGestorDepartamento: false,
    })
    const viaArray = resolverAreasDepartamento({
      areas: [agasalho, inclusao],
      membroAreaIds: ['a1'],
      responsavelAreaIds: ['a1'],
      isGestorDepartamento: false,
    })
    expect(viaArray).toEqual(viaSet)
  })
})

describe('rotulos e moduloPortal canonicos', () => {
  it('bateria/caravanas ignoram moduloPortal stale eventos no banco', () => {
    expect(resolverModuloPortalDepartamento('bateria', 'eventos')).toBe('bateria')
    expect(resolverModuloPortalDepartamento('caravanas', 'eventos')).toBe('caravanas')
    expect(rotuloAreaDepartamento('bateria', 'eventos')).toMatch(/Ensaios/i)
    expect(rotuloAreaDepartamento('caravanas', 'eventos')).toMatch(/Viagens/i)
  })

  it('thin wrappers deixam claro que compõem outro módulo', () => {
    expect(rotuloAreaDepartamento('feminino', 'comunidade')).toMatch(/Via/i)
    expect(rotuloAreaDepartamento('social-e-eventos', 'eventos')).toMatch(/Via/i)
    expect(rotuloAreaDepartamento('comunicacao', 'comunidade')).toMatch(/Via/i)
  })

  it('carnaval é plugin de barracão (não thin Compõe)', () => {
    expect(kindDepartamento('carnaval')).toBe('plugin')
    expect(rotuloAreaDepartamento('carnaval', 'eventos')).toMatch(/barracão/i)
  })
})
