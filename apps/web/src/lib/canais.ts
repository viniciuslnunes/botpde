import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import { canViewRecurso, SYSTEM_ROLES } from '@torcida/types'
import { getTenantRelation } from './hierarquia'
import { getVisibleTenantIds } from './hierarquia'
import { getEscopoEventosVisiveis } from './eventos'
import { postInclude, projetarPost, finalizarPosts, type PostRaw, type PostSocialItem } from './feed'
import type {
  CanalItem,
  ComunicadoInstitucionalItem,
  PerfilInstitucional,
  UnidadeBuscaItem,
  VisibilidadeCanal,
} from './canais-shared'

export type {
  CanalItem,
  ComunicadoInstitucionalItem,
  PerfilInstitucional,
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
    where: { tenantId, status: 'ATIVO' },
    select: { userId: true },
    orderBy: { criadoEm: 'asc' },
  })
  if (!membro) throw new Error('Tenant sem membros ativos.')
  return membro.userId
}

export async function getOrCreateCanalOficial(
  tenantId: string,
): Promise<{ id: string; criadoAgora: boolean }> {
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
      nome: tenant.nome,
      descricao: 'Canal oficial da unidade',
      institucional: true,
      canalOficial: true,
      visibilidadeCanal: 'HIERARQUIA',
      somenteAdminPublica: true,
      publica: true,
      criadoPorId,
      membros: {
        create: { userId: criadoPorId, papel: 'ADMIN' },
      },
    },
    select: { id: true },
  })

  return { id: canal.id, criadoAgora: true }
}

export async function inscreverCanal(
  conversaId: string,
  userId: string,
): Promise<void> {
  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId, userId } },
    create: { conversaId, userId, papel: 'MEMBRO' },
    update: { saiuEm: null },
  })
}

export const listCanaisVisiveis = cache(async function listCanaisVisiveis(
  viewerTenantId: string,
  userId: string,
): Promise<CanalItem[]> {
  const visibleTenantIds = await getVisibleTenantIds(viewerTenantId, 'comunidade')

  const rows: Array<{
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
    membros: Array<{ papel: 'ADMIN' | 'MEMBRO' }>
  }> = await db.conversa.findMany({
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
      membros: {
        where: { userId, saiuEm: null },
        select: { papel: true },
        take: 1,
      },
    },
  })

  const result: CanalItem[] = []
  for (const row of rows) {
    const podeVer = await podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal)
    if (!podeVer) continue
    const membro = row.membros[0]
    result.push({
      id: row.id,
      tenantId: row.tenantId,
      nome: row.nome,
      descricao: row.descricao,
      avatarUrl: row.avatarUrl,
      institucional: row.institucional,
      canalOficial: row.canalOficial,
      visibilidadeCanal: row.visibilidadeCanal,
      somenteAdminPublica: row.somenteAdminPublica,
      publica: row.publica,
      membros: row._count.membros,
      souMembro: Boolean(membro),
      souAdmin: membro?.papel === 'ADMIN',
      tenantNome: row.tenant.nome,
    })
  }
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
    membros: Array<{ papel: 'ADMIN' | 'MEMBRO' }>
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
        select: { papel: true },
        take: 1,
      },
    },
  })
  if (!row) return null

  const podeVer = await podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal)
  if (!podeVer) return null

  const membro = row.membros[0]
  return {
    id: row.id,
    tenantId: row.tenantId,
    nome: row.nome,
    descricao: row.descricao,
    avatarUrl: row.avatarUrl,
    institucional: row.institucional,
    canalOficial: row.canalOficial,
    visibilidadeCanal: row.visibilidadeCanal,
    somenteAdminPublica: row.somenteAdminPublica,
    publica: row.publica,
    membros: row._count.membros,
    souMembro: Boolean(membro),
    souAdmin: membro?.papel === 'ADMIN',
    tenantNome: row.tenant.nome,
  }
}

