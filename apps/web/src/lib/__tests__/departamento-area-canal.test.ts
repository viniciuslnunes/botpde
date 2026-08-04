import { describe, it, expect } from 'vitest'
import {
  deveListarCanalDepartamentoNaComunidade,
  nomeCanalArea,
  rosterCanalArea,
  rosterCanalDepartamento,
  validarVinculoCanalArea,
} from '@torcida/types'

describe('validarVinculoCanalArea', () => {
  it('null conversa = desvincular, sempre ok', () => {
    expect(
      validarVinculoCanalArea({
        conversaId: null,
        areaId: 'a1',
        usadoPorDepartamentoId: 'd1',
      }),
    ).toBeNull()
  })

  it('recusa canal de sede / departamento / outra área', () => {
    expect(
      validarVinculoCanalArea({
        conversaId: 'c1',
        areaId: 'a1',
        usadoPorSedeId: 's1',
      }),
    ).toMatch(/unidade/)
    expect(
      validarVinculoCanalArea({
        conversaId: 'c1',
        areaId: 'a1',
        usadoPorDepartamentoId: 'd1',
      }),
    ).toMatch(/departamento/)
    expect(
      validarVinculoCanalArea({
        conversaId: 'c1',
        areaId: 'a1',
        usadoPorAreaId: 'a2',
      }),
    ).toMatch(/outra área/)
  })

  it('permite re-vincular o mesmo canal à própria área', () => {
    expect(
      validarVinculoCanalArea({
        conversaId: 'c1',
        areaId: 'a1',
        usadoPorAreaId: 'a1',
      }),
    ).toBeNull()
  })
})

describe('rosterCanalDepartamento / rosterCanalArea', () => {
  it('gestor vira ADMIN e membro vira MEMBRO; gestor sobrescreve', () => {
    const roster = rosterCanalDepartamento({
      membros: ['u1', 'u2'],
      gestores: ['u2'],
    })
    expect(roster.get('u1')).toBe('MEMBRO')
    expect(roster.get('u2')).toBe('ADMIN')
  })

  it('área inclui gestores do departamento pai como ADMIN', () => {
    const roster = rosterCanalArea({
      membrosArea: ['u1'],
      gestoresDepartamento: ['g1'],
    })
    expect(roster.get('u1')).toBe('MEMBRO')
    expect(roster.get('g1')).toBe('ADMIN')
  })

  it('nome canônico da frente', () => {
    expect(nomeCanalArea('Social e eventos', 'Agasalho')).toBe('Social e eventos · Agasalho')
  })
})

describe('deveListarCanalDepartamentoNaComunidade', () => {
  it('canal comum sempre lista; depto/área só se membro ativo', () => {
    expect(
      deveListarCanalDepartamentoNaComunidade({
        ehCanalDepartamentoOuArea: false,
        souMembroAtivo: false,
      }),
    ).toBe(true)
    expect(
      deveListarCanalDepartamentoNaComunidade({
        ehCanalDepartamentoOuArea: true,
        souMembroAtivo: false,
      }),
    ).toBe(false)
    expect(
      deveListarCanalDepartamentoNaComunidade({
        ehCanalDepartamentoOuArea: true,
        souMembroAtivo: true,
      }),
    ).toBe(true)
  })
})
