import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { getSeguimentoStatus } from './social'
import { tagAvatarUsuario, tagNomeUsuario } from './avatar-cache'

export interface PerfilSocialLite {
  id: string
  userId: string
  tenantId: string
  bio: string | null
  perfilPrivado: boolean
  avatarUrl: string | null
  bannerUrl: string | null
  bannerPos: number | null
  exibirCidade: boolean
  exibirSede: boolean
  exibirDesde: boolean
  criadoEm: Date
}

export interface ContagensSeguimento {
  seguidores: number
  seguindo: number
  publicacoes: number
}

export interface MembroRedeItem {
  userId: string
  nome: string | null
  avatarUrl: string | null
  perfilPrivado: boolean
  segueVoce: boolean
}

const perfilSelect = {
  id: true,
  userId: true,
  tenantId: true,
  bio: true,
  perfilPrivado: true,
  avatarUrl: true,
  bannerUrl: true,
  bannerPos: true,
  exibirCidade: true,
  exibirSede: true,
  exibirDesde: true,
  criadoEm: true,
} as const

/**
 * Avatar é identidade única do usuário (User.avatarUrl) — nunca por torcida.
 * PerfilMembro.avatarUrl existia como override por tenant e causava 3 fontes
 * divergentes (topbar/perfil por torcida, feed sempre global); descontinuado
 * como fonte de exibição.
 */
export function resolverAvatarSocial(userAvatar: string | null | undefined): string | null {
  return userAvatar ?? null
}

/**
 * Avatar do usuário logado, para topbar e aside da Comunidade — nunca
 * session.user.image (JWT só recebe a foto nova no próximo login). Cacheado
 * entre requests — não é uma query por navegação. Invalidado na hora pelo
 * evento real (salvarPerfilSocial / sync de login OAuth chamam
 * revalidateTag(tagAvatarUsuario(userId))); o `revalidate` é só rede de
 * segurança contra um cache poluído por uma corrida rara (ex.: leitura antes
 * da foto existir), não o mecanismo principal de atualização.
 */
export async function getAvatarAtualDoUsuario(userId: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      const user = await db.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } })
      return resolverAvatarSocial(user?.avatarUrl)
    },
    ['avatar-atual-do-usuario', userId],
    { revalidate: 60, tags: [tagAvatarUsuario(userId)] },
  )()
}

/**
 * Nome de exibição do usuário logado (topbar) — nunca session.user.name
 * (JWT congela o valor do login). Invalidado em salvarPerfil via
 * revalidateTag(tagNomeUsuario(userId)).
 */
export async function getNomeAtualDoUsuario(userId: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      const user: { nome: string } | null = await db.user.findUnique({
        where: { id: userId },
        select: { nome: true },
      })
      const nome = user?.nome?.trim()
      return nome || null
    },
    ['nome-atual-do-usuario', userId],
    { revalidate: 60, tags: [tagNomeUsuario(userId)] },
  )()
}

export type VinculoPrivacidadePerfil = {
  tipo: 'SOCIO' | 'TORCEDOR'
  status: string
} | null

/**
 * Privacidade efetiva por vínculo:
 * - Sócio: respeita preferência gravada; sem valor → privado (default da aprovação / aba Sobre).
 * - Torcedor: sempre público.
 * - Sem vínculo / situação diversa: usa preferência gravada (fallback público).
 */
export function resolverPerfilPrivadoEfetivo(
  perfilPrivado: boolean | null | undefined,
  vinculo: VinculoPrivacidadePerfil,
): boolean {
  // Torcedor sempre pública: não importa se está APROVADO ou PENDENTE.
  if (vinculo?.tipo === 'TORCEDOR') return false
  if (vinculo?.tipo === 'SOCIO') return perfilPrivado ?? true
  return perfilPrivado ?? false
}

export function torcedorAprovadoPublicoObrigatorio(
  vinculo: VinculoPrivacidadePerfil,
): boolean {
  return vinculo?.tipo === 'TORCEDOR'
}

/** Versão síncrona para testes e uso interno. */
export function podeVerConteudoSocialSync(
  viewerId: string | undefined,
  autorId: string,
  perfilPrivado: boolean,
  seguimentoAprovado: boolean,
): boolean {
  if (!viewerId) return false
  if (viewerId === autorId) return true
  if (!perfilPrivado) return true
  return seguimentoAprovado
}

