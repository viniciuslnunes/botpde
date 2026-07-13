import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks de banco e auth ───────────────────────────────────────────────────────
const perfilFindUnique = vi.hoisted(() => vi.fn())
const membroFindFirst = vi.hoisted(() => vi.fn())
const membroFindUnique = vi.hoisted(() => vi.fn())
const membroCreate = vi.hoisted(() => vi.fn())
const membroUpdate = vi.hoisted(() => vi.fn())
const afiliacaoFindUnique = vi.hoisted(() => vi.fn())
const perfilUpsert = vi.hoisted(() => vi.fn())
const tenantFindFirst = vi.hoisted(() => vi.fn())
const tenantFindMany = vi.hoisted(() => vi.fn())
const sedeFindMany = vi.hoisted(() => vi.fn())
const departamentoFindFirst = vi.hoisted(() => vi.fn())
const userDepartamentoUpsert = vi.hoisted(() => vi.fn())
const auditLogCreate = vi.hoisted(() => vi.fn())
const authFn = vi.hoisted(() => vi.fn())
const redirectFn = vi.hoisted(() => vi.fn(() => { throw new Error('REDIRECT') }))

vi.mock('@torcida/db', () => ({
  db: {
    perfilTorcedor: { findUnique: perfilFindUnique, upsert: perfilUpsert },
    saasMembro: { findFirst: membroFindFirst, findUnique: membroFindUnique, create: membroCreate, update: membroUpdate },
    afiliacao: { findUnique: afiliacaoFindUnique },
    tenant: { findFirst: tenantFindFirst, findMany: tenantFindMany },
    sede: { findMany: sedeFindMany },
    departamento: { findFirst: departamentoFindFirst },
    userDepartamento: { upsert: userDepartamentoUpsert },
    auditLog: { create: auditLogCreate },
  },
}))
vi.mock('@/lib/auth', () => ({ auth: authFn }))
vi.mock('next/navigation', () => ({ redirect: redirectFn }))
vi.mock('@/lib/tenant', () => ({
  buildPortalUrl: (slug: string) => `/portal/comunidade?torcida=${slug}`,
}))
// `setTenantContextSlug` usa cookies() do Next — indisponível fora de request.
vi.mock('@/lib/tenant-context', () => ({ setTenantContextSlug: vi.fn() }))

import { getEstadoOnboarding } from '@/lib/onboarding'
import { salvarClubeRegiao, solicitarVinculo, concluirComoTorcedor } from '@/app/onboarding/actions'

const UUID = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'
const PROVA_URL = 'https://res.cloudinary.com/demo/image/upload/sample.jpg'

const vinculoBase = {
  tenantId: UUID,
  nome: 'Fulano da Silva',
  imagemProva: PROVA_URL,
}

beforeEach(() => {
  vi.clearAllMocks()
  authFn.mockResolvedValue({ user: { id: 'u1', name: 'Fulano' } })
})

describe('getEstadoOnboarding', () => {
  it('reporta perfil e ausência de vínculo', async () => {
    perfilFindUnique.mockResolvedValue({ afiliacaoId: null, regiao: null, onboardingConcluidoEm: null })
    membroFindFirst.mockResolvedValue(null)
    const r = await getEstadoOnboarding('u1')
    expect(r.perfil).not.toBeNull()
    expect(r.temMembro).toBe(false)
  })

  it('temMembro=true quando existe SaasMembro', async () => {
    perfilFindUnique.mockResolvedValue(null)
    membroFindFirst.mockResolvedValue({ id: 'm1' })
    const r = await getEstadoOnboarding('u1')
    expect(r.temMembro).toBe(true)
    expect(r.perfil).toBeNull()
  })
})

