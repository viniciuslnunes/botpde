import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import {
  lotacaoPorPagamento,
  resumirEmbarqueComPagamento,
  resolverStatusVaga,
  temValorVaga,
  caravanaProcedimentoEmUrgencia,
  caravanaProcedimentoProgress,
} from '@torcida/types'
import { capacidadeEfetiva } from '@/lib/eventos-capacidade'
import { diasParaEvento } from '@/lib/eventos'
import {
  ADMIN_DIRECAO_TTL,
  tagAdminDirecao,
} from '@/lib/admin-direcao-cache'
import {
  formatarDataEventoAdmin,
  slaLabel,
  type AdminEventoListaItem,
  type AdminInboxItem,
} from '@/lib/admin-inbox'
import {
  carregarPartidasSemanaTenant,
  janelaSemanaCorrente,
  serializarEventosSemana,
} from '@/lib/departamento-semana'
import type { AgendaSemanaCompactItem, AgendaSemanaPartidaItem } from '@/components/eventos/agenda-semana-compact'
import { dayKeyInZone } from '@/lib/format-datetime'
import { carregarPendenciasEscala } from '@/lib/escala'
import { carregarPendenciasFrota } from '@/lib/caravana-frota'

const DIA_MS = 24 * 60 * 60 * 1000

export type CaravanaOpsResumo = {
  proximas: number
  lotacaoCritica: number
  pagantesSemEmbarque: number
  confirmadosSemPagar: number
  pendencias: AdminInboxItem[]
  /** Lista para a home — evita segundo findMany na page. */
  lista: AdminEventoListaItem[]
  semana: AgendaSemanaCompactItem[]
  partidasSemana: AgendaSemanaPartidaItem[]
}

function labelPartida(p: {
  adversario: string
  mando: string
} | null | undefined): string | null {
  if (!p) return null
  const mando = p.mando === 'CASA' ? 'Casa' : p.mando === 'FORA' ? 'Fora' : null
  return mando ? `vs ${p.adversario} · ${mando}` : `vs ${p.adversario}`
}

