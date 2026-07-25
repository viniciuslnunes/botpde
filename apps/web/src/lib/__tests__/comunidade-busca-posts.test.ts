import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueTenant = vi.hoisted(() => vi.fn())
const findManySeguimento = vi.hoisted(() => vi.fn())
const findManyMembro = vi.hoisted(() => vi.fn())
const findManyHashtag = vi.hoisted(() => vi.fn())
const findManyPost = vi.hoisted(() => vi.fn())
const queryRaw = vi.hoisted(() => vi.fn())
const resolveVisibleTenantIdsForFeed = vi.hoisted(() => vi.fn())
const orFeedNacionalDescobrir = vi.hoisted(() => vi.fn())
const canFollowUsers = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    tenant: { findUnique: findUniqueTenant },
    seguimento: { findMany: findManySeguimento },
    saasMembro: { findMany: findManyMembro },
    hashtag: { findMany: findManyHashtag },
    post: { findMany: findManyPost },
    bloqueioUsuario: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: queryRaw,
  },
  // Stub tagged-template helpers como texto simples para inspecionar o SQL montado.
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((acc: string, s: string, i: number) => acc + s + (i < values.length ? String(values[i]) : ''), ''),
    join: (arr: readonly unknown[]) => arr.join(', '),
    empty: '',
  },
}))

vi.mock('@/lib/feed', () => ({
  resolveVisibleTenantIdsForFeed,
  orFeedNacionalDescobrir,
  postIncludeBusca: vi.fn().mockReturnValue({}),
  projetarPostBusca: vi.fn((p: unknown) => p),
}))

vi.mock('@/lib/social', () => ({ canFollowUsers }))

vi.mock('@/lib/perfil-social', () => ({
  getAutoresSemAcesso: vi.fn().mockResolvedValue(new Set()),
  getContagensSeguimentoEmLote: vi.fn().mockResolvedValue(new Map()),
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

import { buscarComunidade } from '@/lib/comunidade-busca'

const TENANT_SINTETICO = 'syn-cn'
const VISIBLE_TENANT_IDS = ['syn-cn', 'to-gavioes']

describe('buscarComunidade — posts na Comunidade Nacional', () => {
  beforeEach(() => {
    findUniqueTenant.mockReset()
    findManySeguimento.mockReset()
    findManyMembro.mockReset()
    findManyHashtag.mockReset()
    findManyPost.mockReset()
    queryRaw.mockReset()
    resolveVisibleTenantIdsForFeed.mockReset()
    orFeedNacionalDescobrir.mockReset()
    canFollowUsers.mockReset()

    // Tenant sintético da CN — usado tanto por `resolveFollowContextoId` quanto
    // pelo fallback de torcedores globais dentro de `buscarMembrosComunidade`.
    findUniqueTenant.mockResolvedValue({
      sintetico: true,
      afiliacaoId: 'af-corinthians',
      afiliacao: { nome: 'Corinthians', apelido: 'Timão' },
    })
    findManySeguimento.mockResolvedValue([{ seguidoId: 'seg-1' }])
    findManyMembro.mockResolvedValue([])
    findManyHashtag.mockResolvedValue([])
    findManyPost.mockResolvedValue([])
    resolveVisibleTenantIdsForFeed.mockResolvedValue(VISIBLE_TENANT_IDS)
    orFeedNacionalDescobrir.mockImplementation((seguidos: string[]) => [
      { tenant: { sintetico: true } },
      ...(seguidos.length > 0 ? [{ autorId: { in: seguidos } }] : []),
      { alcanceNacional: true },
    ])
    canFollowUsers.mockResolvedValue(new Map())
    // Sem pg_trgm quebrando: todas as consultas raw retornam vazio por padrão.
    queryRaw.mockResolvedValue([])
  })

  it('inclui o gate nacional (sintético ∪ alcanceNacional ∪ seguidos) na busca SQL de posts', async () => {
    await buscarComunidade(TENANT_SINTETICO, 'u1', 'vitoria', { modo: 'completa' })

    const chamadaPosts = queryRaw.mock.calls.find((call) => {
      const strings = call[0] as unknown as readonly string[]
      return strings.join(' ').includes('saas_posts')
    })

    expect(chamadaPosts).toBeDefined()
    const textoCompleto = [
      ...(chamadaPosts![0] as unknown as readonly string[]),
      ...chamadaPosts!.slice(1).map(String),
    ].join(' ')

    expect(textoCompleto).toContain('sintetico')
    expect(textoCompleto).toContain('alcance_nacional')
    expect(textoCompleto).toContain('seg-1')
    // Não pode se apoiar só no tenant_id IN (visibleTenantIds) sem o gate extra.
    expect(textoCompleto).not.toBe(`p.tenant_id IN (${VISIBLE_TENANT_IDS.join(', ')})`)
  })

  it('aplica o mesmo gate no fallback ILIKE quando pg_trgm está indisponível', async () => {
    queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const texto = Array.from(strings).join(' ')
      if (texto.includes('saas_posts')) {
        return Promise.reject(new Error('function similarity(text, text) does not exist'))
      }
      return Promise.resolve([])
    })
    findManyPost.mockResolvedValue([{ id: 'post-1', autorId: 'autor-1' }])

    await buscarComunidade(TENANT_SINTETICO, 'u1', 'vitoria', { modo: 'completa' })

    expect(orFeedNacionalDescobrir).toHaveBeenCalledWith(['seg-1'])
    expect(findManyPost).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: { in: VISIBLE_TENANT_IDS },
          visibilidade: 'PUBLICO',
          OR: [
            { tenant: { sintetico: true } },
            { autorId: { in: ['seg-1'] } },
            { alcanceNacional: true },
          ],
        }),
      }),
    )
  })
})
