import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { canViewRecurso, formatNomeTorcida, SYSTEM_ROLES } from '@torcida/types'
import { tagCanaisVisiveis } from './comunidade-cache'
import { ExpectedError } from './expected-error'
import { getTenantRelation } from './hierarquia'
import { getVisibleTenantIds } from './hierarquia'
import {
  postInclude,
  projetarPost,
  finalizarPosts,
  buildCursorWhere,
  decodeCursor,
  encodeCursor,
  type FeedOpts,
  type FeedPersonalizadoResult,
  type PostRaw,
  type PostSocialItem,
} from './feed'
import type {
  CanalItem,
  MembroCanalItem,
  PedidoCanalItem,
  UnidadeBuscaItem,
  VisibilidadeCanal,
} from './canais-shared'

export type {
  CanalItem,
  MembroCanalItem,
  PedidoCanalItem,
  UnidadeBuscaItem,
  VisibilidadeCanal,
} from './canais-shared'
export {
  isConversaGrupoLike,
  labelTipoUnidade,
  labelVisibilidadeCanal,
  linkCanalComunidade,
  linkUnidadeComunidade,
} from './canais-shared'

export async function podeVerCanal(
  viewerTenantId: string,
  canalTenantId: string,
  visibilidade: VisibilidadeCanal,
): Promise<boolean> {
  if (viewerTenantId === canalTenantId) return true
  const relation = await getTenantRelation(viewerTenantId, canalTenantId)
  switch (visibilidade) {
    case 'TENANT':
      return false
    case 'HIERARQUIA':
      return relation === 'ancestor' || relation === 'descendant'
    case 'ALIADOS':
      return relation === 'ancestor' || relation === 'descendant' || relation === 'allied'
    case 'PUBLICO':
      return canViewRecurso(relation, 'comunidade')
    default:
      return false
  }
}

/**
 * Fallback de avatar dos canais oficiais: quando `Conversa.avatarUrl` é nulo,
 * usa `Sede.fotoUrl` da unidade dona do canal e, se também nulo,
 * `Tenant.logoUrl`. Batch por tenantId para evitar N+1 em listagens.
 */
async function resolveFallbackAvatarsCanalOficial(
  tenantIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(tenantIds)]
  if (uniqueIds.length === 0) return new Map()

  const [sedes, tenants]: [
    Array<{ tenantId: string | null; fotoUrl: string | null }>,
    Array<{ id: string; logoUrl: string | null }>,
  ] = await Promise.all([
    db.sede.findMany({
      where: { tenantId: { in: uniqueIds } },
      select: { tenantId: true, fotoUrl: true },
    }),
    db.tenant.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, logoUrl: true },
    }),
  ])
  const sedeMap = new Map(sedes.filter((s) => s.tenantId).map((s) => [s.tenantId!, s.fotoUrl]))
  const tenantMap = new Map(tenants.map((t) => [t.id, t.logoUrl]))

  const result = new Map<string, string | null>()
  for (const id of uniqueIds) {
    result.set(id, sedeMap.get(id) ?? tenantMap.get(id) ?? null)
  }
  return result
}

/** Resolve o avatar efetivo de um `CanalItem`, aplicando o fallback só para canais oficiais. */
function resolveAvatarCanalOficial(
  row: { tenantId: string; avatarUrl: string | null; canalOficial: boolean },
  fallbackMap: Map<string, string | null>,
): string | null {
  if (row.avatarUrl) return row.avatarUrl
  if (!row.canalOficial) return null
  return fallbackMap.get(row.tenantId) ?? null
}

