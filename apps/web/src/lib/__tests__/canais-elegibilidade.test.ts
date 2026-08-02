import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  conversaFindUnique: vi.fn(),
  membroFindUnique: vi.fn(),
  socioFindUnique: vi.fn(),
  sedeFindFirst: vi.fn(),
  membroConversaUpsert: vi.fn(),
}))

vi.mock('@torcida/db', () => ({
  db: {
    conversa: { findUnique: mocks.conversaFindUnique },
    saasMembro: { findUnique: mocks.membroFindUnique },
    saasSocio: { findUnique: mocks.socioFindUnique },
    sede: { findFirst: mocks.sedeFindFirst },
    membroConversa: { upsert: mocks.membroConversaUpsert },
  },
}))

import { assertElegibilidadeMembroCanal, vincularMembroCanaisAposAprovacao } from '../canais'

describe('assertElegibilidadeMembroCanal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.conversaFindUnique.mockResolvedValue({
      tipo: 'CANAL',
      comunidade: false,
      tenantId: 'tenant-local',
      tenant: { sintetico: false },
    })
  })

  it('recusa PENDENTE sem vínculo local', async () => {
    mocks.membroFindUnique.mockResolvedValue(null)

    await expect(
      assertElegibilidadeMembroCanal('canal', 'aliado', 'PENDENTE'),
    ).rejects.toThrow('vínculo com a torcida deste canal')
  })

  it('recusa ATIVO quando o vínculo local ainda não foi aprovado', async () => {
    mocks.membroFindUnique.mockResolvedValue({
      status: 'PENDENTE',
      tipo: 'SOCIO',
      desligadoEm: null,
    })

    await expect(
      assertElegibilidadeMembroCanal('canal', 'membro', 'ATIVO'),
    ).rejects.toThrow('ainda não foi aprovado')
  })

  it('permite ATIVO com vínculo local aprovado', async () => {
    mocks.membroFindUnique.mockResolvedValue({
      status: 'APROVADO',
      tipo: 'TORCEDOR',
      desligadoEm: null,
    })

    await expect(
      assertElegibilidadeMembroCanal('canal', 'membro', 'ATIVO'),
    ).resolves.toBeUndefined()
  })

  it('preserva exceção de tenant sintético sem consultar SaasMembro', async () => {
    mocks.conversaFindUnique.mockResolvedValue({
      tipo: 'CANAL',
      comunidade: false,
      tenantId: 'cn',
      tenant: { sintetico: true },
    })

    await expect(
      assertElegibilidadeMembroCanal('canal-cn', 'torcedor-global', 'ATIVO'),
    ).resolves.toBeUndefined()
    expect(mocks.membroFindUnique).not.toHaveBeenCalled()
  })

  it('aceita vínculo na unidade dona quando o canal está emprestado no tenant da mãe', async () => {
    // Caso B: PDE promovido a tenant próprio cujo `Sede.canalConversaId` ainda
    // aponta para uma Conversa do tenant da mãe. Sem isso, quem entra pelo link
    // da unidade era barrado do próprio canal e travava o onboarding.
    mocks.membroFindUnique.mockImplementation(
      async ({ where }: { where: { tenantId_userId: { tenantId: string } } }) =>
        where.tenantId_userId.tenantId === 'tenant-unidade'
          ? { status: 'APROVADO', tipo: 'TORCEDOR', desligadoEm: null }
          : null,
    )
    mocks.sedeFindFirst.mockResolvedValueOnce({ tenantId: 'tenant-unidade' })

    await expect(
      assertElegibilidadeMembroCanal('canal', 'torcedor-da-unidade', 'ATIVO'),
    ).resolves.toBeUndefined()
  })

  it('recusa quem não tem vínculo nem no tenant do canal nem na unidade dona', async () => {
    mocks.membroFindUnique.mockResolvedValue(null)
    mocks.sedeFindFirst.mockResolvedValueOnce({ tenantId: 'tenant-unidade' })

    await expect(
      assertElegibilidadeMembroCanal('canal', 'estranho', 'ATIVO'),
    ).rejects.toThrow('vínculo com a torcida deste canal')
  })

  it('vincula unidade + SEDE de forma idempotente', async () => {
    mocks.membroFindUnique.mockResolvedValue({
      status: 'APROVADO',
      tipo: 'TORCEDOR',
      desligadoEm: null,
    })
    mocks.sedeFindFirst
      .mockResolvedValueOnce({ canalConversaId: 'canal-unidade' })
      .mockResolvedValueOnce({ canalConversaId: 'canal-sede' })
      .mockResolvedValueOnce({ canalConversaId: 'canal-unidade' })
      .mockResolvedValueOnce({ canalConversaId: 'canal-sede' })
    mocks.membroConversaUpsert.mockResolvedValue({})

    const vincular = () =>
      vincularMembroCanaisAposAprovacao({
        tenantId: 'tenant-local',
        userId: 'membro',
        sedeId: 'unidade',
      })

    await vincular()
    await vincular()

    expect(mocks.membroConversaUpsert).toHaveBeenCalledTimes(4)
    expect(mocks.membroConversaUpsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { conversaId_userId: { conversaId: 'canal-unidade', userId: 'membro' } },
      }),
    )
    expect(mocks.membroConversaUpsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { conversaId_userId: { conversaId: 'canal-unidade', userId: 'membro' } },
      }),
    )
  })
})
