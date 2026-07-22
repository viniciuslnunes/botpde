import { cache } from 'react'
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
export const getEscopoEventosVisiveis = cache(async function getEscopoEventosVisiveis(
  tenantId: string,
  userId: string | undefined,
) {
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
})

export interface ProximoEventoItem {
  id: string
  titulo: string
  data: Date
  local: string | null
}

/** Props do composer (client) — `data` serializada como ISO na fronteira RSC. */
export interface EventoComposerItem {
  id: string
  titulo: string
  data: string
  local: string | null
}

/** Eventos futuros visíveis para vincular a um post no composer. */
const getEventosFuturosVisiveis = cache(async function getEventosFuturosVisiveis(
  tenantId: string,
  userId?: string,
): Promise<Array<{ id: string; titulo: string; data: Date; local: string | null }>> {
  const escopo = await getEscopoEventosVisiveis(tenantId, userId)
  return db.evento.findMany({
    where: {
      ...escopo,
      data: { gte: new Date() },
    },
    orderBy: { data: 'asc' },
    take: 8,
    select: { id: true, titulo: true, data: true, local: true },
  })
})

/** Eventos futuros visíveis para vincular a um post no composer. */
export async function getEventosParaComposer(
  tenantId: string,
  userId?: string,
): Promise<EventoComposerItem[]> {
  const eventos = await getEventosFuturosVisiveis(tenantId, userId)
  return eventos.map((e: { id: string; titulo: string; data: Date; local: string | null }) => ({
    id: e.id,
    titulo: e.titulo,
    data: e.data.toISOString(),
    local: e.local,
  }))
}

/** Próximo evento futuro visível para o associado no tenant atual. */
export async function getProximoEvento(
  tenantId: string,
  userId?: string,
): Promise<ProximoEventoItem | null> {
  const eventos = await getEventosFuturosVisiveis(tenantId, userId)
  return eventos[0] ?? null
}

export interface EventoUnidadeItem {
  id: string
  titulo: string
  tipo: string
  data: Date
  local: string | null
  rsvps: number
}

/**
 * Eventos da PRÓPRIA unidade (tenant alvo) — read-only, para o drill-down R1 do
 * Presidente (`/admin/torcida/unidade/[tenantId]`). Não cascateia ancestrais nem
 * filtra por vínculo de membro: é a agenda daquela unidade, do mais recente ao
 * mais antigo.
 */
export const listarEventosDaUnidade = cache(async function listarEventosDaUnidade(
  tenantId: string,
  limite = 20,
): Promise<EventoUnidadeItem[]> {
  const rows: Array<{
    id: string
    titulo: string
    tipo: string
    data: Date
    local: string | null
    _count: { rsvps: number }
  }> = await db.evento.findMany({
    where: { tenantId },
    orderBy: { data: 'desc' },
    take: limite,
    select: {
      id: true,
      titulo: true,
      tipo: true,
      data: true,
      local: true,
      _count: { select: { rsvps: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    tipo: r.tipo,
    data: r.data,
    local: r.local,
    rsvps: r._count.rsvps,
  }))
})

/** Label relativa para o próximo evento (Hoje / Amanhã / Em N dias). */
export function diasParaEvento(data: Date): string {
  const diff = Math.ceil((new Date(data).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return `Em ${diff} dias`
}