async function resolverOwnerId(tenantId: string): Promise<string> {
  const owner: { userId: string } | null = await db.userRole.findFirst({
    where: { tenantId, role: { nome: SYSTEM_ROLES.OWNER, isSystem: true } },
    select: { userId: true },
  })
  if (owner) return owner.userId

  const admin: { userId: string } | null = await db.userRole.findFirst({
    where: { tenantId, role: { nome: SYSTEM_ROLES.ADMIN, isSystem: true } },
    select: { userId: true },
  })
  if (admin) return admin.userId

  const membro: { userId: string } | null = await db.saasMembro.findFirst({
    // StatusMembro não tem 'ATIVO' — APROVADO é o estado ativo terminal.
    where: { tenantId, status: 'APROVADO' },
    select: { userId: true },
    orderBy: { criadoEm: 'asc' },
  })
  if (!membro) throw new ExpectedError('Tenant sem membros ativos.')
  return membro.userId
}

export async function getOrCreateCanalOficial(
  tenantId: string,
): Promise<{ id: string; criadoAgora: boolean }> {
  // Unidade promovida a portal próprio (Caso B): o Sede.tenantId já aponta pro
  // tenant novo, mas o canal oficial fica "emprestado" no tenant da Sede-mãe
  // por decisão de design (docs/data/proposta-governanca-hierarquica.md —
  // "re-apontar o canal para o novo tenant fica para depois"). Sem checar
  // Sede.canalConversaId primeiro, a busca abaixo (por Conversa.tenantId) não
  // acha esse canal e cria um segundo, órfão, duplicando a unidade na tela.
  const sedeComCanal: { canalConversaId: string | null } | null = await db.sede.findFirst({
    where: { tenantId, canalConversaId: { not: null } },
    select: { canalConversaId: true },
  })
  if (sedeComCanal?.canalConversaId) {
    return { id: sedeComCanal.canalConversaId, criadoAgora: false }
  }

  const existente: { id: string } | null = await db.conversa.findFirst({
    where: { tenantId, tipo: 'CANAL', canalOficial: true },
    select: { id: true },
  })
  if (existente) return { id: existente.id, criadoAgora: false }

  const tenant: { nome: string } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { nome: true },
  })
  if (!tenant) throw new Error('Unidade não encontrada.')

  const criadoPorId = await resolverOwnerId(tenantId)

  const canal: { id: string } = await db.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId,
      nome: formatNomeTorcida(tenant.nome),
      descricao: 'Canal oficial da unidade',
      institucional: true,
      canalOficial: true,
      visibilidadeCanal: 'HIERARQUIA',
      somenteAdminPublica: true,
      // Fechado por padrão — entrada mediante pedido/aprovação da liderança;
      // liderança troca em /admin/configuracoes se quiser abrir (ver salvarCanalOficial).
      publica: false,
      criadoPorId,
      membros: {
        create: { userId: criadoPorId, papel: 'ADMIN', status: 'ATIVO' },
      },
    },
    select: { id: true },
  })

  return { id: canal.id, criadoAgora: true }
}

/** Entrada imediata (canal `publica: true`) — sem pedido, sem aprovação. */
export async function inscreverCanal(
  conversaId: string,
  userId: string,
): Promise<void> {
  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId, userId } },
    create: { conversaId, userId, papel: 'MEMBRO', status: 'ATIVO' },
    update: { saiuEm: null, status: 'ATIVO' },
  })
}

