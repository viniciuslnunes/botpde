import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import { resumirEscala, pendenciasEscala, resumoElegibilidade } from '@torcida/types'
import { avaliarBeneficioParaPessoas } from '@/lib/elegibilidade'

/**
 * Escala da operação (quem trabalha) cruzada com a presença real, que continua
 * morando em `EventoRsvp.checkedInAt` — a escala não guarda check-in próprio
 * para não criar uma segunda verdade sobre comparecimento.
 */

const HORA_MS = 60 * 60 * 1000

export type EscalaItem = {
  id: string
  userId: string
  nome: string
  avatarUrl: string | null
  funcao: string
  status: string
  observacao: string | null
  areaId: string | null
  areaNome: string | null
  respondidoEm: Date | null
  /** Presença lida do RSVP do mesmo par (evento, pessoa). */
  checkedInAt: Date | null
  /** RSVP declarado — escalado que nem confirmou presença é sinal de risco. */
  rsvpStatus: string | null
  /** Ressalva de elegibilidade (inadimplente, carteirinha vencida). */
  alerta: { texto: string; tom: string } | null
}

export type EscalaDoEvento = {
  itens: EscalaItem[]
  resumo: ReturnType<typeof resumirEscala>
  pendencias: ReturnType<typeof pendenciasEscala>
}

type EscalaRow = {
  id: string
  userId: string
  funcao: string
  status: string
  observacao: string | null
  areaId: string | null
  respondidoEm: Date | null
  user: { nome: string | null; avatarUrl: string | null }
  area: { nome: string } | null
}

function horasAte(data: Date, agora: Date): number {
  return (data.getTime() - agora.getTime()) / HORA_MS
}

/**
 * Escala completa de um evento. Duas queries: os postos e os RSVPs de quem
 * está escalado (para a presença), em vez de um join por linha.
 */
export const carregarEscalaEvento = cache(async function carregarEscalaEvento(
  tenantId: string,
  eventoId: string,
  opts?: { dataEvento?: Date; agora?: Date },
): Promise<EscalaDoEvento> {
  const agora = opts?.agora ?? new Date()

  const linhas: EscalaRow[] = await db.eventoEscala.findMany({
    where: { tenantId, eventoId },
    orderBy: [{ funcao: 'asc' }, { criadoEm: 'asc' }],
    select: {
      id: true,
      userId: true,
      funcao: true,
      status: true,
      observacao: true,
      areaId: true,
      respondidoEm: true,
      user: { select: { nome: true, avatarUrl: true } },
      area: { select: { nome: true } },
    },
  })

  const userIds = linhas.map((l) => l.userId)
  const rsvps: Array<{ userId: string; checkedInAt: Date | null; status: string }> =
    userIds.length === 0
      ? []
      : await db.eventoRsvp.findMany({
          where: { eventoId, userId: { in: userIds } },
          select: { userId: true, checkedInAt: true, status: true },
        })

  const rsvpPorUser = new Map(rsvps.map((r) => [r.userId, r]))

  // Quem já está escalado pode ter mudado de situação depois da convocação —
  // a ressalva é lida agora, não congelada no ato de escalar.
  const elegibilidade = await avaliarBeneficioParaPessoas(tenantId, 'ESCALA', userIds)

  const itens: EscalaItem[] = linhas.map((l) => {
    const rsvp = rsvpPorUser.get(l.userId) ?? null
    return {
      id: l.id,
      userId: l.userId,
      nome: l.user.nome ?? 'Sem nome',
      avatarUrl: l.user.avatarUrl,
      funcao: l.funcao,
      status: l.status,
      observacao: l.observacao,
      areaId: l.areaId,
      areaNome: l.area?.nome ?? null,
      respondidoEm: l.respondidoEm,
      checkedInAt: rsvp?.checkedInAt ?? null,
      rsvpStatus: rsvp?.status ?? null,
      alerta: resumoElegibilidade(elegibilidade.get(l.userId) ?? null),
    }
  })

  const resumo = resumirEscala(itens)
  const pendencias = opts?.dataEvento
    ? pendenciasEscala({ resumo, horasAteEvento: horasAte(opts.dataEvento, agora) })
    : []

  return { itens, resumo, pendencias }
})

export type EscalaPendenciaEvento = {
  eventoId: string
  titulo: string
  data: Date
  /** Texto da pendência mais grave daquele evento. */
  texto: string
  severidade: 'alta' | 'media' | 'baixa'
}

