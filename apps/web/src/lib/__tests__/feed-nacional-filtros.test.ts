import { beforeEach, describe, expect, it, vi } from 'vitest'

const findManySeguimento = vi.hoisted(() => vi.fn())
const findManyPost = vi.hoisted(() => vi.fn())
const findFirstTenant = vi.hoisted(() => vi.fn())
const getTenantIdsPorAfiliacao = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: {
    seguimento: { findMany: findManySeguimento },
    post: { findMany: findManyPost },
    tenant: { findFirst: findFirstTenant },
  },
}))

vi.mock('@/lib/comunidade-contexto', () => ({ getTenantIdsPorAfiliacao }))
vi.mock('@/lib/comunidade', () => ({ getFeedComunidade: vi.fn() }))
vi.mock('@/lib/hierarquia', () => ({ getVisibleTenantIds: vi.fn() }))
vi.mock('@/lib/perfil-social', () => ({
  getAutoresSemAcesso: vi.fn().mockResolvedValue(new Set()),
  getContagensSeguimentoEmLote: vi.fn().mockResolvedValue(new Map()),
  resolverAvatarSocial: vi.fn(),
  podeVerConteudoSocial: vi.fn(),
  resolverPerfilPrivadoEfetivo: vi.fn(),
}))
vi.mock('@/lib/social', () => ({ getSeguimentoStatus: vi.fn() }))
vi.mock('@/lib/autor-badges', () => ({
  enriquecerPostsComBadges: vi.fn((posts: unknown[]) => Promise.resolve(posts)),
}))
vi.mock('@/lib/noticias', () => ({ getNoticiasAprovadas: vi.fn() }))
vi.mock('@/lib/feed-timeline', () => ({ garantirTimelineDaRedeDoViewer: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))

import {
  getPostsFeedNacional,
  getPostsFeedNacionalSeguindo,
  getPostsFeedNacionalGrupos,
} from '@/lib/feed'

const postRaw = {
  id: 'p1',
  tenantId: 'syn-1',
  titulo: null,
  conteudo: 'oi',
  imagemUrl: null,
  midiaUrls: [],
  tipo: 'MEMBRO',
  visibilidade: 'PUBLICO',
  fixado: false,
  criadoEm: new Date('2026-07-01T12:00:00Z'),
  autorId: 'u2',
  postOrigemId: null,
  comunicadoOrigemId: null,
  eventoId: null,
  conversaId: null,
  oculto: false,
  alcanceNacional: false,
  tenant: { nome: 'CN' },
  autor: { id: 'u2', nome: 'Autor', nickname: null, avatarUrl: null },
  postOrigem: null,
  comunicadoOrigem: null,
  evento: null,
  enquete: null,
  conversa: null,
  reacoes: [],
  comentarios: [],
  _count: { reacoes: 0, comentarios: 0 },
}

describe('getPostsFeedNacional', () => {
  beforeEach(() => {
    findManySeguimento.mockReset()
    findManyPost.mockReset()
    findFirstTenant.mockReset()
    getTenantIdsPorAfiliacao.mockReset()
    getTenantIdsPorAfiliacao.mockResolvedValue(['syn-1', 't1'])
    findFirstTenant.mockResolvedValue({ id: 'syn-1' })
  })

  it('não usa autorId in:[] quando o viewer não segue ninguém', async () => {
    findManySeguimento.mockResolvedValue([])
    findManyPost.mockResolvedValue([])

    await getPostsFeedNacional('af-1', 'u1')

    expect(findManyPost).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ tenant: { sintetico: true } }, { alcanceNacional: true }],
        }),
      }),
    )
  })
})

describe('getPostsFeedNacionalSeguindo', () => {
  beforeEach(() => {
    findManySeguimento.mockReset()
    findManyPost.mockReset()
    getTenantIdsPorAfiliacao.mockReset()
    getTenantIdsPorAfiliacao.mockResolvedValue(['syn-1', 't1'])
  })

  it('retorna vazio sem seguidos aprovados', async () => {
    findManySeguimento.mockResolvedValue([])
    const result = await getPostsFeedNacionalSeguindo('af-1', 'u1')
    expect(result.posts).toEqual([])
    expect(findManyPost).not.toHaveBeenCalled()
  })

  it('filtra PUBLICO + afiliação + autores seguidos, sem conversa', async () => {
    findManySeguimento.mockResolvedValue([{ seguidoId: 'u2' }])
    findManyPost.mockResolvedValue([postRaw])

    await getPostsFeedNacionalSeguindo('af-1', 'u1')

    expect(findManyPost).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: { in: ['syn-1', 't1'] },
          visibilidade: 'PUBLICO',
          conversaId: null,
          autorId: { in: ['u2'] },
        }),
      }),
    )
  })
})

describe('getPostsFeedNacionalGrupos', () => {
  beforeEach(() => {
    findFirstTenant.mockReset()
    findManyPost.mockReset()
  })

  it('retorna vazio sem tenant sintético', async () => {
    findFirstTenant.mockResolvedValue(null)
    const result = await getPostsFeedNacionalGrupos('af-1', 'u1')
    expect(result.posts).toEqual([])
    expect(findManyPost).not.toHaveBeenCalled()
  })

  it('restringe ao tenant sintético e murais dos grupos do viewer', async () => {
    findFirstTenant.mockResolvedValue({ id: 'syn-1' })
    findManyPost.mockResolvedValue([])

    await getPostsFeedNacionalGrupos('af-1', 'u1')

    expect(findFirstTenant).toHaveBeenCalledWith({
      where: { afiliacaoId: 'af-1', sintetico: true, ativo: true },
      select: { id: true },
    })
    expect(findManyPost).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'syn-1',
          conversa: expect.objectContaining({
            tipo: 'GRUPO',
            comunidade: true,
          }),
        }),
      }),
    )
  })
})