export const listCanaisVisiveis = cache(async function listCanaisVisiveis(
  viewerTenantId: string,
  userId: string,
): Promise<CanalItem[]> {
  const visibleTenantIds = await getVisibleTenantIds(viewerTenantId, 'comunidade')
  const visibleTenantIdsKey = [...visibleTenantIds].sort().join(',')

  const rows = await unstable_cache(
    async (): Promise<
      Array<{
        id: string
        tenantId: string
        nome: string | null
        descricao: string | null
        avatarUrl: string | null
        institucional: boolean
        canalOficial: boolean
        visibilidadeCanal: VisibilidadeCanal
        somenteAdminPublica: boolean
        publica: boolean
        tenant: { nome: string }
        _count: { membros: number }
      }>
    > =>
      db.conversa.findMany({
        where: { tenantId: { in: visibleTenantIds }, tipo: 'CANAL' },
        orderBy: [{ canalOficial: 'desc' }, { atualizadoEm: 'desc' }],
        take: 80,
        select: {
          id: true,
          tenantId: true,
          nome: true,
          descricao: true,
          avatarUrl: true,
          institucional: true,
          canalOficial: true,
          visibilidadeCanal: true,
          somenteAdminPublica: true,
          publica: true,
          tenant: { select: { nome: true } },
          _count: { select: { membros: { where: { saiuEm: null } } } },
        },
      }),
    ['canais-visiveis-base', viewerTenantId, visibleTenantIdsKey],
    { revalidate: 120, tags: [tagCanaisVisiveis(viewerTenantId)] },
  )()

  const memberships: Array<{
    conversaId: string
    papel: 'ADMIN' | 'MEMBRO'
    status: 'ATIVO' | 'PENDENTE' | 'REJEITADO'
  }> = await db.membroConversa.findMany({
    where: {
      userId,
      saiuEm: null,
      conversaId: { in: rows.map((row) => row.id) },
    },
    select: { conversaId: true, papel: true, status: true },
  })
  const membershipMap = new Map(memberships.map((item) => [item.conversaId, item]))

  // Visibilidade por canal em paralelo — getTenantRelation é dedupado por
  // React.cache, então pares (viewer, tenant) repetidos não repetem query.
  const [visiveis, fallbackAvatars] = await Promise.all([
    Promise.all(rows.map((row) => podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal))),
    resolveFallbackAvatarsCanalOficial(
      rows.filter((row) => row.canalOficial && !row.avatarUrl).map((row) => row.tenantId),
    ),
  ])

  const result: CanalItem[] = []
  rows.forEach((row, i) => {
    if (!visiveis[i]) return
    const membro = membershipMap.get(row.id)
    result.push({
      id: row.id,
      tenantId: row.tenantId,
      nome: row.nome,
      descricao: row.descricao,
      avatarUrl: resolveAvatarCanalOficial(row, fallbackAvatars),
      institucional: row.institucional,
      canalOficial: row.canalOficial,
      visibilidadeCanal: row.visibilidadeCanal,
      somenteAdminPublica: row.somenteAdminPublica,
      publica: row.publica,
      membros: row._count.membros,
      souMembro: membro?.status === 'ATIVO',
      souAdmin: membro?.status === 'ATIVO' && membro.papel === 'ADMIN',
      pedidoPendente: membro?.status === 'PENDENTE',
      tenantNome: formatNomeTorcida(row.tenant.nome),
    })
  })
  return result
})

export async function getCanalPorId(
  conversaId: string,
  viewerTenantId: string,
  userId: string,
): Promise<CanalItem | null> {
  const row: {
    id: string
    tenantId: string
    nome: string | null
    descricao: string | null
    avatarUrl: string | null
    institucional: boolean
    canalOficial: boolean
    visibilidadeCanal: VisibilidadeCanal
    somenteAdminPublica: boolean
    publica: boolean
    tipo: string
    tenant: { nome: string }
    _count: { membros: number }
    membros: Array<{ papel: 'ADMIN' | 'MEMBRO'; status: 'ATIVO' | 'PENDENTE' | 'REJEITADO' }>
  } | null = await db.conversa.findFirst({
    where: { id: conversaId, tipo: 'CANAL' },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      descricao: true,
      avatarUrl: true,
      institucional: true,
      canalOficial: true,
      visibilidadeCanal: true,
      somenteAdminPublica: true,
      publica: true,
      tipo: true,
      tenant: { select: { nome: true } },
      _count: { select: { membros: { where: { saiuEm: null } } } },
      membros: {
        where: { userId, saiuEm: null },
        select: { papel: true, status: true },
        take: 1,
      },
    },
  })
  if (!row) return null

  const podeVer = await podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal)
  if (!podeVer) return null

  const fallbackAvatars =
    row.canalOficial && !row.avatarUrl
      ? await resolveFallbackAvatarsCanalOficial([row.tenantId])
      : new Map<string, string | null>()

  const membro = row.membros[0]
  return {
    id: row.id,
    tenantId: row.tenantId,
    nome: row.nome,
    descricao: row.descricao,
    avatarUrl: resolveAvatarCanalOficial(row, fallbackAvatars),
    institucional: row.institucional,
    canalOficial: row.canalOficial,
    visibilidadeCanal: row.visibilidadeCanal,
    somenteAdminPublica: row.somenteAdminPublica,
    publica: row.publica,
    membros: row._count.membros,
    souMembro: membro?.status === 'ATIVO',
    souAdmin: membro?.status === 'ATIVO' && membro.papel === 'ADMIN',
    pedidoPendente: membro?.status === 'PENDENTE',
    tenantNome: formatNomeTorcida(row.tenant.nome),
  }
}