const ORDEM_SEVERIDADE: Record<string, number> = { alta: 0, media: 1, baixa: 2 }

/**
 * Pendências de escala dos próximos eventos de um recorte (hub thin) — uma
 * query só para todos, porque o posto de comando não pode pagar N+1.
 *
 * Recebe os eventos que o hub já carregou: o dono de "quais eventos são meus"
 * continua sendo o hub (tipo, departamento, projeto), não este helper.
 */
export async function carregarPendenciasEscala(
  tenantId: string,
  eventos: ReadonlyArray<{ id: string; titulo: string; data: Date }>,
  opts?: { agora?: Date; limite?: number },
): Promise<EscalaPendenciaEvento[]> {
  if (eventos.length === 0) return []
  const agora = opts?.agora ?? new Date()
  const limite = opts?.limite ?? 5
  const eventoIds = eventos.map((e) => e.id)

  const linhas: Array<{ eventoId: string; funcao: string; status: string }> =
    await db.eventoEscala.findMany({
      where: { tenantId, eventoId: { in: eventoIds } },
      select: { eventoId: true, funcao: true, status: true },
    })

  const porEvento = new Map<string, Array<{ funcao: string; status: string }>>()
  for (const l of linhas) {
    const atual = porEvento.get(l.eventoId) ?? []
    atual.push({ funcao: l.funcao, status: l.status })
    porEvento.set(l.eventoId, atual)
  }

  const saida: EscalaPendenciaEvento[] = []
  for (const evento of eventos) {
    const resumo = resumirEscala(porEvento.get(evento.id) ?? [])
    const pendencias = pendenciasEscala({
      resumo,
      horasAteEvento: horasAte(evento.data, agora),
    })
    const pior = pendencias[0]
    if (!pior) continue
    saida.push({
      eventoId: evento.id,
      titulo: evento.titulo,
      data: evento.data,
      texto: pior.texto,
      severidade: pior.severidade as 'alta' | 'media' | 'baixa',
    })
  }

  return saida
    .sort((a, b) => {
      const sev = (ORDEM_SEVERIDADE[a.severidade] ?? 9) - (ORDEM_SEVERIDADE[b.severidade] ?? 9)
      return sev !== 0 ? sev : a.data.getTime() - b.data.getTime()
    })
    .slice(0, limite)
}

export type MembroEscalavel = {
  userId: string
  nome: string
  email: string | null
}

/**
 * Quem pode ser escalado: membro APROVADO do tenant. Escalar não concede
 * permissão nenhuma — é convocação de trabalho, e por isso não filtra por
 * departamento (o bar do jogo é coberto por quem estiver disponível).
 */
export const listarMembrosEscalaveis = cache(async function listarMembrosEscalaveis(
  tenantId: string,
): Promise<MembroEscalavel[]> {
  const rows: Array<{ userId: string; nome: string; user: { email: string | null } }> =
    await db.saasMembro.findMany({
      where: { tenantId, status: 'APROVADO' },
      orderBy: { nome: 'asc' },
      take: 500,
      select: { userId: true, nome: true, user: { select: { email: true } } },
    })
  return rows.map((r) => ({ userId: r.userId, nome: r.nome, email: r.user.email }))
})

/** Postos da pessoa em eventos futuros — bloco "você está escalado" do portal. */
export async function listarMinhasEscalasFuturas(
  tenantId: string,
  userId: string,
  opts?: { agora?: Date; limite?: number },
): Promise<
  Array<{
    id: string
    eventoId: string
    titulo: string
    data: Date
    tipo: string
    funcao: string
    status: string
    observacao: string | null
  }>
> {
  const agora = opts?.agora ?? new Date()
  const rows: Array<{
    id: string
    eventoId: string
    funcao: string
    status: string
    observacao: string | null
    evento: { titulo: string; data: Date; tipo: string }
  }> = await db.eventoEscala.findMany({
    where: {
      tenantId,
      userId,
      status: { in: ['CONVOCADO', 'ACEITO'] },
      evento: { data: { gte: agora } },
    },
    orderBy: { evento: { data: 'asc' } },
    take: opts?.limite ?? 10,
    select: {
      id: true,
      eventoId: true,
      funcao: true,
      status: true,
      observacao: true,
      evento: { select: { titulo: true, data: true, tipo: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    eventoId: r.eventoId,
    titulo: r.evento.titulo,
    data: r.evento.data,
    tipo: r.evento.tipo,
    funcao: r.funcao,
    status: r.status,
    observacao: r.observacao,
  }))
}
