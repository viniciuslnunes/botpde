import { describe, it, expect } from 'vitest'
import {
  deveListarCanalDepartamentoNaComunidade,
  deveManterCanalDeptoNoInbox,
  filtrarLiderancaOperadorPlataforma,
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

  it('liderança do tenant (owner/vice/admin) entra ADMIN em todo depto', () => {
    const roster = rosterCanalDepartamento({
      membros: ['u1'],
      gestores: ['g1'],
      lideranca: ['owner1', 'u1'],
    })
    expect(roster.get('u1')).toBe('ADMIN')
    expect(roster.get('g1')).toBe('ADMIN')
    expect(roster.get('owner1')).toBe('ADMIN')
  })

  it('área inclui gestores do departamento pai como ADMIN', () => {
    const roster = rosterCanalArea({
      membrosArea: ['u1'],
      gestoresDepartamento: ['g1'],
    })
    expect(roster.get('u1')).toBe('MEMBRO')
    expect(roster.get('g1')).toBe('ADMIN')
  })

  it('área também recebe liderança do tenant como ADMIN', () => {
    const roster = rosterCanalArea({
      membrosArea: ['u1'],
      gestoresDepartamento: ['g1'],
      lideranca: ['vice1'],
    })
    expect(roster.get('vice1')).toBe('ADMIN')
  })

  it('nome canônico da frente', () => {
    expect(nomeCanalArea('Social e eventos', 'Agasalho')).toBe('Social e eventos · Agasalho')
  })
})

describe('filtrarLiderancaOperadorPlataforma', () => {
  it('mantém liderança comum e dual-hat; remove SA sem vínculo local', () => {
    expect(
      filtrarLiderancaOperadorPlataforma({
        liderancaIds: ['pres', 'sa-operador', 'sa-presidente'],
        superAdminUserIds: ['sa-operador', 'sa-presidente'],
        userIdsComVinculoLocal: ['sa-presidente'],
      }),
    ).toEqual(['pres', 'sa-presidente'])
  })

  it('sem allowlist SA, devolve liderança intacta (dedup)', () => {
    expect(
      filtrarLiderancaOperadorPlataforma({
        liderancaIds: ['a', 'a', 'b'],
        superAdminUserIds: [],
        userIdsComVinculoLocal: [],
      }),
    ).toEqual(['a', 'b'])
  })
})

describe('deveManterCanalDeptoNoInbox', () => {
  it('conversa comum sempre; depto/área só com vínculo local no tenant', () => {
    expect(
      deveManterCanalDeptoNoInbox({
        ehCanalDepartamentoOuArea: false,
        tenantIdCanal: 'u1',
        tenantIdsComVinculoLocal: [],
      }),
    ).toBe(true)
    expect(
      deveManterCanalDeptoNoInbox({
        ehCanalDepartamentoOuArea: true,
        tenantIdCanal: 'visitada',
        tenantIdsComVinculoLocal: new Set(['casa']),
      }),
    ).toBe(false)
    expect(
      deveManterCanalDeptoNoInbox({
        ehCanalDepartamentoOuArea: true,
        tenantIdCanal: 'casa',
        tenantIdsComVinculoLocal: new Set(['casa']),
      }),
    ).toBe(true)
  })
})

describe('deveListarCanalDepartamentoNaComunidade', () => {
  it('canal comum sempre lista; depto/área só se membro ativo no tenant dono', () => {
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
    expect(
      deveListarCanalDepartamentoNaComunidade({
        ehCanalDepartamentoOuArea: true,
        souMembroAtivo: true,
        tenantIdCanal: 'gavioes',
        viewerTenantId: 'gavioes',
      }),
    ).toBe(true)
    expect(
      deveListarCanalDepartamentoNaComunidade({
        ehCanalDepartamentoOuArea: true,
        souMembroAtivo: true,
        tenantIdCanal: 'gavioes',
        viewerTenantId: 'pde-prudente',
      }),
    ).toBe(false)
    expect(
      deveListarCanalDepartamentoNaComunidade({
        ehCanalDepartamentoOuArea: true,
        souMembroAtivo: false,
        tenantIdCanal: 'gavioes',
        viewerTenantId: 'gavioes',
        leituraSuperAdmin: true,
      }),
    ).toBe(true)
    expect(
      deveListarCanalDepartamentoNaComunidade({
        ehCanalDepartamentoOuArea: true,
        souMembroAtivo: false,
        tenantIdCanal: 'gavioes',
        viewerTenantId: 'outra',
        leituraSuperAdmin: true,
      }),
    ).toBe(false)
  })
})