export async function getPostsDoCanal(
  conversaId: string,
  tenantId: string,
  userId: string,
  opts: FeedOpts = {},
): Promise<{ posts: PostSocialItem[]; pageInfo: FeedPersonalizadoResult['pageInfo'] }> {
  const membro: { id: string } | null = await db.membroConversa.findFirst({
    where: { conversaId, userId, saiuEm: null, status: 'ATIVO' },
    select: { id: true },
  })
  if (!membro) return { posts: [], pageInfo: { hasMore: false, nextCursor: null } }

  const take = Math.min(Math.max(opts.take ?? 20, 5), 50)
  const cursorWhere = buildCursorWhere(decodeCursor(opts.cursor))

  const postsRaw = (await db.post.findMany({
    where: { conversaId, tenantId, oculto: false, ...cursorWhere },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: take + 1,
    include: postInclude(userId),
  })) as PostRaw[]

  const posts = postsRaw.map(projetarPost)
  const hasMore = posts.length > take
  const pagina = await finalizarPosts(posts.slice(0, take))

  return {
    posts: pagina,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && pagina.length > 0 ? encodeCursor(pagina[pagina.length - 1]) : null,
    },
  }
}

/**
 * Lista membros ativos de um canal (para o modal de delegação de admin —
 * Tarefa D2). Sem gate de visibilidade próprio: quem chama já deve ter
 * confirmado `canal.souAdmin` (ou permissão equivalente) antes de exibir a UI.
 */
export async function listMembrosCanal(conversaId: string): Promise<MembroCanalItem[]> {
  const rows: Array<{
    userId: string
    papel: 'ADMIN' | 'MEMBRO'
    user: { nome: string | null; avatarUrl: string | null }
  }> = await db.membroConversa.findMany({
    where: { conversaId, saiuEm: null },
    orderBy: [{ papel: 'asc' }],
    select: {
      userId: true,
      papel: true,
      user: { select: { nome: true, avatarUrl: true } },
    },
  })
  return rows.map((row) => ({
    userId: row.userId,
    nome: row.user.nome,
    avatarUrl: row.user.avatarUrl,
    papel: row.papel,
  }))
}

export async function podePublicarNoCanal(
  canal: Pick<CanalItem, 'tenantId' | 'somenteAdminPublica' | 'souAdmin'>,
  viewerTenantId: string,
  permissoes: string[],
): Promise<boolean> {
  if (canal.tenantId !== viewerTenantId) return false
  if (!canal.somenteAdminPublica) return true
  const { PERMISSIONS, hasPermission } = await import('@torcida/types')
  return (
    canal.souAdmin ||
    hasPermission(permissoes, PERMISSIONS.CHANNELS_MANAGE) ||
    hasPermission(permissoes, PERMISSIONS.COMMUNITY_MANAGE) ||
    hasPermission(permissoes, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)
  )
}

