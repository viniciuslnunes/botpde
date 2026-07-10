import { unstable_cache, revalidateTag } from 'next/cache'
import { db } from '@torcida/db'
import { getVisibleTenantIds } from './hierarquia'

export const COMUNICADOS_CACHE_TAG = 'comunicados-feed'

export function comunicadosCacheTag(tenantId: string): string {
  return `comunicados-${tenantId}`
}

/** Invalida cache de comunicados após publicação/edição no admin. */
export function invalidateComunicadosCache(tenantId?: string): void {
  revalidateTag(COMUNICADOS_CACHE_TAG, 'max')
  if (tenantId) revalidateTag(comunicadosCacheTag(tenantId), 'max')
}

export interface ComunicadoFeedItem {
  id: string
  tenantId: string
  titulo: string
  corpo: string
  prioridade: 'NORMAL' | 'IMPORTANTE' | 'URGENTE'
  fixado: boolean
  publicadoEm: Date
  tenant: { nome: string }
  autor: { nome: string | null; avatarUrl: string | null }
  /** Presente quando o feed foi buscado com userId — estado de leitura do usuário. */
  lido?: boolean
}

export interface PostFeedItem {
  id: string
  tenantId: string
  titulo: string | null
  conteudo: string
  imagemUrl: string | null
  tipo: 'INSTITUCIONAL' | 'MEMBRO'
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
  fixado: boolean
  criadoEm: Date
  tenant: { nome: string }
  autor: { nome: string | null; avatarUrl: string | null }
}

const PESO_PRIORIDADE: Record<ComunicadoFeedItem['prioridade'], number> = {
  URGENTE: 2,
  IMPORTANTE: 1,
  NORMAL: 0,
}

function sortComunicados(announcements: ComunicadoFeedItem[]): void {
  announcements.sort((a, b) => {
    const pesoA = PESO_PRIORIDADE[a.prioridade]
    const pesoB = PESO_PRIORIDADE[b.prioridade]
    if (pesoA !== pesoB) return pesoB - pesoA
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1
    return reviveDate(b.publicadoEm).getTime() - reviveDate(a.publicadoEm).getTime()
  })
}

/** `unstable_cache` serializa `Date` como string — reidrata antes do consumo. */
export function reviveDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function reviveComunicadoDates(items: ComunicadoFeedItem[]): ComunicadoFeedItem[] {
  return items.map((a) => ({ ...a, publicadoEm: reviveDate(a.publicadoEm) }))
}

async function fetchComunicadosBase(tenantId: string): Promise<ComunicadoFeedItem[]> {
  const cached = await unstable_cache(
    async () => {
      const tenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
      const announcements = (await db.announcement.findMany({
        where: { tenantId: { in: tenantIds } },
        orderBy: [{ fixado: 'desc' }, { publicadoEm: 'desc' }],
        take: 30,
        include: {
          tenant: { select: { nome: true } },
          autor: { select: { nome: true, avatarUrl: true } },
        },
      })) as ComunicadoFeedItem[]
      sortComunicados(announcements)
      return announcements
    },
    ['comunicados-feed', tenantId],
    { revalidate: 120, tags: [COMUNICADOS_CACHE_TAG, comunicadosCacheTag(tenantId)] },
  )()
  return reviveComunicadoDates(cached)
}

/**
 * Feed de comunidade de um tenant: comunicados oficiais (próprios + herdados
 * de ancestrais, já que comunidade é um recurso PUBLICO na hierarquia) e
 * posts da rede visível (próprio tenant + aliados/ancestrais), respeitando
 * visibilidade pública para tenants externos. Comunicados sempre vêm
 * ordenados acima de posts no consumo desta função — implementa a regra
 * "conteúdo institucional sempre pode sobrescrever a prioridade do feed".
 */
export async function getFeedComunidade(
  tenantId: string,
  opts: { takePosts?: number; userId?: string; visibleTenantIds?: string[] } = {},
): Promise<{ announcements: ComunicadoFeedItem[]; posts: PostFeedItem[] }> {
  const wantPosts = opts.takePosts != null && opts.takePosts > 0
  const tenantIds =
    opts.visibleTenantIds ?? (await getVisibleTenantIds(tenantId, 'comunidade'))
  const tenantsExternos = tenantIds.filter((id) => id !== tenantId)

  const [announcements, posts] = await Promise.all([
    fetchComunicadosBase(tenantId),
    wantPosts
      ? (db.post.findMany({
          where: {
            oculto: false,
            OR: [
              { tenantId },
              { tenantId: { in: tenantsExternos }, visibilidade: 'PUBLICO' },
            ],
          },
          orderBy: [{ fixado: 'desc' }, { criadoEm: 'desc' }],
          take: opts.takePosts,
          include: {
            tenant: { select: { nome: true } },
            autor: { select: { nome: true, avatarUrl: true } },
          },
        }) as Promise<PostFeedItem[]>)
      : Promise.resolve([] as PostFeedItem[]),
  ])

  // Estado de leitura por usuário — calculado ANTES de qualquer marcação,
  // para a UI conseguir exibir "Novo" na visita que introduz o comunicado.
  if (opts.userId && announcements.length > 0) {
    const lidos: { announcementId: string }[] = await db.announcementRead.findMany({
      where: { userId: opts.userId, announcementId: { in: announcements.map((a) => a.id) } },
      select: { announcementId: true },
    })
    const lidosSet = new Set(lidos.map((l) => l.announcementId))
    for (const a of announcements) a.lido = lidosSet.has(a.id)
  }

  return { announcements, posts }
}

/** Marca os comunicados visíveis como lidos pelo usuário logado (idempotente). */
export async function marcarComunicadosLidos(
  announcementIds: string[],
  userId: string,
): Promise<void> {
  if (announcementIds.length === 0) return

  await db.$transaction(
    announcementIds.map((announcementId) =>
      db.announcementRead.upsert({
        where: { announcementId_userId: { announcementId, userId } },
        create: { announcementId, userId },
        update: {},
      }),
    ),
  )
}
