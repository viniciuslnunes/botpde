import { db } from '@torcida/db'
import { getVisibleTenantIds } from './hierarquia'

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
  titulo: string | null
  conteudo: string
  imagemUrl: string | null
  fixado: boolean
  criadoEm: Date
  autor: { nome: string | null; avatarUrl: string | null }
}

const PESO_PRIORIDADE: Record<ComunicadoFeedItem['prioridade'], number> = {
  URGENTE: 2,
  IMPORTANTE: 1,
  NORMAL: 0,
}

/**
 * Feed de comunidade de um tenant: comunicados oficiais (próprios + herdados
 * de ancestrais, já que comunidade é um recurso PUBLICO na hierarquia) e
 * posts locais (só do próprio tenant — post comunitário não cascateia,
 * apenas comunicado institucional). Comunicados sempre vêm ordenados acima
 * de posts locais no consumo desta função — implementa a regra "conteúdo
 * institucional sempre pode sobrescrever a prioridade do feed local".
 */
export async function getFeedComunidade(
  tenantId: string,
  opts: { takePosts?: number; userId?: string } = {},
): Promise<{ announcements: ComunicadoFeedItem[]; posts: PostFeedItem[] }> {
  // comunidade é recurso PÚBLICO → inclui ancestrais (ver getVisibleTenantIds)
  const tenantIds = await getVisibleTenantIds(tenantId, 'comunidade')

  const [announcements, posts] = await Promise.all([
    db.announcement.findMany({
      where: { tenantId: { in: tenantIds } },
      include: {
        tenant: { select: { nome: true } },
        autor: { select: { nome: true, avatarUrl: true } },
      },
    }) as Promise<ComunicadoFeedItem[]>,
    db.post.findMany({
      where: { tenantId },
      orderBy: [{ fixado: 'desc' }, { criadoEm: 'desc' }],
      take: opts.takePosts,
      include: { autor: { select: { nome: true, avatarUrl: true } } },
    }) as Promise<PostFeedItem[]>,
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

  announcements.sort((a, b) => {
    const pesoA = PESO_PRIORIDADE[a.prioridade]
    const pesoB = PESO_PRIORIDADE[b.prioridade]
    if (pesoA !== pesoB) return pesoB - pesoA
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1
    return b.publicadoEm.getTime() - a.publicadoEm.getTime()
  })

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
