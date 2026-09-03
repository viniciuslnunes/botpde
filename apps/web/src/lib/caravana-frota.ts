import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import { resumirFrota, pendenciasFrota } from '@torcida/types'

/**
 * Frota da caravana — os veículos e quem viaja em cada um.
 *
 * A alocação mora em `EventoRsvp.veiculoId`: o unique (evento, pessoa) já
 * garante "uma pessoa, um ônibus", então uma tabela de passageiros só criaria
 * uma segunda verdade sobre quem está confirmado.
 */

const HORA_MS = 60 * 60 * 1000

export type VeiculoDaCaravana = {
  id: string
  identificacao: string
  placa: string | null
  empresa: string | null
  capacidade: number
  responsavelId: string | null
  responsavelNome: string | null
  pontoEmbarque: string | null
  horarioEmbarque: Date | null
  observacao: string | null
  ocupados: number
  livres: number
  lotado: boolean
}

export type PassageiroDaCaravana = {
  userId: string
  nome: string
  telefone: string | null
  veiculoId: string | null
  checkedInAt: Date | null
}

export type FrotaDaCaravana = {
  veiculos: VeiculoDaCaravana[]
  passageiros: PassageiroDaCaravana[]
  resumo: ReturnType<typeof resumirFrota>
  pendencias: ReturnType<typeof pendenciasFrota>
}

type VeiculoRow = {
  id: string
  identificacao: string
  placa: string | null
  empresa: string | null
  capacidade: number
  responsavelId: string | null
  pontoEmbarque: string | null
  horarioEmbarque: Date | null
  observacao: string | null
  responsavel: { nome: string | null } | null
}

type RsvpRow = {
  userId: string
  status: string
  veiculoId: string | null
  checkedInAt: Date | null
  user: { nome: string | null }
}

export const carregarFrotaCaravana = cache(async function carregarFrotaCaravana(
  tenantId: string,
  eventoId: string,
  opts?: { dataEvento?: Date; agora?: Date },
): Promise<FrotaDaCaravana> {
  const agora = opts?.agora ?? new Date()

  const [veiculos, rsvps]: [VeiculoRow[], RsvpRow[]] = await Promise.all([
    db.caravanaVeiculo.findMany({
      where: { tenantId, eventoId },
      orderBy: { identificacao: 'asc' },
      select: {
        id: true,
        identificacao: true,
        placa: true,
        empresa: true,
        capacidade: true,
        responsavelId: true,
        pontoEmbarque: true,
        horarioEmbarque: true,
        observacao: true,
        responsavel: { select: { nome: true } },
      },
    }) as Promise<VeiculoRow[]>,
    db.eventoRsvp.findMany({
      where: { eventoId, status: 'CONFIRMADO' },
      orderBy: { criadoEm: 'asc' },
      select: {
        userId: true,
        status: true,
        veiculoId: true,
        checkedInAt: true,
        user: { select: { nome: true } },
      },
    }) as Promise<RsvpRow[]>,
  ])

  // Telefone vem do cadastro de membro do tenant — o manifesto precisa de um
  // contato por passageiro, e `User` não é a fonte disso.
  const telefones: Array<{ userId: string; telefone: string | null }> =
    rsvps.length === 0
      ? []
      : await db.saasMembro.findMany({
          where: { tenantId, userId: { in: rsvps.map((r) => r.userId) } },
          select: { userId: true, telefone: true },
        })
  const telefonePorUser = new Map(telefones.map((t) => [t.userId, t.telefone]))

  const resumo = resumirFrota(
    veiculos.map((v) => ({
      id: v.id,
      identificacao: v.identificacao,
      capacidade: v.capacidade,
      temResponsavel: v.responsavelId != null,
    })),
    rsvps.map((r) => ({
      userId: r.userId,
      veiculoId: r.veiculoId,
      confirmado: r.status === 'CONFIRMADO',
    })),
  )

  const ocupacaoPorVeiculo = new Map(resumo.veiculos.map((v) => [v.id, v]))

  return {
    veiculos: veiculos.map((v) => {
      const ocup = ocupacaoPorVeiculo.get(v.id)
      return {
        id: v.id,
        identificacao: v.identificacao,
        placa: v.placa,
        empresa: v.empresa,
        capacidade: v.capacidade,
        responsavelId: v.responsavelId,
        responsavelNome: v.responsavel?.nome ?? null,
        pontoEmbarque: v.pontoEmbarque,
        horarioEmbarque: v.horarioEmbarque,
        observacao: v.observacao,
        ocupados: ocup?.ocupados ?? 0,
        livres: ocup?.livres ?? v.capacidade,
        lotado: ocup?.lotado ?? false,
      }
    }),
    passageiros: rsvps.map((r) => ({
      userId: r.userId,
      nome: r.user.nome ?? 'Sem nome',
      telefone: telefonePorUser.get(r.userId) ?? null,
      veiculoId: r.veiculoId,
      checkedInAt: r.checkedInAt,
    })),
    resumo,
    pendencias: opts?.dataEvento
      ? pendenciasFrota(resumo, (opts.dataEvento.getTime() - agora.getTime()) / HORA_MS)
      : [],
  }
})

/**
 * Pendências de frota das próximas caravanas — para a inbox do hub, sem N+1.
 */
export async function carregarPendenciasFrota(
  tenantId: string,
  eventos: ReadonlyArray<{ id: string; titulo: string; data: Date }>,
  opts?: { agora?: Date; limite?: number },
): Promise<Array<{ eventoId: string; titulo: string; data: Date; texto: string; severidade: string }>> {
  if (eventos.length === 0) return []
  const agora = opts?.agora ?? new Date()
  const ids = eventos.map((e) => e.id)

  const [veiculos, rsvps]: [
    Array<{ id: string; eventoId: string; identificacao: string; capacidade: number; responsavelId: string | null }>,
    Array<{ eventoId: string; userId: string; veiculoId: string | null }>,
  ] = await Promise.all([
    db.caravanaVeiculo.findMany({
      where: { tenantId, eventoId: { in: ids } },
      select: {
        id: true,
        eventoId: true,
        identificacao: true,
        capacidade: true,
        responsavelId: true,
      },
    }),
    db.eventoRsvp.findMany({
      where: { eventoId: { in: ids }, status: 'CONFIRMADO' },
      select: { eventoId: true, userId: true, veiculoId: true },
    }),
  ])

  const saida: Array<{
    eventoId: string
    titulo: string
    data: Date
    texto: string
    severidade: string
  }> = []

  for (const evento of eventos) {
    const resumo = resumirFrota(
      veiculos
        .filter((v) => v.eventoId === evento.id)
        .map((v) => ({
          id: v.id,
          identificacao: v.identificacao,
          capacidade: v.capacidade,
          temResponsavel: v.responsavelId != null,
        })),
      rsvps
        .filter((r) => r.eventoId === evento.id)
        .map((r) => ({ userId: r.userId, veiculoId: r.veiculoId, confirmado: true })),
    )
    const pend = pendenciasFrota(resumo, (evento.data.getTime() - agora.getTime()) / HORA_MS)
    const pior = pend[0]
    if (!pior) continue
    saida.push({
      eventoId: evento.id,
      titulo: evento.titulo,
      data: evento.data,
      texto: pior.texto,
      severidade: pior.severidade,
    })
  }

  return saida.slice(0, opts?.limite ?? 4)
}
