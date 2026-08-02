import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  conversaFindUnique: vi.fn(),
  membroFindUnique: vi.fn(),
  socioFindUnique: vi.fn(),
  sedeFindFirst: vi.fn(),
  membroConversaUpsert: vi.fn(),
  resolverTenantRaizId: vi.fn(async (id: string) => id),
  getTorcidaLineageTenantIds: vi.fn(async (id: string) => [id]),
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

vi.mock('../membros-sede', () => ({
  resolverTenantRaizId: (id: string) => mocks.resolverTenantRaizId(id),
}))

vi.mock('../hierarquia', () => ({
  getTorcidaLineageTenantIds: (id: string) => mocks.getTorcidaLineageTenantIds(id),
  getDescendantTenantIds: vi.fn(async () => []),
  getTenantRelation: vi.fn(async () => 'self'),
  getVisibleTenantIds: vi.fn(async () => []),
}))

import {
  assertElegibilidadeMembroCanal,
  podePublicarNoCanal,
  vincularMembroCanaisAposAprovacao,
} from '../canais'

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
    mocks.resolverTenantRaizId.mockResolvedValue('tenant-local')
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

  it('SOCIO Caso B também entra no canal oficial da Sede mãe', async () => {
    mocks.membroFindUnique.mockResolvedValue({
      status: 'APROVADO',
      tipo: 'SOCIO',
      desligadoEm: null,
    })
    mocks.resolverTenantRaizId.mockResolvedValue('tenant-gavioes')
    mocks.sedeFindFirst
      .mockResolvedValueOnce({ canalConversaId: 'canal-cubatao' })
      .mockResolvedValueOnce({ canalConversaId: 'canal-oficial-cubatao' })
      .mockResolvedValueOnce({ canalConversaId: 'canal-gavioes' })
    mocks.membroConversaUpsert.mockResolvedValue({})

    await vincularMembroCanaisAposAprovacao({
      tenantId: 'tenant-cubatao',
      userId: 'lider',
      sedeId: 'unidade-cubatao',
      tipo: 'SOCIO',
    })

    const canais = mocks.membroConversaUpsert.mock.calls.map(
      (c) => (c[0] as { where: { conversaId_userId: { conversaId: string } } }).where
        .conversaId_userId.conversaId,
    )
    expect(canais).toEqual(
      expect.arrayContaining(['canal-cubatao', 'canal-oficial-cubatao', 'canal-gavioes']),
    )
    expect(canais).toHaveLength(3)
  })

  it('TORCEDOR entra só no canal da unidade — nunca no da Sede', async () => {
    // Ele pertence à subsede/PDE que o convidou, não à organizada; o canal da
    // Sede é espaço de sócio.
    mocks.membroFindUnique.mockResolvedValue({
      status: 'APROVADO',
      tipo: 'TORCEDOR',
      desligadoEm: null,
    })
    mocks.sedeFindFirst.mockResolvedValueOnce({ canalConversaId: 'canal-unidade' })
    mocks.membroConversaUpsert.mockResolvedValue({})

    await vincularMembroCanaisAposAprovacao({
      tenantId: 'tenant-local',
      userId: 'torcedor',
      sedeId: 'unidade',
      tipo: 'TORCEDOR',
    })

    expect(mocks.membroConversaUpsert).toHaveBeenCalledTimes(1)
    expect(mocks.membroConversaUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversaId_userId: { conversaId: 'canal-unidade', userId: 'torcedor' } },
      }),
    )
  })

  it('TORCEDOR vinculado direto na Sede (sem unidade) entra no canal principal', async () => {
    // Sem canal de unidade não há o que preservar: o principal é o dele mesmo.
    mocks.membroFindUnique.mockResolvedValue({
      status: 'APROVADO',
      tipo: 'TORCEDOR',
      desligadoEm: null,
    })
    // `sedeId: null` pula a busca da unidade — o único findFirst é o da raiz.
    mocks.sedeFindFirst.mockResolvedValueOnce({ canalConversaId: 'canal-sede' })
    mocks.membroConversaUpsert.mockResolvedValue({})

    await vincularMembroCanaisAposAprovacao({
      tenantId: 'tenant-local',
      userId: 'torcedor',
      sedeId: null,
      tipo: 'TORCEDOR',
    })

    expect(mocks.membroConversaUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversaId_userId: { conversaId: 'canal-sede', userId: 'torcedor' } },
      }),
    )
  })
})

describe('podePublicarNoCanal (canal emprestado Caso B)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTorcidaLineageTenantIds.mockImplementation(async (id: string) => [id])
  })

  it('libera quando o canal mora na Sede e o viewer é a PDE da worktree', async () => {
    mocks.getTorcidaLineageTenantIds.mockResolvedValueOnce(['tenant-cubatao', 'tenant-gavioes'])

    await expect(
      podePublicarNoCanal(
        { tenantId: 'tenant-gavioes', somenteAdminPublica: false, souAdmin: false },
        'tenant-cubatao',
        [],
      ),
    ).resolves.toBe(true)
  })

  it('bloqueia canal de worktree estranha', async () => {
    mocks.getTorcidaLineageTenantIds.mockResolvedValueOnce(['tenant-cubatao'])

    await expect(
      podePublicarNoCanal(
        { tenantId: 'tenant-outra', somenteAdminPublica: false, souAdmin: false },
        'tenant-cubatao',
        [],
      ),
    ).resolves.toBe(false)
  })
})
