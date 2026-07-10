import { db } from '@torcida/db'
import { getVisibleTenantIds } from './hierarquia'
import { canFollowUser, getSeguimentoStatus } from './social'
import { getContagensSeguimento, getAutoresSemAcesso, resolverAvatarSocial } from './perfil-social'
import { normalizarHashtag } from './comunidade-social'
import { postInclude, projetarPost, podeVerPost, type PostSocialItem, type PostRaw } from './feed'
import { enriquecerPostsComBadges } from './autor-badges'

export interface MembroBuscaItem {
  id: string
  nome: string | null
  avatarUrl: string | null
  tenantNome: string
  perfilPrivado: boolean
  statusSeguimento: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' | null
  seguidores: number
  podeSeguir: boolean
}

export interface BuscaComunidadeResult {
  membros: MembroBuscaItem[]
  hashtags: Array<{ tag: string; total: number }>
  posts: PostSocialItem[]
}

export async function buscarMembrosComunidade(
  tenantId: string,
  userId: string,
  q: string,
): Promise<MembroBuscaItem[]> {
  if (q.length < 2) return []

  const visibleIds = await getVisibleTenantIds(tenantId, 'comunidade')

  const bloqueios: { bloqueadorId: string; bloqueadoId: string }[] =
    await db.bloqueioUsuario.findMany({
      where: { OR: [{ bloqueadorId: userId }, { bloqueadoId: userId }] },
      select: { bloqueadorId: true, bloqueadoId: true },
    })
  const bloqueadosIds = new Set(
    bloqueios.map((b) => (b.bloqueadorId === userId ? b.bloqueadoId : b.bloqueadorId)),
  )

  interface MembroRow {
    userId: string
    tenantId: string
    user: { id: string; nome: string | null; avatarUrl: string | null }
    tenant: { nome: string }
  }

  const rows: MembroRow[] = await db.saasMembro.findMany({
    where: {
      status: 'APROVADO',
      tenantId: { in: visibleIds },
      userId: { not: userId },
      user: {
        OR: [
          { nome: { contains: q, mode: 'insensitive' } },
          {
            perfisMembro: {
              some: { bio: { contains: q, mode: 'insensitive' }, tenantId },
            },
          },
        ],
      },
    },
    select: {
      userId: true,
      tenantId: true,
      user: { select: { id: true, nome: true, avatarUrl: true } },
      tenant: { select: { nome: true } },
    },
    take: 40,
  })

  const vistos = new Set<string>()
  const membros: MembroBuscaItem[] = []

  for (const r of rows) {
    if (vistos.has(r.userId) || bloqueadosIds.has(r.userId)) continue
    vistos.add(r.userId)

    const perfil: { perfilPrivado: boolean; avatarUrl: string | null } | null =
      await db.perfilMembro.findUnique({
        where: { userId_tenantId: { userId: r.userId, tenantId } },
        select: { perfilPrivado: true, avatarUrl: true },
      })

    const [statusSeguimento, contagens, podeSeguir] = await Promise.all([
      getSeguimentoStatus(userId, r.userId),
      getContagensSeguimento(r.userId, tenantId),
      canFollowUser(userId, r.userId, tenantId),
    ])

    membros.push({
      id: r.user.id,
      nome: r.user.nome,
      avatarUrl: resolverAvatarSocial(perfil?.avatarUrl, r.user.avatarUrl),
      tenantNome: r.tenant.nome,
      perfilPrivado: perfil?.perfilPrivado ?? true,
      statusSeguimento,
      seguidores: contagens.seguidores,
      podeSeguir,
    })

    if (membros.length >= 20) break
  }

  return membros
}

export async function buscarComunidade(
  tenantId: string,
  userId: string,
  q: string,
): Promise<BuscaComunidadeResult> {
  const termo = q.trim()
  if (termo.length < 2) {
    return { membros: [], hashtags: [], posts: [] }
  }

  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  const normalizedTag = normalizarHashtag(termo.replace(/^#/, ''))

  const [membros, hashtagRows, postsRaw]: [
    MembroBuscaItem[],
    Array<{ tag: string; _count: { posts: number } }>,
    PostRaw[],
  ] = await Promise.all([
    buscarMembrosComunidade(tenantId, userId, termo),
    db.hashtag.findMany({
      where: {
        tenantId: { in: visibleTenantIds },
        tag: { contains: normalizedTag, mode: 'insensitive' },
      },
      select: { tag: true, _count: { select: { posts: true } } },
      take: 20,
    }),
    db.post.findMany({
      where: {
        tenantId: { in: visibleTenantIds },
        tipo: 'MEMBRO',
        oculto: false,
        visibilidade: 'PUBLICO',
        conteudo: { contains: termo, mode: 'insensitive' },
      },
      orderBy: { criadoEm: 'desc' },
      take: 15,
      include: postInclude(userId),
    }) as Promise<PostRaw[]>,
  ])

  let posts = postsRaw.map(projetarPost)
  const autorIds = posts.map((p) => p.autorId)
  const semAcesso = await getAutoresSemAcesso(userId, tenantId, autorIds)
  posts = posts.filter((p) => !semAcesso.has(p.autorId))

  const visiveis: PostSocialItem[] = []
  for (const post of posts) {
    const ok = await podeVerPost(userId, {
      autorId: post.autorId,
      tenantId: post.tenantId,
      visibilidade: post.visibilidade,
      oculto: false,
    })
    if (ok) visiveis.push(post)
    if (visiveis.length >= 10) break
  }

  const postsComBadges = await enriquecerPostsComBadges(visiveis)

  return {
    membros,
    hashtags: hashtagRows
      .sort((a, b) => b._count.posts - a._count.posts)
      .slice(0, 10)
      .map((h) => ({ tag: h.tag, total: h._count.posts })),
    posts: postsComBadges,
  }
}
