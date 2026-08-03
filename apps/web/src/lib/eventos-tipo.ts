import { cache } from 'react'
import { db } from '@torcida/db'
import type { TipoEvento, RsvpStatus } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { getEscopoEventosVisiveis } from '@/lib/eventos'

export type EventoPorTipoLite = {
  id: string
  tipo: TipoEvento
  titulo: string
  descricao: string | null
  data: Date
  local: string | null
  valorVaga: { toNumber(): number } | number | null
  capacidade: number | null
  _count: { rsvps: number }
}

export type EventoEmbarqueLite = {
  id: string
  tipo: TipoEvento
  titulo: string
  descricao: string | null
  fotoUrl: string | null
  data: Date
  local: string | null
  lat: number | null
  lng: number | null
  valorVaga: { toNumber(): number } | number | null
  capacidade: number | null
  sedeNome: string | null
  sede: { capacidade: number | null } | null
  partida: {
    adversario: string
    competicao: string | null
    dataHora: Date
    local: string | null
    mando: 'CASA' | 'FORA'
    status: string
    placarCasa: number | null
    placarFora: number | null
  } | null
  rsvps: Array<{
    id: string
    status: RsvpStatus
    checkedInAt: Date | null
    user: {
      id: string
      nome: string | null
      email: string
      avatarUrl: string | null
    }
  }>
  /**
   * Status da cobrança AVULSA da vaga por userId. Vazio quando ninguém gerou
   * cobrança ainda. Só preenchido no loader — nunca passa a client cru.
   */
  cobrancasPorUserId: Record<string, string>
}

export const listarEventosPorTipo = cache(async function listarEventosPorTipo(
  tenantId: string,
  tipo: TipoEvento,
  opts?: { futuros?: boolean; limite?: number; userId?: string },
): Promise<EventoPorTipoLite[]> {
  const agora = new Date()
  const escopo = opts?.userId
    ? await getEscopoEventosVisiveis(tenantId, opts.userId)
    : { tenantId }

  const where: Prisma.EventoWhereInput = {
    ...escopo,
    tipo,
  }
  if (opts?.futuros) where.data = { gte: agora }
  else if (opts?.futuros === false) where.data = { lt: agora }

  const rows: EventoPorTipoLite[] = await db.evento.findMany({
    where,
    orderBy: { data: opts?.futuros === false ? 'desc' : 'asc' },
    take: opts?.limite ?? 40,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descricao: true,
      data: true,
      local: true,
      valorVaga: true,
      capacidade: true,
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })
  return rows
})

export const carregarPainelEventosTipo = cache(async function carregarPainelEventosTipo(
  tenantId: string,
  tipo: TipoEvento,
  recentes = 5,
): Promise<{
  proximos: EventoPorTipoLite[]
  totalProximos: number
  confirmadosProximos: number
}> {
  const agora = new Date()
  type AggRow = { id: string; _count: { rsvps: number } }
  const [proximos, agg]: [EventoPorTipoLite[], AggRow[]] = await Promise.all([
    listarEventosPorTipo(tenantId, tipo, { futuros: true, limite: recentes }),
    db.evento.findMany({
      where: { tenantId, tipo, data: { gte: agora } },
      select: {
        id: true,
        _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
      },
    }),
  ])

  return {
    proximos,
    totalProximos: agg.length,
    confirmadosProximos: agg.reduce((s, e) => s + e._count.rsvps, 0),
  }
})

export const listarProximosEventosTenant = cache(async function listarProximosEventosTenant(
  tenantId: string,
  limite = 5,
  tipos?: TipoEvento[],
): Promise<EventoPorTipoLite[]> {
  const where: Prisma.EventoWhereInput = {
    tenantId,
    data: { gte: new Date() },
    ...(tipos && tipos.length > 0 ? { tipo: { in: tipos } } : {}),
  }
  const rows: EventoPorTipoLite[] = await db.evento.findMany({
    where,
    orderBy: { data: 'asc' },
    take: limite,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descricao: true,
      data: true,
      local: true,
      valorVaga: true,
      capacidade: true,
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })
  return rows
})

export const getEventoEmbarque = cache(async function getEventoEmbarque(
  tenantId: string,
  eventoId: string,
  tipoEsperado?: TipoEvento,
): Promise<EventoEmbarqueLite | null> {
  const row = await db.evento.findFirst({
    where: {
      id: eventoId,
      tenantId,
      ...(tipoEsperado ? { tipo: tipoEsperado } : {}),
    },
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descricao: true,
      fotoUrl: true,
      data: true,
      local: true,
      lat: true,
      lng: true,
      valorVaga: true,
      capacidade: true,
      sede: { select: { capacidade: true, nome: true } },
      partida: {
        select: {
          adversario: true,
          competicao: true,
          dataHora: true,
          local: true,
          mando: true,
          status: true,
          placarCasa: true,
          placarFora: true,
        },
      },
      rsvps: {
        orderBy: [{ status: 'asc' }, { criadoEm: 'asc' }],
        select: {
          id: true,
          status: true,
          checkedInAt: true,
          user: {
            select: { id: true, nome: true, email: true, avatarUrl: true },
          },
        },
      },
    },
  })
  if (!row) return null

  // Cobranças da vaga (C1) — join natural com RSVP por userId. Carrega sempre
  // para o caller decidir; caravana sem valorVaga ignora no resolver.
  const cobrancas: Array<{ userId: string; status: string }> =
    await db.cobrancaAssociacao.findMany({
      where: { tenantId, eventoId: row.id },
      select: { userId: true, status: true },
    })
  const cobrancasPorUserId: Record<string, string> = {}
  for (const c of cobrancas) cobrancasPorUserId[c.userId] = c.status

  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    descricao: row.descricao,
    fotoUrl: row.fotoUrl,
    data: row.data,
    local: row.local,
    lat: row.lat,
    lng: row.lng,
    valorVaga: row.valorVaga,
    capacidade: row.capacidade,
    sedeNome: row.sede?.nome ?? null,
    sede: row.sede ? { capacidade: row.sede.capacidade } : null,
    partida: row.partida,
    rsvps: row.rsvps,
    cobrancasPorUserId,
  }
})

/**
 * Mapa userId → status da cobrança AVULSA do evento. Usado pelo admin (query
 * própria) e pelo check-in quando o loader completo não está em mãos.
 */
export async function carregarCobrancasVagaEvento(
  tenantId: string,
  eventoId: string,
): Promise<Record<string, string>> {
  const cobrancas: Array<{ userId: string; status: string }> =
    await db.cobrancaAssociacao.findMany({
      where: { tenantId, eventoId },
      select: { userId: true, status: true },
    })
  const out: Record<string, string> = {}
  for (const c of cobrancas) out[c.userId] = c.status
  return out
}

/**
 * Projetos abertos do tenant para o seletor Agenda ↔ Projeto.
 * Só PLANEJADO/ATIVO — concluído/cancelado some da lista de vínculo novo.
 */
export async function listarProjetosParaEvento(
  tenantId: string,
): Promise<Array<{ id: string; titulo: string; departamentoNome: string }>> {
  const rows: Array<{
    id: string
    titulo: string
    departamento: { nome: string }
  }> = await db.projeto.findMany({
    where: {
      tenantId,
      status: { in: ['PLANEJADO', 'ATIVO'] },
    },
    orderBy: [{ titulo: 'asc' }],
    take: 100,
    select: {
      id: true,
      titulo: true,
      departamento: { select: { nome: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    departamentoNome: r.departamento.nome,
  }))
}
