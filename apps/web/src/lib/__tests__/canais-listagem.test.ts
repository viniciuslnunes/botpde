import { describe, expect, it } from 'vitest'
import {
  agruparCanaisPorSecao,
  canalCombinaUfCidade,
  classificarSecaoCanal,
  listarCidadesCanais,
  listarUfsCanais,
} from '../canais-listagem'
import type { CanalItem } from '../canais-shared'

function canal(partial: Partial<CanalItem> & Pick<CanalItem, 'id' | 'tenantId' | 'nome'>): CanalItem {
  return {
    descricao: null,
    avatarUrl: null,
    institucional: true,
    canalOficial: true,
    ehCanalDepartamento: false,
    visibilidadeCanal: 'ALIADOS',
    somenteAdminPublica: false,
    publica: false,
    membros: 0,
    souMembro: false,
    souAdmin: false,
    pedidoPendente: false,
    silenciada: false,
    tenantNome: 'Torcida',
    tenantLogoUrl: null,
    tipoUnidade: 'PONTO_ENCONTRO',
    cidade: null,
    estado: null,
    lat: null,
    lng: null,
    podeVincularUnidade: false,
    podeTrocarUnidade: false,
    podeDesvincularUnidade: false,
    vinculoUnidadeLiberaEm: null,
    ...partial,
  }
}

describe('canais-listagem', () => {
  it('classifica sua unidade, perto e demais', () => {
    const sua = canal({ id: '1', tenantId: 't1', nome: 'Sede', lat: -23.5, lng: -46.6 })
    const perto = canal({
      id: '2',
      tenantId: 't2',
      nome: 'PDE perto',
      lat: -23.55,
      lng: -46.65,
      cidade: 'São Paulo',
      estado: 'SP',
    })
    const longe = canal({
      id: '3',
      tenantId: 't3',
      nome: 'PDE longe',
      lat: -3.1,
      lng: -60.0,
      cidade: 'Manaus',
      estado: 'AM',
    })
    const loc = { lat: -23.55, lng: -46.63 }

    expect(classificarSecaoCanal(sua, 't1', loc)).toBe('sua')
    expect(classificarSecaoCanal(perto, 't1', loc)).toBe('perto')
    expect(classificarSecaoCanal(longe, 't1', loc)).toBe('demais')
    expect(classificarSecaoCanal(perto, 't1', null)).toBe('demais')
  })

  it('agrupa preservando ordem e omitindo seções vazias', () => {
    const items = [
      canal({ id: 'a', tenantId: 't1', nome: 'A' }),
      canal({ id: 'b', tenantId: 't2', nome: 'B', lat: -23.55, lng: -46.65 }),
      canal({ id: 'c', tenantId: 't3', nome: 'C' }),
    ]
    const grupos = agruparCanaisPorSecao(items, 't1', { lat: -23.55, lng: -46.63 })
    expect(grupos.map((g) => g.secao)).toEqual(['sua', 'perto', 'demais'])
    expect(grupos[0]!.canais.map((c) => c.id)).toEqual(['a'])
    expect(grupos[1]!.canais.map((c) => c.id)).toEqual(['b'])
    expect(grupos[2]!.canais.map((c) => c.id)).toEqual(['c'])
  })

  it('filtra e lista UF/cidade', () => {
    const items = [
      canal({ id: '1', tenantId: 't', nome: 'A', cidade: 'Taubaté', estado: 'SP' }),
      canal({ id: '2', tenantId: 't', nome: 'B', cidade: 'Londrina', estado: 'PR' }),
      canal({ id: '3', tenantId: 't', nome: 'C', cidade: 'Sorocaba', estado: 'sp' }),
    ]
    expect(listarUfsCanais(items)).toEqual(['PR', 'SP'])
    expect(listarCidadesCanais(items, 'SP')).toEqual(['Sorocaba', 'Taubaté'])
    expect(canalCombinaUfCidade(items[0]!, 'SP', null)).toBe(true)
    expect(canalCombinaUfCidade(items[0]!, 'PR', null)).toBe(false)
    expect(canalCombinaUfCidade(items[0]!, 'SP', 'Taub')).toBe(true)
  })
})