/** Self, perfil público ou seguimento aprovado. */
export async function podeVerConteudoSocial(
  viewerId: string | undefined,
  autorId: string,
  tenantId: string,
): Promise<boolean> {
  if (!viewerId) return false
  if (viewerId === autorId) return true

  const [perfil, membro, status] = await Promise.all([
    db.perfilMembro.findUnique({
      where: { userId_tenantId: { userId: autorId, tenantId } },
      select: { perfilPrivado: true },
    }),
    db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId: autorId } },
      select: { tipo: true, status: true },
    }),
    getSeguimentoStatus(viewerId, autorId),
  ])

  const perfilPrivado = resolverPerfilPrivadoEfetivo(perfil?.perfilPrivado, membro)
  return podeVerConteudoSocialSync(
    viewerId,
    autorId,
    perfilPrivado,
    status === 'APROVADO',
  )
}

/** IDs de autores cujo conteúdo o viewer não pode ver (perfil privado sem follow). */
const getAutoresSemAcessoIdsCached = cache(
  async (viewerId: string, tenantId: string, autorIdsKey: string): Promise<string[]> => {
    const unique = autorIdsKey.length > 0 ? autorIdsKey.split(',') : []
    if (unique.length === 0) return []

    const [perfis, membros]: [
      Array<{ userId: string; perfilPrivado: boolean }>,
      Array<{ userId: string; tipo: 'SOCIO' | 'TORCEDOR'; status: string }>,
    ] = await Promise.all([
      db.perfilMembro.findMany({
        where: { userId: { in: unique }, tenantId },
        select: { userId: true, perfilPrivado: true },
      }),
      db.saasMembro.findMany({
        where: { userId: { in: unique }, tenantId },
        select: { userId: true, tipo: true, status: true },
      }),
    ])
    const perfilMap = new Map(perfis.map((p) => [p.userId, p.perfilPrivado]))
    const membroMap = new Map(membros.map((m) => [m.userId, m]))

    const candidatosPrivados = unique.filter((id) =>
      resolverPerfilPrivadoEfetivo(perfilMap.get(id), membroMap.get(id) ?? null),
    )
    if (candidatosPrivados.length === 0) return []

    const aprovados: Array<{ seguidoId: string }> = await db.seguimento.findMany({
      where: {
        seguidorId: viewerId,
        seguidoId: { in: candidatosPrivados },
        status: 'APROVADO',
      },
      select: { seguidoId: true },
    })
    const seguidos = new Set(aprovados.map((s) => s.seguidoId))

    const bloqueados: string[] = []
    for (const id of candidatosPrivados) {
      if (!seguidos.has(id)) bloqueados.push(id)
    }
    return bloqueados
  },
)

export async function getAutoresSemAcesso(
  viewerId: string | undefined,
  tenantId: string,
  autorIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(autorIds)].filter((id) => id !== viewerId)
  if (!viewerId) return new Set(unique)
  if (unique.length === 0) return new Set()

  const autorIdsKey = [...unique].sort().join(',')
  const bloqueados = await getAutoresSemAcessoIdsCached(viewerId, tenantId, autorIdsKey)
  return new Set(bloqueados)
}

export async function getPerfilSocial(
  userId: string,
  tenantId: string,
): Promise<PerfilSocialLite | null> {
  const perfil: PerfilSocialLite | null = await db.perfilMembro.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: perfilSelect,
  })
  return perfil
}

export async function getContagensSeguimento(
  userId: string,
  tenantId: string,
): Promise<ContagensSeguimento> {
  const [seguidores, seguindo, publicacoes] = await Promise.all([
    db.seguimento.count({ where: { seguidoId: userId, status: 'APROVADO' } }),
    db.seguimento.count({ where: { seguidorId: userId, status: 'APROVADO' } }),
    db.post.count({
      where: { autorId: userId, tenantId, tipo: 'MEMBRO', oculto: false },
    }),
  ])
  return { seguidores, seguindo, publicacoes }
}

