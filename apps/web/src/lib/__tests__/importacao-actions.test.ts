import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  membroFindUnique: vi.fn(),
  membroCreate: vi.fn(),
  importacaoCreate: vi.fn(),
  importacaoUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  assertPermission: vi.fn(),
  vincularCanais: vi.fn(async () => undefined),
}))

vi.mock('@torcida/db', () => ({
  db: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
    },
    saasMembro: {
      findUnique: mocks.membroFindUnique,
      create: mocks.membroCreate,
    },
    importacaoMembros: {
      create: mocks.importacaoCreate,
      update: mocks.importacaoUpdate,
    },
    auditLog: { create: mocks.auditLogCreate },
  },
}))
vi.mock('@/lib/authz', () => ({ assertPermission: mocks.assertPermission }))
vi.mock('@/lib/social', () => ({
  privatizarPerfilAoAprovarSocio: vi.fn(async () => undefined),
}))
vi.mock('@/lib/canais', () => ({
  vincularMembroCanaisAposAprovacao: mocks.vincularCanais,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { importarMock } from '@/app/admin/membros/importar/actions'

describe('importarMock — canais de aprovados', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertPermission.mockResolvedValue({
      session: { user: { id: 'admin-1' } },
      tenant: { id: 'tenant-1' },
    })
    mocks.importacaoCreate.mockResolvedValue({ id: 'importacao-1' })
    mocks.importacaoUpdate.mockResolvedValue({})
    mocks.auditLogCreate.mockResolvedValue({})
  })

  it('vincula o TORCEDOR importado aos canais após persistir APROVADO', async () => {
    mocks.userFindUnique.mockResolvedValue(null)
    mocks.userCreate
      .mockResolvedValueOnce({ id: 'user-socio' })
      .mockResolvedValueOnce({ id: 'user-torcedor' })
    mocks.membroFindUnique.mockResolvedValue(null)
    mocks.membroCreate.mockResolvedValue({ id: 'membro-novo' })

    const formData = new FormData()
    // mockSource alterna: índice 0 SOCIO, índice 1 TORCEDOR.
    formData.set('quantidade', '2')
    const resultado = await importarMock(formData)

    expect(resultado).toEqual({
      success: true,
      importacaoId: 'importacao-1',
      importados: 2,
      duplicados: 0,
      erros: 0,
    })
    expect(mocks.membroCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'TORCEDOR',
          status: 'APROVADO',
          userId: 'user-torcedor',
        }),
      }),
    )
    expect(mocks.vincularCanais).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-torcedor',
      sedeId: null,
      fallbackCriadoPorId: 'user-torcedor',
      // Torcedor importado não pode ser inscrito no canal da Sede.
      tipo: 'TORCEDOR',
    })
  })

  it('reimportação idempotente cura canais de membro APROVADO existente', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'user-existente' })
    mocks.membroFindUnique.mockResolvedValue({
      id: 'membro-existente',
      status: 'APROVADO',
      sedeId: 'unidade-1',
      tipo: 'TORCEDOR',
    })

    mocks.importacaoCreate.mockResolvedValue({ id: 'importacao-2' })
    const formData = new FormData()
    formData.set('quantidade', '1')
    const resultado = await importarMock(formData)

    expect(resultado).toEqual({
      success: true,
      importacaoId: 'importacao-2',
      importados: 0,
      duplicados: 1,
      erros: 0,
    })
    expect(mocks.membroCreate).not.toHaveBeenCalled()
    expect(mocks.vincularCanais).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-existente',
      sedeId: 'unidade-1',
      fallbackCriadoPorId: 'user-existente',
      // O vínculo já gravado manda: reimportar não promove torcedor à Sede.
      tipo: 'TORCEDOR',
    })
  })
})
