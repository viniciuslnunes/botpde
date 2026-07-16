import { db } from '@torcida/db'
import { getVisibleTenantIds } from './hierarquia'
import { canFollowUser } from './social'
import { getAutoresSemAcesso, resolverAvatarSocial } from './perfil-social'
import { normalizarHashtag } from './comunidade-social'
import { postInclude, projetarPost, podeVerPost, type PostSocialItem, type PostRaw } from './feed'
import { enriquecerPostsComBadges } from './autor-badges'
import { buscarCanaisEUnidades, type CanalItem, type UnidadeBuscaItem } from './canais'

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
  canais: CanalItem[]
  unidades: UnidadeBuscaItem[]
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
  const candidatos: MembroRow[] = []
  for (const r of rows) {
    if (vistos.has(r.userId) || bloqueadosIds.has(r.userId)) continue
    vistos.add(r.userId)
    candidatos.push(r)
    if (candidatos.length >= 20) break
  }
  if (candidatos.length === 0) return []

  const candidatoIds = candidatos.map((c) => c.userId)

  const [perfis, seguimentos, contagensRows, podeSeguirLista] = await Promise.all([
    db.perfilMembro.findMany({
      where: { tenantId, userId: { in: candidatoIds } },
      select: { userId: true, perfilPrivado: true, avatarUrl: true },
    }) as Promise<{ userId: string; perfilPrivado: boolean; avatarUrl: string | null }[]>,
    db.seguimento.findMany({
      where: { seguidorId: userId, seguidoId: { in: candidatoIds } },
      select: { seguidoId: true, status: true },
    }) as Promise<
      { seguidoId: string; status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO' }[]
    >,
    db.seguimento.groupBy({
      by: ['seguidoId'],
      where: { seguidoId: { in: candidatoIds }, status: 'APROVADO' },
      _count: { _all: true },
    }) as Promise<{ seguidoId: string; _count: { _all: number } }[]>,
    Promise.all(candidatoIds.map((id) => canFollowUser(userId, id, tenantId))),
  ])

  const perfilPorId = new Map(perfis.map((p) => [p.userId, p]))
  const statusPorId = new Map(seguimentos.map((s) => [s.seguidoId, s.status]))
  const seguidoresPorId = new Map(contagensRows.map((c) => [c.seguidoId, c._count._all]))

  return candidatos.map((r, i) => {
    const perfil = perfilPorId.get(r.userId)
    return {
      id: r.user.id,
      nome: r.user.nome,
      avatarUrl: resolverAvatarSocial(perfil?.avatarUrl ?? null, r.user.avatarUrl),
      tenantNome: r.tenant.nome,
      perfilPrivado: perfil?.perfilPrivado ?? true,
      statusSeguimento: statusPorId.get(r.userId) ?? null,
      seguidores: seguidoresPorId.get(r.userId) ?? 0,
      podeSeguir: podeSeguirLista[i],
    }
  })
}

export async function buscarComunidade(
  tenantId: string,
  userId: string,
  q: string,
): Promise<BuscaComunidadeResult> {
  const termo = q.trim()
  if (termo.length < 2) {
    return { membros: [], hashtags: [], posts: [], canais: [], unidades: [] }
  }

  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  const normalizedTag = normalizarHashtag(termo.replace(/^#/, ''))

  const [membros, hashtagRows, postsRaw, canaisUnidades]: [
    MembroBuscaItem[],
    Array<{ tag: string; _count: { posts: number } }>,
    PostRaw[],
    { canais: CanalItem[]; unidades: UnidadeBuscaItem[] },
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
        conversaId: null,
        conteudo: { contains: termo, mode: 'insensitive' },
      },
      orderBy: { criadoEm: 'desc' },
      take: 15,
      include: postInclude(userId),
    }) as Promise<PostRaw[]>,
    buscarCanaisEUnidades(tenantId, userId, termo),
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
    canais: canaisUnidades.canais,
    unidades: canaisUnidades.unidades,
  }
}
