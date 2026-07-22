import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueTenant = vi.hoisted(() => vi.fn())
const findUniqueMembro = vi.hoisted(() => vi.fn())
const findManyMembro = vi.hoisted(() => vi.fn())
const findManySeguimento = vi.hoisted(() => vi.fn())
const findManyPerfil = vi.hoisted(() => vi.fn())
const findManyPerfilTorcedor = vi.hoisted(() => vi.fn())
const findManyPost = vi.hoisted(() => vi.fn())
const resolveVisibleTenantIdsForFeed = vi.hoisted(() => vi.fn())
const canFollowUsers = vi.hoisted(() => vi.fn())
const getContagensSeguimentoEmLote = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    tenant: { findUnique: findUniqueTenant },
    saasMembro: { findUnique: findUniqueMembro, findMany: findManyMembro },
    seguimento: { findMany: findManySeguimento },
    perfilMembro: { findMany: findManyPerfil },
    perfilTorcedor: { findMany: findManyPerfilTorcedor },
    post: { findMany: findManyPost },
    bloqueioUsuario: { findMany: vi.fn().mockResolvedValue([]) },
  },
  Prisma: { sql: vi.fn(), join: vi.fn(), empty: '' },
}))

vi.mock('@/lib/feed', () => ({
  resolveVisibleTenantIdsForFeed,
  postIncludeBusca: vi.fn(),
  projetarPostBusca: vi.fn(),
}))

vi.mock('@/lib/social', () => ({ canFollowUsers }))

vi.mock('@/lib/perfil-social', () => ({
  getAutoresSemAcesso: vi.fn().mockResolvedValue(new Set()),
  getContagensSeguimentoEmLote,
  resolverAvatarSocial: (url: string | null) => url,
  resolverPerfilPrivadoEfetivo: () => false,
}))

vi.mock('@/lib/autor-badges', () => ({
  enriquecerPostsComBadges: vi.fn((posts: unknown) => Promise.resolve(posts)),
}))

vi.mock('@/lib/canais', () => ({
  buscarCanaisEUnidades: vi.fn().mockResolvedValue({ canais: [], unidades: [] }),
}))

vi.mock('@torcida/types', () => ({
  formatNomeTorcida: (n: string) => n,
}))

vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))

import { getSugestoesMembrosParaBusca } from '@/lib/comunidade-busca'

describe('getSugestoesMembrosParaBusca — Comunidade Nacional', () => {
  beforeEach(() => {
    findUniqueTenant.mockReset()
    findUniqueMembro.mockReset()
    findManyMembro.mockReset()
    findManySeguimento.mockReset()
    findManyPerfil.mockReset()
    findManyPerfilTorcedor.mockReset()
    findManyPost.mockReset()
    resolveVisibleTenantIdsForFeed.mockReset()
    canFollowUsers.mockReset()
    getContagensSeguimentoEmLote.mockReset()

    findUniqueTenant.mockResolvedValue({
      sintetico: true,
      afiliacaoId: 'af-corinthians',
      afiliacao: { nome: 'Corinthians', apelido: 'Timão' },
    })
    findUniqueMembro.mockResolvedValue(null)
    findManySeguimento.mockResolvedValue([])
    findManyPerfil.mockResolvedValue([])
    findManyPerfilTorcedor.mockResolvedValue([])
    findManyPost.mockResolvedValue([])
    findManyMembro.mockResolvedValue([])
    getContagensSeguimentoEmLote.mockResolvedValue(new Map())
    resolveVisibleTenantIdsForFeed.mockResolvedValue(['syn-cn', 'to-gavioes'])
  })

  it('prioriza torcedores do PerfilTorcedor sobre sócios de TO', async () => {
    findManyMembro.mockResolvedValue([
      {
        userId: 'socio-1',
        tenantId: 'to-gavioes',
        tipo: 'SOCIO',
        cidade: 'SP',
        sedeId: null,
        user: { id: 'socio-1', nome: 'Sócio Ana', avatarUrl: null },
        tenant: { nome: 'Gaviões' },
        sede: null,
      },
    ])
    findManyPerfilTorcedor.mockResolvedValue([
      {
        userId: 'torc-1',
        bio: 'Fiel',
        regiao: 'Campinas',
        user: { id: 'torc-1', nome: 'Torcedor Bruno', avatarUrl: null },
      },
    ])
    canFollowUsers.mockResolvedValue(
      new Map([
        ['socio-1', true],
        ['torc-1', true],
      ]),
    )

    const sugestoes = await getSugestoesMembrosParaBusca('syn-cn', 'u1')

    expect(findManyPerfilTorcedor).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ afiliacaoId: 'af-corinthians' }),
      }),
    )
    expect(sugestoes[0]?.id).toBe('torc-1')
    expect(sugestoes[0]?.tipoMembro).toBe('TORCEDOR')
    expect(sugestoes[0]?.tenantNome).toBe('Timão')
    expect(sugestoes.some((s) => s.id === 'socio-1')).toBe(true)
  })

  it('usa tenants do feed (TOs do clube) e não só o sintético vazio', async () => {
    findManyMembro.mockResolvedValue([
      {
        userId: 'u2',
        tenantId: 'to-gavioes',
        tipo: 'SOCIO',
        cidade: 'SP',
        sedeId: null,
        user: { id: 'u2', nome: 'Ana', avatarUrl: null },
        tenant: { nome: 'Gaviões' },
        sede: null,
      },
    ])
    canFollowUsers.mockResolvedValue(new Map([['u2', true]]))

    const sugestoes = await getSugestoesMembrosParaBusca('syn-cn', 'u1')

    expect(resolveVisibleTenantIdsForFeed).toHaveBeenCalledWith('syn-cn', 'u1')
    expect(canFollowUsers).toHaveBeenCalledWith('u1', ['u2'], null)
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]?.tenantNome).toBe('Gaviões')
  })

  it('retorna vazio quando o feed não expõe tenants', async () => {
    resolveVisibleTenantIdsForFeed.mockResolvedValue([])
    const sugestoes = await getSugestoesMembrosParaBusca('syn-cn', 'u1')
    expect(sugestoes).toEqual([])
    expect(findManyMembro).not.toHaveBeenCalled()
  })
})