/**
 * Quem pode ver/decidir pedidos de entrada de um canal fechado
 * (`publica: false`): admin local do canal (temático) ou quem tem
 * `CHANNELS_MANAGE`/`COMMUNITY_MANAGE` no tenant — para canal oficial soma
 * `ANNOUNCEMENTS_PUBLISH` (mesmo conjunto de `podePublicarNoCanal`, já que
 * canal oficial não delega admin via `MembroConversa`).
 */
export async function podeGerenciarPedidosCanal(
  canal: Pick<CanalItem, 'tenantId' | 'canalOficial' | 'souAdmin'>,
  viewerTenantId: string,
  permissoes: string[],
): Promise<boolean> {
  if (canal.tenantId !== viewerTenantId) return false
  if (canal.souAdmin) return true
  const { PERMISSIONS, hasPermission } = await import('@torcida/types')
  return (
    hasPermission(permissoes, PERMISSIONS.CHANNELS_MANAGE) ||
    hasPermission(permissoes, PERMISSIONS.COMMUNITY_MANAGE) ||
    (canal.canalOficial && hasPermission(permissoes, PERMISSIONS.ANNOUNCEMENTS_PUBLISH))
  )
}

/**
 * Lista pedidos de entrada pendentes de um canal fechado. Sem gate de
 * visibilidade próprio — quem chama já deve ter confirmado
 * `podeGerenciarPedidosCanal` antes de exibir a UI (mesmo padrão de
 * `listMembrosCanal`).
 */
export async function listPedidosCanal(conversaId: string): Promise<PedidoCanalItem[]> {
  const rows: Array<{
    userId: string
    entrouEm: Date
    user: { nome: string | null; avatarUrl: string | null }
  }> = await db.membroConversa.findMany({
    where: { conversaId, status: 'PENDENTE', saiuEm: null },
    orderBy: { entrouEm: 'asc' },
    select: {
      userId: true,
      entrouEm: true,
      user: { select: { nome: true, avatarUrl: true } },
    },
  })
  return rows.map((row) => ({
    userId: row.userId,
    nome: row.user.nome,
    avatarUrl: row.user.avatarUrl,
    pedidoEm: row.entrouEm.toISOString(),
  }))
}

export async function listUnidadesVisiveis(
  viewerTenantId: string,
): Promise<UnidadeBuscaItem[]> {
  const visibleIds = await getVisibleTenantIds(viewerTenantId, 'comunidade')
  const [tenants, sedes]: [
    Array<{ id: string; nome: string; logoUrl: string | null }>,
    Array<{ tenantId: string | null; tipo: string; cidade: string | null }>,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: visibleIds }, ativo: true, sintetico: false },
      select: { id: true, nome: true, logoUrl: true },
      orderBy: { nome: 'asc' },
    }),
    db.sede.findMany({
      where: { tenantId: { in: visibleIds } },
      select: { tenantId: true, tipo: true, cidade: true },
    }),
  ])
  const sedeMap = new Map(sedes.filter((s) => s.tenantId).map((s) => [s.tenantId!, s]))

  return tenants.map((t) => {
    const sede = sedeMap.get(t.id)
    return {
      tenantId: t.id,
      nome: formatNomeTorcida(t.nome),
      logoUrl: t.logoUrl,
      tipo: sede?.tipo ?? 'SEDE',
      cidade: sede?.cidade ?? null,
    }
  })
}

