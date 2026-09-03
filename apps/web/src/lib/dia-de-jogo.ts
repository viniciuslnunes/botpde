import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import { resumirEscala, pendenciasEscala } from '@torcida/types'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { linhaSetorArquibancada, resolverSetorArquibancada } from '@/lib/setor-arquibancada'

/**
 * Dia de Jogo — a leitura que faltava.
 *
 * A torcida não opera módulos: opera o domingo. Caravana, escala, bandeira,
 * bateria e bar acontecem no mesmo dia e até aqui só existiam separados, cada
 * um na sua inbox. Esta camada **lê** o que já existe e junta em volta da
 * `Partida`; nada aqui é dono de dado novo, e cada ação continua no módulo de
 * origem.
 */

const HORA_MS = 60 * 60 * 1000

export type OperacaoDoJogo = {
  id: string
  titulo: string
  tipo: string
  data: Date
  local: string | null
  departamentoNome: string | null
  confirmados: number
  capacidade: number | null
  /** Postos ativos na escala desta operação. */
  postos: number
  /** Pendência mais grave da escala (ou null quando está de pé). */
  alertaEscala: { texto: string; severidade: string } | null
  materialEmCampo: number
}

export type DiaDeJogo = {
  partida: {
    id: string
    adversario: string
    competicao: string | null
    dataHora: Date
    local: string | null
    mando: string
    status: string
  }
  operacoes: OperacaoDoJogo[]
  /**
   * Setor e portão da torcida no estádio — cadastro da Sede raiz, com lastro na
   * lei paulista 17.832/2023 (acesso em horário diferenciado). Já existia e
   * nunca tinha uso operacional no dia do jogo.
   */
  arquibancada: { linha: string; portao: string | null } | null
  totais: {
    operacoes: number
    confirmados: number
    postos: number
    postosSemResposta: number
    materialEmCampo: number
    semCoordenacao: number
  }
  horasAteJogo: number
}

/**
 * Carrega o dia inteiro em quatro consultas (eventos, escalas, material, sede),
 * nunca uma por operação: esta tela é aberta na véspera, com pressa.
 */
