import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  membroFindUnique: vi.fn(),
  socioFindFirst: vi.fn(),
  socioUpdate: vi.fn(),
  socioDelete: vi.fn(),
  auditCreate: vi.fn(),
  emitirCarteirinhaInterna: vi.fn(async (_params: unknown) => ({
    id: 'socio-novo',
    numeroSocio: 145191,
    validade: new Date('2027-08-01'),
    jaExistia: false,
  })),
}))

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: { findUnique: mocks.membroFindUnique },
    saasSocio: {
      findFirst: mocks.socioFindFirst,
      update: mocks.socioUpdate,
      delete: mocks.socioDelete,
    },
    auditLog: { create: mocks.auditCreate },
  },
}))

vi.mock('../carteirinha-emissao', () => ({
  emitirCarteirinhaInterna: (params: unknown) => mocks.emitirCarteirinhaInterna(params),
}))

import {
  espelharCarteirinhaDoTenant,
  espelharRenovacaoCarteirinha,
  espelharRevogacaoCarteirinha,
  resolverParDoSocio,
} from '../carteirinha-espelho'

const PDE = 'tenant-pde'
const SEDE = 'tenant-sede'
const USER = 'user-1'

const origem = {
  id: 'membro-pde',
  tenantId: PDE,
  userId: USER,
  nome: 'Vinícius Lopes Nunes',
  numeroAssociado: '145191',
  tipo: 'SOCIO',
  status: 'APROVADO',
  desligadoEm: null,
}

const espelho = {
  id: 'membro-sede',
  tenantId: SEDE,
  userId: USER,
  nome: 'Vinícius Lopes Nunes',
  numeroAssociado: '145191',
  tipo: 'SOCIO',
  status: 'APROVADO',
  desligadoEm: null,
}

/** Sequência de `saasMembro.findUnique`: alvo → flags do alvo → par. */
function comPar(alvo: typeof origem, flags: object, par: object | null): void {
  mocks.membroFindUnique
    .mockResolvedValueOnce(alvo)
    .mockResolvedValueOnce(flags)
    .mockResolvedValueOnce(par)
}

describe('resolverParDoSocio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolve origem → espelho na Sede', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, espelho)

    await expect(resolverParDoSocio(PDE, USER)).resolves.toMatchObject({
      tenantId: SEDE,
      numeroAssociado: '145191',
    })
  })

  it('resolve espelho → origem na unidade', async () => {
    comPar(
      espelho,
      { espelhado: true, membroOrigemId: 'membro-pde' },
      origem,
    )

    await expect(resolverParDoSocio(SEDE, USER)).resolves.toMatchObject({
      tenantId: PDE,
    })
  })

  it('ignora par desligado ou não aprovado', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, {
      ...espelho,
      desligadoEm: new Date(),
    })

    await expect(resolverParDoSocio(PDE, USER)).resolves.toBeNull()
  })

  it('ignora torcida sem Sede acima (sem par)', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, null)

    await expect(resolverParDoSocio(PDE, USER)).resolves.toBeNull()
  })
})

describe('espelharCarteirinhaDoTenant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('emite no par com o mesmo nº e a mesma validade', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, espelho)
    mocks.socioFindFirst
      // carteirinha da origem (fonte)
      .mockResolvedValueOnce({ validade: new Date('2027-08-01'), expedidoEm: new Date('2026-08-01') })
      // carteirinha existente no par: nenhuma
      .mockResolvedValueOnce(null)

    await espelharCarteirinhaDoTenant({ tenantId: PDE, userId: USER, atorId: 'admin' })

    expect(mocks.emitirCarteirinhaInterna).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: SEDE,
        userId: USER,
        numeroAssociado: '145191',
        validade: new Date('2027-08-01'),
        espelhoDeTenantId: PDE,
      }),
    )
  })

  it('não emite quando o tenant de origem não tem carteirinha', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, espelho)
    mocks.socioFindFirst.mockResolvedValueOnce(null)

    await espelharCarteirinhaDoTenant({ tenantId: PDE, userId: USER, atorId: 'admin' })

    expect(mocks.emitirCarteirinhaInterna).not.toHaveBeenCalled()
  })

  it('é idempotente: par com a mesma validade não é reescrito', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, espelho)
    mocks.socioFindFirst
      .mockResolvedValueOnce({ validade: new Date('2027-08-01'), expedidoEm: null })
      .mockResolvedValueOnce({ id: 'socio-sede', validade: new Date('2027-08-01') })

    await espelharCarteirinhaDoTenant({ tenantId: PDE, userId: USER, atorId: 'admin' })

    expect(mocks.emitirCarteirinhaInterna).not.toHaveBeenCalled()
    expect(mocks.socioUpdate).not.toHaveBeenCalled()
  })
})

describe('espelharRenovacaoCarteirinha', () => {
  beforeEach(() => vi.clearAllMocks())

  it('alinha a validade do par', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, espelho)
    mocks.socioFindFirst
      .mockResolvedValueOnce({ expedidoEm: null })
      .mockResolvedValueOnce({ id: 'socio-sede', validade: new Date('2027-01-01') })

    await espelharRenovacaoCarteirinha({
      tenantId: PDE,
      userId: USER,
      validade: new Date('2028-01-01'),
      atorId: 'admin',
    })

    expect(mocks.socioUpdate).toHaveBeenCalledWith({
      where: { id: 'socio-sede' },
      data: { validade: new Date('2028-01-01') },
    })
  })

  it('emite no par quando ele ainda não tem carteirinha (legado)', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, espelho)
    mocks.socioFindFirst
      .mockResolvedValueOnce({ expedidoEm: null })
      .mockResolvedValueOnce(null)

    await espelharRenovacaoCarteirinha({
      tenantId: PDE,
      userId: USER,
      validade: new Date('2028-01-01'),
      atorId: 'admin',
    })

    expect(mocks.emitirCarteirinhaInterna).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: SEDE, validade: new Date('2028-01-01') }),
    )
  })
})

describe('espelharRevogacaoCarteirinha', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devolve o nº ao pool nos dois tenants', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, espelho)
    mocks.socioFindFirst.mockResolvedValueOnce({
      id: 'socio-sede',
      nome: 'Vinícius Lopes Nunes',
      numeroSocio: 145191,
    })

    await espelharRevogacaoCarteirinha({ tenantId: PDE, userId: USER, atorId: 'admin' })

    expect(mocks.socioDelete).toHaveBeenCalledWith({ where: { id: 'socio-sede' } })
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: SEDE,
          acao: 'SOCIO_CARTEIRINHA_REVOGADA',
        }),
      }),
    )
  })

  it('não falha quando o par não tem carteirinha', async () => {
    comPar(origem, { espelhado: false, membroOrigemId: null }, espelho)
    mocks.socioFindFirst.mockResolvedValueOnce(null)

    await espelharRevogacaoCarteirinha({ tenantId: PDE, userId: USER, atorId: 'admin' })

    expect(mocks.socioDelete).not.toHaveBeenCalled()
  })
})