/** Contagens em lote para aside / sugestões — evita N+1 de getContagensSeguimento. */
export async function getContagensSeguimentoEmLote(
  userIds: string[],
  tenantId: string,
): Promise<Map<string, ContagensSeguimento>> {
  const result = new Map<string, ContagensSeguimento>()
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return result

  const [seguidoresRows, seguindoRows, publicacoesRows]: [
    Array<{ seguidoId: string; _count: { _all: number } }>,
    Array<{ seguidorId: string; _count: { _all: number } }>,
    Array<{ autorId: string; _count: { _all: number } }>,
  ] = await Promise.all([
    db.seguimento.groupBy({
      by: ['seguidoId'],
      where: { seguidoId: { in: unique }, status: 'APROVADO' },
      _count: { _all: true },
    }),
    db.seguimento.groupBy({
      by: ['seguidorId'],
      where: { seguidorId: { in: unique }, status: 'APROVADO' },
      _count: { _all: true },
    }),
    db.post.groupBy({
      by: ['autorId'],
      where: { autorId: { in: unique }, tenantId, tipo: 'MEMBRO', oculto: false },
      _count: { _all: true },
    }),
  ])

  const seguidoresMap = new Map(seguidoresRows.map((r) => [r.seguidoId, r._count._all]))
  const seguindoMap = new Map(seguindoRows.map((r) => [r.seguidorId, r._count._all]))
  const publicacoesMap = new Map(publicacoesRows.map((r) => [r.autorId, r._count._all]))

  for (const id of unique) {
    result.set(id, {
      seguidores: seguidoresMap.get(id) ?? 0,
      seguindo: seguindoMap.get(id) ?? 0,
      publicacoes: publicacoesMap.get(id) ?? 0,
    })
  }
  return result
}

export async function podeVerListasRede(
  viewerId: string | undefined,
  alvoId: string,
  tenantId: string,
): Promise<boolean> {
  return podeVerConteudoSocial(viewerId, alvoId, tenantId)
}

export async function listarRedeSocial(
  alvoId: string,
  tenantId: string,
  tipo: 'seguidores' | 'seguindo',
  viewerId: string | undefined,
  opts: { take?: number; cursor?: string } = {},
): Promise<{ membros: MembroRedeItem[]; nextCursor: string | null }> {
  const podeVer = await podeVerListasRede(viewerId, alvoId, tenantId)
  if (!podeVer) return { membros: [], nextCursor: null }

  const take = Math.min(Math.max(opts.take ?? 30, 1), 50)
  const where =
    tipo === 'seguidores'
      ? { seguidoId: alvoId, status: 'APROVADO' as const }
      : { seguidorId: alvoId, status: 'APROVADO' as const }

  const rows: Array<{
    id: string
    seguidorId: string
    seguidoId: string
    seguidor: { id: string; nome: string | null; avatarUrl: string | null }
    seguido: { id: string; nome: string | null; avatarUrl: string | null }
  }> = await db.seguimento.findMany({
    where: {
      ...where,
      ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
    },
    orderBy: { id: 'desc' },
    take: take + 1,
    include: {
      seguidor: { select: { id: true, nome: true, avatarUrl: true } },
      seguido: { select: { id: true, nome: true, avatarUrl: true } },
    },
  })

  const hasMore = rows.length > take
  const slice = rows.slice(0, take)
  const userIds = slice.map((r) => (tipo === 'seguidores' ? r.seguidorId : r.seguidoId))

  const [perfis, vinculosSaas]: [
    Array<{ userId: string; perfilPrivado: boolean }>,
    Array<{ userId: string; tipo: 'SOCIO' | 'TORCEDOR'; status: string }>,
  ] = await Promise.all([
    db.perfilMembro.findMany({
      where: { userId: { in: userIds }, tenantId },
      select: { userId: true, perfilPrivado: true },
    }),
    db.saasMembro.findMany({
      where: { userId: { in: userIds }, tenantId },
      select: { userId: true, tipo: true, status: true },
    }),
  ])
  const perfilMap = new Map(perfis.map((p) => [p.userId, p]))
  const membroMap = new Map(vinculosSaas.map((m) => [m.userId, m]))

  let segueViewer: Set<string> = new Set()
  if (viewerId && tipo === 'seguidores') {
    const mutuos: Array<{ seguidorId: string }> = await db.seguimento.findMany({
      where: { seguidorId: { in: userIds }, seguidoId: viewerId, status: 'APROVADO' },
      select: { seguidorId: true },
    })
    segueViewer = new Set(mutuos.map((m) => m.seguidorId))
  }

  const membros: MembroRedeItem[] = slice.map((r) => {
    const user = tipo === 'seguidores' ? r.seguidor : r.seguido
    const perfil = perfilMap.get(user.id)
    return {
      userId: user.id,
      nome: user.nome,
      avatarUrl: resolverAvatarSocial(user.avatarUrl),
      perfilPrivado: resolverPerfilPrivadoEfetivo(
        perfil?.perfilPrivado,
        membroMap.get(user.id) ?? null,
      ),
      segueVoce: segueViewer.has(user.id),
    }
  })

  return {
    membros,
    nextCursor: hasMore && slice.length > 0 ? slice[slice.length - 1].id : null,
  }
}

