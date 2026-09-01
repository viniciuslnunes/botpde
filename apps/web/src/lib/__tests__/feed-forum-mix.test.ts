import { describe, expect, it, vi } from 'vitest'

vi.mock('@torcida/db', () => ({ db: {}, Prisma: {} }))
vi.mock('@/lib/comunidade', () => ({ getFeedComunidade: vi.fn() }))
vi.mock('@/lib/comunidade-contexto', () => ({ getTenantIdsPorAfiliacao: vi.fn() }))
vi.mock('@/lib/hierarquia', () => ({ getVisibleTenantIds: vi.fn() }))
vi.mock('@/lib/perfil-social', () => ({
  getAutoresSemAcesso: vi.fn(),
  getContagensSeguimentoEmLote: vi.fn(),
  resolverAvatarSocial: vi.fn(),
  podeVerConteudoSocial: vi.fn(),
  resolverPerfilPrivadoEfetivo: vi.fn(),
}))
vi.mock('@/lib/social', () => ({ getSeguimentoStatus: vi.fn() }))
vi.mock('@/lib/autor-badges', () => ({ enriquecerPostsComBadges: vi.fn() }))
vi.mock('@/lib/noticias', () => ({ getNoticiasAprovadas: vi.fn() }))

import {
  ehItemForumFeed,
  projetarTopicoParaFeed,
  rankDescobrirPosts,
  scoreDescobrirPost,
  type PostSocialItem,
} from '@/lib/feed'
import type { TopicoParaFeed } from '@/lib/praca'

const agora = new Date('2026-08-30T12:00:00Z')

function postBase(over: Partial<PostSocialItem> = {}): PostSocialItem {
  return {
    id: 'p1',
    tenantId: 't1',
    titulo: null,
    conteudo: 'oi',
    imagemUrl: null,
    midiaUrls: [],
    tipo: 'MEMBRO',
    visibilidade: 'PUBLICO',
    fixado: false,
    criadoEm: agora,
    autorId: 'u1',
    postOrigemId: null,
    comunicadoOrigemId: null,
    eventoId: null,
    tenant: { nome: 'Gaviões', logoUrl: null },
    autor: {
      id: 'u1',
      nome: 'A',
      nickname: null,
      avatarUrl: null,
      sedeNome: null,
      sedeTipo: null,
      cargoNome: null,
      departamentoNome: null,
    },
    totalReacoes: 0,
    totalComentarios: 0,
    minhaReacao: null,
    postOrigem: null,
    comunicadoOrigem: null,
    evento: null,
    enquete: null,
    grupo: null,
    ...over,
  }
}

describe('fórum no Descobrir', () => {
  it('projeta mídia, apoio e respostas no mesmo shape do post', () => {
    const t: TopicoParaFeed = {
      id: 'f1',
      titulo: 'Palpite do clássico',
      corpo: 'Como vocês veem o meio-campo?',
      midiaUrls: ['https://res.cloudinary.com/demo/image/upload/v1/a.jpg'],
      criadoEm: agora,
      fixado: false,
      gostei: 4,
      naoGostei: 1,
      respostasCount: 3,
      tenantId: null,
      autor: { id: 'u9', nome: 'Chucky', nickname: 'chucky', avatarUrl: null },
      meuVoto: 1,
    }
    const item = projetarTopicoParaFeed(t, {
      escopo: 'nacional',
      tenantId: 'syn-1',
      tenant: { nome: 'TIMÃO', logoUrl: null },
    })
    expect(ehItemForumFeed(item)).toBe(true)
    expect(item.midiaUrls.length).toBe(1)
    expect(item.totalReacoes).toBe(4)
    expect(item.totalComentarios).toBe(3)
    expect(item.minhaReacao).toBe('CURTIR')
    expect(item.forum?.escopo).toBe('nacional')
  })

  it('ranqueia tópico com engajamento e mídia acima de post frio da mesma hora', () => {
    const frio = postBase({ id: 'post-frio' })
    const forum = postBase({
      id: 'f-quente',
      totalReacoes: 8,
      totalComentarios: 6,
      midiaUrls: ['https://res.cloudinary.com/demo/image/upload/v1/a.jpg'],
      forum: { escopo: 'nacional', gostei: 8, naoGostei: 0, meuVoto: null },
    })
    expect(scoreDescobrirPost(forum, 't1')).toBeGreaterThan(scoreDescobrirPost(frio, 't1'))
    const ranked = rankDescobrirPosts([frio, forum], 't1')
    expect(ranked.map((p) => p.id)).toEqual(['f-quente', 'post-frio'])
  })

  it('não empilha tópicos: mistura por score com os posts', () => {
    const viral = postBase({
      id: 'post-viral',
      totalReacoes: 40,
      totalComentarios: 20,
    })
    const forumA = postBase({
      id: 'f-a',
      totalReacoes: 2,
      forum: { escopo: 'torcida', gostei: 2, naoGostei: 0, meuVoto: null },
    })
    const forumB = postBase({
      id: 'f-b',
      totalReacoes: 1,
      forum: { escopo: 'torcida', gostei: 1, naoGostei: 0, meuVoto: null },
    })
    const meio = postBase({ id: 'post-meio', totalReacoes: 3 })
    const ranked = rankDescobrirPosts([forumA, forumB, meio, viral], 't1')
    expect(ranked.map((p) => p.id)).toEqual(['post-viral', 'post-meio', 'f-a', 'f-b'])
  })

  it('fixado do fórum não usa o boost institucional de 100k', () => {
    const forumFixado = postBase({
      id: 'f-pin',
      fixado: true,
      forum: { escopo: 'torcida', gostei: 0, naoGostei: 0, meuVoto: null },
    })
    const comunicado = postBase({
      id: 'com-1',
      tipo: 'INSTITUCIONAL',
      comunicadoOrigemId: 'c1',
    })
    expect(scoreDescobrirPost(forumFixado, 't1')).toBeLessThan(1_000)
    expect(scoreDescobrirPost(comunicado, 't1')).toBeGreaterThan(100_000)
  })
})