export const carregarDiaDeJogo = cache(async function carregarDiaDeJogo(
  tenantId: string,
  partidaId: string,
  opts?: { agora?: Date },
): Promise<DiaDeJogo | null> {
  const agora = opts?.agora ?? new Date()

  type PartidaRow = {
    id: string
    adversario: string
    competicao: string | null
    dataHora: Date
    local: string | null
    mando: string
    status: string
  }
  const partida: PartidaRow | null = (await db.partida.findUnique({
    where: { id: partidaId },
    select: {
      id: true,
      adversario: true,
      competicao: true,
      dataHora: true,
      local: true,
      mando: true,
      status: true,
    },
  })) as PartidaRow | null
  if (!partida) return null

  type EventoRow = {
    id: string
    titulo: string
    tipo: string
    data: Date
    local: string | null
    capacidade: number | null
    sede: { capacidade: number | null; nome: string } | null
    departamento: { nome: string } | null
    _count: { rsvps: number }
  }
  const eventos: EventoRow[] = (await db.evento.findMany({
    where: { tenantId, partidaId },
    orderBy: { data: 'asc' },
    take: 30,
    select: {
      id: true,
      titulo: true,
      tipo: true,
      data: true,
      local: true,
      capacidade: true,
      sede: { select: { capacidade: true, nome: true } },
      departamento: { select: { nome: true } },
      _count: { select: { rsvps: { where: { status: 'CONFIRMADO' } } } },
    },
  })) as EventoRow[]

  const eventoIds = eventos.map((e) => e.id)

  const [escalas, material, setor]: [
    Array<{ eventoId: string; funcao: string; status: string }>,
    Array<{ eventoId: string | null; _count: { _all: number } }>,
    Awaited<ReturnType<typeof resolverSetorArquibancada>>,
  ] = await Promise.all([
    eventoIds.length === 0
      ? Promise.resolve([])
      : db.eventoEscala.findMany({
          where: { tenantId, eventoId: { in: eventoIds } },
          select: { eventoId: true, funcao: true, status: true },
        }),
    eventoIds.length === 0
      ? Promise.resolve([])
      : db.patrimonioEmprestimo.groupBy({
          by: ['eventoId'],
          where: { tenantId, status: 'ABERTO', eventoId: { in: eventoIds } },
          _count: { _all: true },
        }),
    resolverSetorArquibancada(tenantId),
  ])

  const escalaPorEvento = new Map<string, Array<{ funcao: string; status: string }>>()
  for (const e of escalas) {
    const atual = escalaPorEvento.get(e.eventoId) ?? []
    atual.push({ funcao: e.funcao, status: e.status })
    escalaPorEvento.set(e.eventoId, atual)
  }
  const materialPorEvento = new Map(
    material.flatMap((m) => (m.eventoId ? [[m.eventoId, m._count._all] as const] : [])),
  )

  let postos = 0
  let postosSemResposta = 0
  let semCoordenacao = 0
  let confirmados = 0
  let materialEmCampo = 0

  const operacoes: OperacaoDoJogo[] = eventos.map((e) => {
    const linhas = escalaPorEvento.get(e.id) ?? []
    const resumo = resumirEscala(linhas)
    const pend = pendenciasEscala({
      resumo,
      horasAteEvento: (e.data.getTime() - agora.getTime()) / HORA_MS,
    })
    const emCampo = materialPorEvento.get(e.id) ?? 0

    postos += resumo.total
    postosSemResposta += resumo.aguardando
    if (!resumo.temCoordenacao) semCoordenacao += 1
    confirmados += e._count.rsvps
    materialEmCampo += emCampo

    return {
      id: e.id,
      titulo: e.titulo,
      tipo: e.tipo,
      data: e.data,
      local: e.local,
      departamentoNome: e.departamento?.nome ?? null,
      confirmados: e._count.rsvps,
      capacidade: capacidadeEfetiva({ capacidade: e.capacidade, sede: e.sede }),
      postos: resumo.total,
      alertaEscala: pend[0] ? { texto: pend[0].texto, severidade: pend[0].severidade } : null,
      materialEmCampo: emCampo,
    }
  })

  return {
    partida,
    operacoes,
    arquibancada: setor
      ? { linha: linhaSetorArquibancada(setor), portao: setor.portao }
      : null,
    totais: {
      operacoes: operacoes.length,
      confirmados,
      postos,
      postosSemResposta,
      materialEmCampo,
      semCoordenacao,
    },
    horasAteJogo: (partida.dataHora.getTime() - agora.getTime()) / HORA_MS,
  }
})

/** Próximos jogos com operação montada — entrada do painel na Agenda. */
export async function listarJogosComOperacao(
  tenantId: string,
  opts?: { agora?: Date; limite?: number },
): Promise<Array<{ partidaId: string; adversario: string; dataHora: Date; operacoes: number }>> {
  const agora = opts?.agora ?? new Date()

  const grupos: Array<{ partidaId: string | null; _count: { _all: number } }> =
    await db.evento.groupBy({
      by: ['partidaId'],
      where: { tenantId, partidaId: { not: null }, data: { gte: agora } },
      _count: { _all: true },
    })

  const ids = grupos.flatMap((g) => (g.partidaId ? [g.partidaId] : []))
  if (ids.length === 0) return []

  const partidas: Array<{ id: string; adversario: string; dataHora: Date }> =
    await db.partida.findMany({
      where: { id: { in: ids } },
      orderBy: { dataHora: 'asc' },
      take: opts?.limite ?? 5,
      select: { id: true, adversario: true, dataHora: true },
    })

  const contagem = new Map(grupos.map((g) => [g.partidaId, g._count._all]))
  return partidas.map((p) => ({
    partidaId: p.id,
    adversario: p.adversario,
    dataHora: p.dataHora,
    operacoes: contagem.get(p.id) ?? 0,
  }))
}