export async function getPostsDoCanal(
  conversaId: string,
  tenantId: string,
  userId: string,
): Promise<PostSocialItem[]> {
  const membro: { id: string } | null = await db.membroConversa.findFirst({
    where: { conversaId, userId, saiuEm: null },
    select: { id: true },
  })
  if (!membro) return []

  const postsRaw = (await db.post.findMany({
    where: { conversaId, tenantId, oculto: false },
    orderBy: { criadoEm: 'desc' },
    take: 50,
    include: postInclude(userId),
  })) as PostRaw[]

  return finalizarPosts(postsRaw.map(projetarPost))
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

export const getPerfilInstitucional = cache(async function getPerfilInstitucional(
  targetTenantId: string,
  viewerTenantId: string,
  userId: string,
  permissoes: string[],
): Promise<PerfilInstitucional | null> {
  const podeVer = await podeVerCanal(viewerTenantId, targetTenantId, 'HIERARQUIA')
  if (!podeVer) {
    const alliedOk = await podeVerCanal(viewerTenantId, targetTenantId, 'ALIADOS')
    if (!alliedOk) return null
  }

  const [tenant, sede, canalOficial] = await Promise.all([
    db.tenant.findUnique({
      where: { id: targetTenantId, ativo: true },
      select: { id: true, nome: true, logoUrl: true, corPrimaria: true },
    }),
    db.sede.findFirst({
      where: { tenantId: targetTenantId },
      select: { tipo: true, cidade: true },
    }),
    getOrCreateCanalOficial(targetTenantId),
  ])
  if (!tenant) return null

  await inscreverCanal(canalOficial.id, userId)

  const canal = await getCanalPorId(canalOficial.id, viewerTenantId, userId)
  if (!canal) return null

  const escopoEventos = await getEscopoEventosVisiveis(targetTenantId, userId)

  const [comunicados, postsInstRaw, postsCanalRaw, proximosEventos] = await Promise.all([
    db.announcement.findMany({
      where: { tenantId: targetTenantId },
      orderBy: [{ fixado: 'desc' }, { publicadoEm: 'desc' }],
      take: 10,
      select: {
        id: true,
        titulo: true,
        corpo: true,
        prioridade: true,
        fixado: true,
        publicadoEm: true,
      },
    }),
    db.post.findMany({
      where: { tenantId: targetTenantId, tipo: 'INSTITUCIONAL', oculto: false, conversaId: null },
      orderBy: [{ fixado: 'desc' }, { criadoEm: 'desc' }],
      take: 20,
      include: postInclude(userId),
    }) as Promise<PostRaw[]>,
    db.post.findMany({
      where: { conversaId: canalOficial.id, tenantId: targetTenantId, oculto: false },
      orderBy: { criadoEm: 'desc' },
      take: 30,
      include: postInclude(userId),
    }) as Promise<PostRaw[]>,
    db.evento.findMany({
      where: { ...escopoEventos, data: { gte: new Date() } },
      orderBy: { data: 'asc' },
      take: 5,
      select: { id: true, titulo: true, data: true, local: true },
    }),
  ])

  const postsInstitucionais = await finalizarPosts(postsInstRaw.map(projetarPost))
  const postsCanal = await finalizarPosts(postsCanalRaw.map(projetarPost))

  return {
    tenantId: tenant.id,
    nome: tenant.nome,
    logoUrl: tenant.logoUrl,
    corPrimaria: tenant.corPrimaria,
    tipo: sede?.tipo ?? 'SEDE',
    cidade: sede?.cidade ?? null,
    canalOficialId: canalOficial.id,
    souMembroCanal: canal.souMembro,
    podePublicar: await podePublicarNoCanal(canal, viewerTenantId, permissoes),
    comunicados,
    postsInstitucionais,
    postsCanal,
    proximosEventos,
  }
})

export async function listUnidadesVisiveis(
  viewerTenantId: string,
): Promise<UnidadeBuscaItem[]> {
  const visibleIds = await getVisibleTenantIds(viewerTenantId, 'comunidade')
  const tenants: Array<{ id: string; nome: string; logoUrl: string | null }> =
    await db.tenant.findMany({
      where: { id: { in: visibleIds }, ativo: true },
      select: { id: true, nome: true, logoUrl: true },
      orderBy: { nome: 'asc' },
    })

  const sedes: Array<{ tenantId: string | null; tipo: string; cidade: string | null }> =
    await db.sede.findMany({
      where: { tenantId: { in: visibleIds } },
      select: { tenantId: true, tipo: true, cidade: true },
    })
  const sedeMap = new Map(sedes.filter((s) => s.tenantId).map((s) => [s.tenantId!, s]))

  return tenants.map((t) => {
    const sede = sedeMap.get(t.id)
    return {
      tenantId: t.id,
      nome: t.nome,
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
): Promise<{ canais: CanalItem[]; unidades: UnidadeBuscaItem[] }> {
  const termo = q.trim()
  if (termo.length < 2) return { canais: [], unidades: [] }

  const visibleIds = await getVisibleTenantIds(viewerTenantId, 'comunidade')

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
      membros: Array<{ papel: 'ADMIN' | 'MEMBRO' }>
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
          select: { papel: true },
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

  const canais: CanalItem[] = []
  for (const row of canalRows) {
    const podeVer = await podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal)
    if (!podeVer) continue
    const membro = row.membros[0]
    canais.push({
      id: row.id,
      tenantId: row.tenantId,
      nome: row.nome,
      descricao: row.descricao,
      avatarUrl: row.avatarUrl,
      institucional: row.institucional,
      canalOficial: row.canalOficial,
      visibilidadeCanal: row.visibilidadeCanal,
      somenteAdminPublica: row.somenteAdminPublica,
      publica: row.publica,
      membros: row._count.membros,
      souMembro: Boolean(membro),
      souAdmin: membro?.papel === 'ADMIN',
      tenantNome: row.tenant.nome,
    })
  }

  const sedes: Array<{ tenantId: string | null; tipo: string; cidade: string | null }> =
    await db.sede.findMany({
      where: { tenantId: { in: tenantRows.map((t) => t.id) } },
      select: { tenantId: true, tipo: true, cidade: true },
    })
  const sedeMap = new Map(sedes.filter((s) => s.tenantId).map((s) => [s.tenantId!, s]))

  const unidades: UnidadeBuscaItem[] = tenantRows.map((t) => {
    const sede = sedeMap.get(t.id)
    return {
      tenantId: t.id,
      nome: t.nome,
      logoUrl: t.logoUrl,
      tipo: sede?.tipo ?? 'SEDE',
      cidade: sede?.cidade ?? null,
    }
  })

  return { canais, unidades }
}