async function fetchDirecaoCaravanas(tenantId: string): Promise<Omit<CaravanaOpsResumo, 'partidasSemana'>> {
  const agora = new Date()
  const horizonte = new Date(agora.getTime() + 45 * DIA_MS)
  const semana = janelaSemanaCorrente(agora)

  type Row = {
    id: string
    titulo: string
    descricao: string | null
    data: Date
    local: string | null
    fotoUrl: string | null
    serieId: string | null
    partidaId: string | null
    meta: unknown
    valorVaga: { toNumber(): number } | number | null
    capacidade: number | null
    sede: { capacidade: number | null } | null
    partida: { adversario: string; mando: string } | null
    rsvps: Array<{
      status: string
      checkedInAt: Date | null
      userId: string
    }>
  }

  const [eventos, eventosSemana]: [Row[], Row[]] = await Promise.all([
    db.evento.findMany({
      where: {
        tenantId,
        tipo: 'CARAVANA',
        data: { gte: agora, lte: horizonte },
      },
      orderBy: { data: 'asc' },
      take: 12,
      select: {
        id: true,
        titulo: true,
        descricao: true,
        data: true,
        local: true,
        fotoUrl: true,
        serieId: true,
        partidaId: true,
        meta: true,
        valorVaga: true,
        capacidade: true,
        sede: { select: { capacidade: true } },
        partida: { select: { adversario: true, mando: true } },
        rsvps: {
          where: { status: { in: ['CONFIRMADO', 'LISTA_ESPERA'] } },
          select: { status: true, checkedInAt: true, userId: true },
        },
      },
    }) as Promise<Row[]>,
    db.evento.findMany({
      where: {
        tenantId,
        tipo: 'CARAVANA',
        data: { gte: semana.gte, lt: semana.lt },
      },
      orderBy: { data: 'asc' },
      take: 40,
      select: {
        id: true,
        titulo: true,
        descricao: true,
        data: true,
        local: true,
        fotoUrl: true,
        serieId: true,
        partidaId: true,
        meta: true,
        valorVaga: true,
        capacidade: true,
        sede: { select: { capacidade: true } },
        partida: { select: { adversario: true, mando: true } },
        rsvps: {
          where: { status: { in: ['CONFIRMADO', 'LISTA_ESPERA'] } },
          select: { status: true, checkedInAt: true, userId: true },
        },
      },
    }) as Promise<Row[]>,
  ])

  const ids = eventos.map((e) => e.id)
  const cobrancas: Array<{ eventoId: string | null; userId: string; status: string }> =
    ids.length === 0
      ? []
      : await db.cobrancaAssociacao.findMany({
          where: { tenantId, eventoId: { in: ids } },
          select: { eventoId: true, userId: true, status: true },
        })

  const cobPorEvento = new Map<string, Map<string, string>>()
  for (const c of cobrancas) {
    if (!c.eventoId) continue
    let m = cobPorEvento.get(c.eventoId)
    if (!m) {
      m = new Map()
      cobPorEvento.set(c.eventoId, m)
    }
    m.set(c.userId, c.status)
  }

  let lotacaoCritica = 0
  let pagantesSemEmbarque = 0
  let confirmadosSemPagar = 0
  const pendencias: AdminInboxItem[] = []
  const lista: AdminEventoListaItem[] = []

  for (const e of eventos) {
    const valorVagaNum =
      e.valorVaga == null
        ? null
        : typeof e.valorVaga === 'number'
          ? e.valorVaga
          : e.valorVaga.toNumber()
    const paga = lotacaoPorPagamento(valorVagaNum)
    const cap = capacidadeEfetiva({
      capacidade: e.capacidade,
      sede: e.sede,
    })
    const cobMap = cobPorEvento.get(e.id) ?? new Map()

    const confirmados = e.rsvps.filter((r) => r.status === 'CONFIRMADO')
    const linhas = confirmados.map((r) => {
      const status = resolverStatusVaga({
        valorVaga: valorVagaNum,
        cobrancaStatus: cobMap.get(r.userId) ?? null,
        checkedInAt: r.checkedInAt,
      })
      return { ...status, confirmado: true as const, userId: r.userId }
    })
    const resumo = resumirEmbarqueComPagamento(linhas)

    const ocupacao = paga ? resumo.pagos : resumo.confirmados
    const unidade = paga ? 'pagos' : 'confirmados'
    lista.push({
      id: e.id,
      titulo: e.titulo,
      descricao: e.descricao,
      dataLabel: formatarDataEventoAdmin(e.data),
      local: e.local,
      fotoUrl: e.fotoUrl,
      confirmados: ocupacao,
      capacidade: cap,
      passado: false,
      tipo: 'CARAVANA',
      serieId: e.serieId,
      lotacaoLabel:
        cap != null ? `${ocupacao}/${cap} ${unidade}` : `${ocupacao} ${unidade}`,
      diasLabel: diasParaEvento(e.data),
      partidaLabel: labelPartida(e.partida),
    })

    const slaAte = slaLabel(e.data, { agora, modo: 'ate' })

    if (!e.partidaId) {
      pendencias.push({
        id: `part-${e.id}`,
        titulo: `Sem partida · ${e.titulo}`,
        detalhe: 'Vincule ao jogo do dia para cruzar caravana e operação na sede.',
        href: `/admin/caravanas/${e.id}?tab=editar`,
        tom: 'warning',
        sla: slaAte,
      })
    }

    if (cap != null && cap > 0 && ocupacao / cap >= 0.9) {
      lotacaoCritica += 1
      pendencias.push({
        id: `lot-${e.id}`,
        titulo: `Lotação crítica · ${e.titulo}`,
        detalhe: `${ocupacao}/${cap} ${unidade} (≥ 90%)`,
        href: `/admin/caravanas/${e.id}?tab=presenca`,
        tom: 'danger',
        sla: slaAte,
      })
    }

    const horasPara = (e.data.getTime() - agora.getTime()) / (60 * 60 * 1000)
    if (paga && temValorVaga(valorVagaNum) && horasPara <= 72 && resumo.pagosFaltando > 0) {
      pagantesSemEmbarque += resumo.pagosFaltando
      const primeiro = linhas.find(
        (l) => l.pagamento === 'PAGO' && l.embarque !== 'EMBARCADO',
      )
      pendencias.push({
        id: `emb-${e.id}`,
        titulo: `${resumo.pagosFaltando} pago${resumo.pagosFaltando === 1 ? '' : 's'} sem embarque · ${e.titulo}`,
        detalhe: 'Faltam menos de 72h — confira a lista de embarque.',
        href: `/admin/caravanas/${e.id}?tab=presenca`,
        tom: horasPara <= 3 ? 'danger' : 'warning',
        sla: slaAte,
        acao: primeiro
          ? {
              tipo: 'checkin_rsvp',
              eventoId: e.id,
              userId: primeiro.userId,
              label: 'Embarcar 1º',
            }
          : null,
      })
    }

    if (paga && resumo.pendentesPagamento > 0 && pendencias.length < 12) {
      confirmadosSemPagar += resumo.pendentesPagamento
      pendencias.push({
        id: `pag-${e.id}`,
        titulo: `${resumo.pendentesPagamento} confirmado${resumo.pendentesPagamento === 1 ? '' : 's'} sem pagar · ${e.titulo}`,
        detalhe: 'RSVP confirmado com cobrança em aberto — não ocupa vaga paga.',
        href: `/admin/caravanas/${e.id}?tab=presenca`,
        tom: 'warning',
        sla: slaAte,
      })
    }
  }

  // Escala: quem trabalha na viagem. Sem coordenação ninguém responde pela
  // caravana — e é a torcida que responde pelo trajeto (LGE art. 178 §§ 5º-6º).
  const pendenciasEscalaViagem = await carregarPendenciasEscala(
    tenantId,
    eventos.map((e) => ({ id: e.id, titulo: e.titulo, data: e.data })),
    { agora, limite: 4 },
  )
  for (const p of pendenciasEscalaViagem) {
    pendencias.push({
      id: `esc-${p.eventoId}`,
      titulo: `${p.texto} · ${p.titulo}`,
      detalhe: 'Escala da operação: coordenação, condução e embarque.',
      href: `/admin/caravanas/${p.eventoId}?tab=escala`,
      tom: p.severidade === 'alta' ? 'danger' : 'warning',
      sla: slaLabel(p.data, { agora, modo: 'ate' }),
    })
  }

  // Frota: a caravana sai em mais de um ônibus, e assento que falta só
  // aparece quando alguém soma a capacidade dos veículos.
  const pendenciasDaFrota = await carregarPendenciasFrota(
    tenantId,
    eventos.map((e) => ({ id: e.id, titulo: e.titulo, data: e.data })),
    { agora, limite: 4 },
  )
  for (const p of pendenciasDaFrota) {
    pendencias.push({
      id: `frota-${p.eventoId}`,
      titulo: `${p.texto} · ${p.titulo}`,
      detalhe: 'Frota da viagem: veículos, responsáveis e lista de embarque.',
      href: `/admin/caravanas/${p.eventoId}?tab=frota`,
      tom: p.severidade === 'alta' ? 'danger' : 'warning',
      sla: slaLabel(p.data, { agora, modo: 'ate' }),
    })
  }

  for (const e of eventos) {
    if (!caravanaProcedimentoEmUrgencia(e.meta, e.data, agora)) continue
    const prog = caravanaProcedimentoProgress(e.meta)
    pendencias.push({
      id: `proc-${e.id}`,
      titulo: `Checklist pré-embarque incompleto · ${e.titulo}`,
      detalhe: `${prog.done}/${prog.total} itens — faltam menos de 72h.`,
      href: `/admin/caravanas/${e.id}?tab=frota`,
      tom: 'danger',
      sla: slaLabel(e.data, { agora, modo: 'ate' }),
    })
  }

  // Inbox: caravana no dia de jogo sem vínculo (quando há partida no mesmo dayKey).
  // partidasSemana é anexado fora do cache parcial — aqui só eventos.

  return {
    proximas: eventos.length,
    lotacaoCritica,
    pagantesSemEmbarque,
    confirmadosSemPagar,
    pendencias: pendencias.slice(0, 10),
    lista,
    semana: serializarEventosSemana(
      eventosSemana.map((e) => ({
        id: e.id,
        titulo: e.titulo,
        tipo: 'CARAVANA',
        data: e.data,
        local: e.local,
        partidaId: e.partidaId,
        serieId: e.serieId,
      })),
      (e) => `/admin/caravanas/${e.id}`,
    ),
  }
}