export async function segueMutuamente(
  viewerId: string,
  alvoId: string,
): Promise<boolean> {
  const [a, b]: [{ id: string } | null, { id: string } | null] = await Promise.all([
    db.seguimento.findFirst({
      where: { seguidorId: viewerId, seguidoId: alvoId, status: 'APROVADO' },
      select: { id: true },
    }),
    db.seguimento.findFirst({
      where: { seguidorId: alvoId, seguidoId: viewerId, status: 'APROVADO' },
      select: { id: true },
    }),
  ])
  return a !== null && b !== null
}

export interface FotoPerfilItem {
  url: string
  postId: string
  criadoEm: Date
}

export interface AtividadePerfilItem {
  id: string
  tipo: 'COMENTARIO' | 'CURTIR'
  conteudo: string
  criadoEm: Date
  postId: string
  postSnippet: string
}

export async function getFotosDoAutor(
  autorId: string,
  tenantId: string,
  visibleTenantIds: string[],
): Promise<FotoPerfilItem[]> {
  const posts: Array<{
    id: string
    criadoEm: Date
    imagemUrl: string | null
    midiaUrls: string[]
  }> = await db.post.findMany({
    where: {
      autorId,
      tenantId: { in: visibleTenantIds },
      tipo: 'MEMBRO',
      oculto: false,
    },
    orderBy: { criadoEm: 'desc' },
    take: 50,
    select: { id: true, criadoEm: true, imagemUrl: true, midiaUrls: true },
  })

  const fotos: FotoPerfilItem[] = []
  for (const post of posts) {
    const urls = [
      ...(post.imagemUrl ? [post.imagemUrl] : []),
      ...post.midiaUrls.filter((u) => u.includes('res.cloudinary.com') && !u.includes('/video/')),
    ]
    for (const url of urls) {
      fotos.push({ url, postId: post.id, criadoEm: post.criadoEm })
    }
  }
  return fotos
}

export async function getAtividadeDoAutor(
  autorId: string,
  visibleTenantIds: string[],
): Promise<AtividadePerfilItem[]> {
  const [comentarios, reacoes]: [
    Array<{
      id: string
      conteudo: string
      criadoEm: Date
      post: { id: string; conteudo: string; tenantId: string; oculto: boolean }
    }>,
    Array<{
      id: string
      tipo: string
      criadoEm: Date
      post: { id: string; conteudo: string; tenantId: string; oculto: boolean }
    }>,
  ] = await Promise.all([
    db.comentario.findMany({
      where: { autorId },
      orderBy: { criadoEm: 'desc' },
      take: 40,
      include: {
        post: { select: { id: true, conteudo: true, tenantId: true, oculto: true } },
      },
    }),
    db.reacao.findMany({
      where: { userId: autorId },
      orderBy: { criadoEm: 'desc' },
      take: 40,
      include: {
        post: { select: { id: true, conteudo: true, tenantId: true, oculto: true } },
      },
    }),
  ])

  const visibleSet = new Set(visibleTenantIds)
  const itens: AtividadePerfilItem[] = []

  for (const c of comentarios) {
    if (c.post.oculto || !visibleSet.has(c.post.tenantId)) continue
    itens.push({
      id: c.id,
      tipo: 'COMENTARIO',
      conteudo: c.conteudo,
      criadoEm: c.criadoEm,
      postId: c.post.id,
      postSnippet: c.post.conteudo.slice(0, 120),
    })
  }
  for (const r of reacoes) {
    if (r.post.oculto || !visibleSet.has(r.post.tenantId)) continue
    itens.push({
      id: r.id,
      tipo: 'CURTIR',
      conteudo: 'Curtiu',
      criadoEm: r.criadoEm,
      postId: r.post.id,
      postSnippet: r.post.conteudo.slice(0, 120),
    })
  }

  itens.sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
  return itens.slice(0, 40)
}