export async function buscarCanaisEUnidades(
  viewerTenantId: string,
  userId: string,
  q: string,
  opts: { visibleTenantIds?: string[] } = {},
): Promise<{ canais: CanalItem[]; unidades: UnidadeBuscaItem[] }> {
  const termo = q.trim()
  if (termo.length < 2) return { canais: [], unidades: [] }

  const visibleIds = opts.visibleTenantIds ?? (await getVisibleTenantIds(viewerTenantId, 'comunidade'))

  const [canalRows, tenantRows]: [
    Array<{
      id: string
      tenantId: string
      nome: string | null
      descricao: string | null
      avatarUrl: string | null
      institucional: boolean
      canalOficial: boolean
      visibilidadeCanal: VisibilidadeCanal
      somenteAdminPublica: boolean
      publica: boolean
      tenant: { nome: string }
      _count: { membros: number }
      membros: Array<{ papel: 'ADMIN' | 'MEMBRO'; status: 'ATIVO' | 'PENDENTE' | 'REJEITADO' }>
    }>,
    Array<{ id: string; nome: string; logoUrl: string | null }>,
  ] = await Promise.all([
    db.conversa.findMany({
      where: {
        tenantId: { in: visibleIds },
        tipo: 'CANAL',
        OR: [
          { nome: { contains: termo, mode: 'insensitive' } },
          { descricao: { contains: termo, mode: 'insensitive' } },
        ],
      },
      take: 15,
      select: {
        id: true,
        tenantId: true,
        nome: true,
        descricao: true,
        avatarUrl: true,
        institucional: true,
        canalOficial: true,
        visibilidadeCanal: true,
        somenteAdminPublica: true,
        publica: true,
        tenant: { select: { nome: true } },
        _count: { select: { membros: { where: { saiuEm: null } } } },
        membros: {
          where: { userId, saiuEm: null },
          select: { papel: true, status: true },
          take: 1,
        },
      },
    }),
    db.tenant.findMany({
      where: {
        id: { in: visibleIds },
        ativo: true,
        nome: { contains: termo, mode: 'insensitive' },
      },
      take: 10,
      select: { id: true, nome: true, logoUrl: true },
    }),
  ])

  // Visibilidade dos canais e busca de sedes das unidades são independentes.
  const [canaisVisiveis, sedes, fallbackAvatars]: [
    Array<(typeof canalRows)[number] | null>,
    Array<{ tenantId: string | null; tipo: string; cidade: string | null }>,
    Map<string, string | null>,
  ] = await Promise.all([
    Promise.all(
      canalRows.map(async (row) => {
        const podeVer = await podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal)
        return podeVer ? row : null
      }),
    ),
    db.sede.findMany({
      where: { tenantId: { in: tenantRows.map((t) => t.id) } },
      select: { tenantId: true, tipo: true, cidade: true },
    }),
    resolveFallbackAvatarsCanalOficial(
      canalRows.filter((row) => row.canalOficial && !row.avatarUrl).map((row) => row.tenantId),
    ),
  ])

  const canais: CanalItem[] = []
  for (const row of canaisVisiveis) {
    if (!row) continue
    const membro = row.membros[0]
    canais.push({
      id: row.id,
      tenantId: row.tenantId,
      nome: row.nome,
      descricao: row.descricao,
      avatarUrl: resolveAvatarCanalOficial(row, fallbackAvatars),
      institucional: row.institucional,
      canalOficial: row.canalOficial,
      visibilidadeCanal: row.visibilidadeCanal,
      somenteAdminPublica: row.somenteAdminPublica,
      publica: row.publica,
      membros: row._count.membros,
      souMembro: membro?.status === 'ATIVO',
      souAdmin: membro?.status === 'ATIVO' && membro.papel === 'ADMIN',
      pedidoPendente: membro?.status === 'PENDENTE',
      tenantNome: formatNomeTorcida(row.tenant.nome),
    })
  }

  const sedeMap = new Map(sedes.filter((s) => s.tenantId).map((s) => [s.tenantId!, s]))

  const unidades: UnidadeBuscaItem[] = tenantRows.map((t) => {
    const sede = sedeMap.get(t.id)
    return {
      tenantId: t.id,
      nome: formatNomeTorcida(t.nome),
      logoUrl: t.logoUrl,
      tipo: sede?.tipo ?? 'SEDE',
      cidade: sede?.cidade ?? null,
    }
  })

  return { canais, unidades }
}