/**
 * Inbox ops das próximas caravanas — sem segundo domínio; só compõe Evento +
 * cobrança + RSVP. Inclui lista + semana. Cache TTL ~45s (partidas à parte).
 */
export const carregarDirecaoCaravanas = cache(async function carregarDirecaoCaravanas(
  tenantId: string,
): Promise<CaravanaOpsResumo> {
  const [ops, partidasSemana] = await Promise.all([
    unstable_cache(
      () => fetchDirecaoCaravanas(tenantId),
      ['admin-direcao-caravanas-v2', tenantId],
      { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
    )(),
    carregarPartidasSemanaTenant(tenantId),
  ])

  // Enriquecer inbox: caravana sem partida no dia em que há jogo.
  const pendencias = [...ops.pendencias]
  const jogosPorDia = new Map(partidasSemana.map((p) => [dayKeyInZone(p.dataIso), p]))
  for (const ev of ops.semana) {
    if (ev.partidaId) continue
    const jogo = jogosPorDia.get(dayKeyInZone(ev.dataIso))
    if (!jogo) continue
    if (pendencias.some((p) => p.id === `part-${ev.id}`)) continue
    pendencias.unshift({
      id: `jogo-dia-${ev.id}`,
      titulo: `Jogo no dia · ${ev.titulo}`,
      detalhe: jogo.adversario
        ? `Há partida vs ${jogo.adversario} — vincule na operação do dia.`
        : 'Há partida neste dia — vincule na operação da semana.',
      href: `/admin/caravanas/${ev.id}?tab=editar`,
      tom: 'warning',
    })
  }

  return {
    ...ops,
    pendencias: pendencias.slice(0, 10),
    partidasSemana,
  }
})