describe('salvarClubeRegiao', () => {
  it('rejeita afiliacaoId não-uuid', async () => {
    const r = await salvarClubeRegiao({ afiliacaoId: 'nope' })
    expect(r.errors?.afiliacaoId).toBeTruthy()
    expect(afiliacaoFindUnique).not.toHaveBeenCalled()
  })

  it('erra quando afiliacao não existe', async () => {
    afiliacaoFindUnique.mockResolvedValue(null)
    const r = await salvarClubeRegiao({ afiliacaoId: UUID })
    expect(r.errors?.afiliacaoId).toContain('Clube não encontrado')
  })

  it('faz upsert com sucesso', async () => {
    afiliacaoFindUnique.mockResolvedValue({ id: UUID })
    perfilUpsert.mockResolvedValue({})
    const r = await salvarClubeRegiao({ afiliacaoId: UUID, regiao: 'São Paulo - SP' })
    expect(r.ok).toBe(true)
    expect(perfilUpsert).toHaveBeenCalled()
  })

  it('exige login', async () => {
    authFn.mockResolvedValue(null)
    const r = await salvarClubeRegiao({ afiliacaoId: UUID })
    expect(r.message).toBeTruthy()
  })
})

describe('solicitarVinculo — validação', () => {
  it('rejeita tipo inválido', async () => {
    // @ts-expect-error tipo inválido de propósito
    const r = await solicitarVinculo({ tenantId: UUID, tipo: 'INVALIDO', nome: 'Fulano da Silva' })
    expect(r.errors?.tipo).toBeTruthy()
  })

  it('rejeita nome curto', async () => {
    const r = await solicitarVinculo({ tenantId: UUID, tipo: 'TORCEDOR', nome: 'ab', imagemProva: PROVA_URL })
    expect(r.errors?.nome).toBeTruthy()
  })

  it('erra quando tenant não existe', async () => {
    tenantFindFirst.mockResolvedValue(null)
    const r = await solicitarVinculo({ ...vinculoBase, tipo: 'TORCEDOR' })
    expect(r.message).toBeTruthy()
  })

  it('cria SaasMembro + AuditLog e conclui onboarding (torcedor)', async () => {
    tenantFindFirst.mockResolvedValue({ id: UUID, slug: 'torcida-teste', nome: 'Torcida Teste' })
    sedeFindMany.mockResolvedValue([{ id: 's1' }])
    membroFindUnique.mockResolvedValue(null)
    membroCreate.mockResolvedValue({ id: 'novo' })
    await expect(
      solicitarVinculo({ tenantId: UUID, tipo: 'TORCEDOR', nome: 'Fulano da Silva', imagemProva: PROVA_URL }),
    ).rejects.toThrow('REDIRECT')
    expect(membroCreate).toHaveBeenCalled()
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'CADASTRO_SOLICITADO' }) }),
    )
    expect(perfilUpsert).toHaveBeenCalled()
  })

  it('sócio com departamento associa via UserDepartamento', async () => {
    tenantFindFirst.mockResolvedValue({ id: UUID, slug: 'torcida-teste', nome: 'Torcida Teste' })
    sedeFindMany.mockResolvedValue([])
    departamentoFindFirst.mockResolvedValue({ id: UUID2 })
    membroFindUnique.mockResolvedValue(null)
    membroCreate.mockResolvedValue({ id: 'novo' })
    await expect(
      solicitarVinculo({
        tenantId: UUID,
        tipo: 'SOCIO',
        nome: 'Fulano da Silva',
        departamentoId: UUID2,
        imagemProva: PROVA_URL,
      }),
    ).rejects.toThrow('REDIRECT')
    expect(userDepartamentoUpsert).toHaveBeenCalled()
  })

  it('bloqueia quando já APROVADO', async () => {
    tenantFindFirst.mockResolvedValue({ id: UUID, slug: 'torcida-teste', nome: 'Torcida Teste' })
    sedeFindMany.mockResolvedValue([{ id: 's1' }])
    membroFindUnique.mockResolvedValue({ id: 'm1', status: 'APROVADO' })
    const r = await solicitarVinculo({ ...vinculoBase, tipo: 'TORCEDOR' })
    expect(r.message).toContain('já é membro aprovado')
  })
})

describe('concluirComoTorcedor', () => {
  it('faz upsert e redireciona', async () => {
    perfilUpsert.mockResolvedValue({})
    await expect(concluirComoTorcedor()).rejects.toThrow('REDIRECT')
    expect(perfilUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ onboardingConcluidoEm: expect.any(Date) }),
      }),
    )
  })
})
