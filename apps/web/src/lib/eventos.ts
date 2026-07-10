import { db } from '@torcida/db'
import { getVisibleTenantIds } from './hierarquia'

/**
 * Cláusula `where` do Prisma que decide quais eventos um associado enxerga:
 * eventos podem ser globais (sedeId nulo, valem pro tenant inteiro) ou
 * restritos a uma unidade específica dentro do próprio tenant (sedeId
 * preenchido, só quem tem vínculo com aquela unidade vê); eventos de
 * tenants ancestrais (sede-mãe) cascadeiam só quando globais dentro do
 * tenant de origem — um evento restrito a uma unidade da sede-mãe não diz
 * respeito a uma subsede/PDE diferente.
 */
export async function getEscopoEventosVisiveis(tenantId: string, userId: string | undefined) {
  const [membro, tenantsVisiveis] = await Promise.all([
    userId
      ? db.saasMembro.findUnique({
          where: { tenantId_userId: { tenantId, userId } },
          select: { sedeId: true },
        })
      : null,
    // eventos é recurso PÚBLICO → inclui ancestrais (ver getVisibleTenantIds)
    getVisibleTenantIds(tenantId, 'eventos'),
  ])
  const ancestrais = tenantsVisiveis.filter((id) => id !== tenantId)

  return {
    OR: [
      {
        tenantId,
        ...(membro?.sedeId
          ? { OR: [{ sedeId: null }, { sedeId: membro.sedeId }] }
          : { sedeId: null }),
      },
      ...(ancestrais.length > 0 ? [{ tenantId: { in: ancestrais }, sedeId: null }] : []),
    ],
  }
}

export interface ProximoEventoItem {
  id: string
  titulo: string
  data: Date
  local: string | null
}

export interface EventoComposerItem {
  id: string
  titulo: string
  data: Date
  local: string | null
}

/** Eventos futuros visíveis para vincular a um post no composer. */
export async function getEventosParaComposer(
  tenantId: string,
  userId?: string,
): Promise<EventoComposerItem[]> {
  const escopo = await getEscopoEventosVisiveis(tenantId, userId)
  const eventos: EventoComposerItem[] = await db.evento.findMany({
    where: {
      ...escopo,
      data: { gte: new Date() },
    },
    orderBy: { data: 'asc' },
    take: 8,
    select: { id: true, titulo: true, data: true, local: true },
  })
  return eventos
}

/** Próximo evento futuro visível para o associado no tenant atual. */
export async function getProximoEvento(
  tenantId: string,
  userId?: string,
): Promise<ProximoEventoItem | null> {
  const escopo = await getEscopoEventosVisiveis(tenantId, userId)
  const evento: ProximoEventoItem | null = await db.evento.findFirst({
    where: {
      ...escopo,
      data: { gte: new Date() },
    },
    orderBy: { data: 'asc' },
    select: { id: true, titulo: true, data: true, local: true },
  })
  return evento
}
