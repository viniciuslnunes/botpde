import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import {
  lotacaoPorPagamento,
  resumirEmbarqueComPagamento,
  resolverStatusVaga,
  temValorVaga,
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

const DIA_MS = 24 * 60 * 60 * 1000

export type CaravanaOpsResumo = {
  proximas: number
  lotacaoCritica: number
  pagantesSemEmbarque: number
  confirmadosSemPagar: number
  pendencias: AdminInboxItem[]
  /** Lista para a home — evita segundo findMany na page. */
  lista: AdminEventoListaItem[]
}

async function fetchDirecaoCaravanas(tenantId: string): Promise<CaravanaOpsResumo> {
  const agora = new Date()
  const horizonte = new Date(agora.getTime() + 45 * DIA_MS)

  type Row = {
    id: string
    titulo: string
    descricao: string | null
    data: Date
    local: string | null
    fotoUrl: string | null
    serieId: string | null
    valorVaga: { toNumber(): number } | number | null
    capacidade: number | null
    sede: { capacidade: number | null } | null
    rsvps: Array<{
      status: string
      checkedInAt: Date | null
      userId: string
    }>
  }

  const eventos: Row[] = await db.evento.findMany({
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
      valorVaga: true,
      capacidade: true,
      sede: { select: { capacidade: true } },
      rsvps: {
        where: { status: { in: ['CONFIRMADO', 'LISTA_ESPERA'] } },
        select: { status: true, checkedInAt: true, userId: true },
      },
    },
  })

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
    })

    const slaAte = slaLabel(e.data, { agora, modo: 'ate' })

    if (cap != null && cap > 0 && ocupacao / cap >= 0.9) {
      lotacaoCritica += 1
      pendencias.push({
        id: `lot-${e.id}`,
        titulo: `Lotação crítica · ${e.titulo}`,
        detalhe: `${ocupacao}/${cap} ${unidade} (≥ 90%)`,
        href: `/admin/eventos/${e.id}?tab=presenca`,
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
        href: `/admin/eventos/${e.id}?tab=presenca`,
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
        href: `/admin/eventos/${e.id}?tab=presenca`,
        tom: 'warning',
        sla: slaAte,
      })
    }
  }

  return {
    proximas: eventos.length,
    lotacaoCritica,
    pagantesSemEmbarque,
    confirmadosSemPagar,
    pendencias: pendencias.slice(0, 10),
    lista,
  }
}

/**
 * Inbox ops das próximas caravanas — sem segundo domínio; só compõe Evento +
 * cobrança + RSVP. Inclui lista serializada (1 query). Cache TTL ~45s.
 */
export const carregarDirecaoCaravanas = cache(async function carregarDirecaoCaravanas(
  tenantId: string,
): Promise<CaravanaOpsResumo> {
  return unstable_cache(
    () => fetchDirecaoCaravanas(tenantId),
    ['admin-direcao-caravanas', tenantId],
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
