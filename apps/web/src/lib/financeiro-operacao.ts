import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'

/**
 * Resultado da OPERAÇÃO — a pergunta que o livro-caixa sozinho não respondia:
 * "a caravana fechou no azul?".
 *
 * Receita e despesa vêm do mesmo lugar (`FinanceiroLancamento` com `eventoId`),
 * inclusive a arrecadação de vagas: a baixa da cobrança já nasce carimbada com
 * a operação. Projeto continua respondendo pela campanha; evento responde pelo
 * dia.
 */

export type ResultadoOperacao = {
  receita: number
  despesa: number
  saldo: number
  lancamentos: number
  /** Sem nenhum lançamento não há resultado — é diferente de resultado zero. */
  temDado: boolean
}

function paraNumero(valor: unknown): number {
  if (valor == null) return 0
  if (typeof valor === 'number') return valor
  if (typeof valor === 'object' && 'toNumber' in (valor as Record<string, unknown>)) {
    return (valor as { toNumber(): number }).toNumber()
  }
  return Number(valor) || 0
}

export const resultadoDaOperacao = cache(async function resultadoDaOperacao(
  tenantId: string,
  eventoId: string,
): Promise<ResultadoOperacao> {
  const grupos: Array<{
    tipo: string
    _sum: { valor: unknown }
    _count: { _all: number }
  }> = await db.financeiroLancamento.groupBy({
    by: ['tipo'],
    where: { tenantId, eventoId },
    _sum: { valor: true },
    _count: { _all: true },
  })

  let receita = 0
  let despesa = 0
  let lancamentos = 0

  for (const g of grupos) {
    const soma = paraNumero(g._sum.valor)
    lancamentos += g._count._all
    if (g.tipo === 'RECEITA') receita += soma
    else despesa += soma
  }

  return {
    receita,
    despesa,
    saldo: receita - despesa,
    lancamentos,
    temDado: lancamentos > 0,
  }
})

export type OperacaoNoVermelho = {
  eventoId: string
  titulo: string
  data: Date
  receita: number
  despesa: number
  saldo: number
}

/**
 * Operações fechadas no vermelho na janela — entra na Direção do Financeiro.
 * Uma query agregada + uma para os títulos: nunca N+1 por evento.
 */
export async function listarOperacoesNoVermelho(
  tenantId: string,
  opts?: { desde?: Date; limite?: number },
): Promise<OperacaoNoVermelho[]> {
  const desde = opts?.desde ?? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
  const limite = opts?.limite ?? 5

  const grupos: Array<{
    eventoId: string | null
    tipo: string
    _sum: { valor: unknown }
  }> = await db.financeiroLancamento.groupBy({
    by: ['eventoId', 'tipo'],
    where: { tenantId, eventoId: { not: null }, data: { gte: desde } },
    _sum: { valor: true },
  })

  const porEvento = new Map<string, { receita: number; despesa: number }>()
  for (const g of grupos) {
    if (!g.eventoId) continue
    const atual = porEvento.get(g.eventoId) ?? { receita: 0, despesa: 0 }
    const soma = paraNumero(g._sum.valor)
    if (g.tipo === 'RECEITA') atual.receita += soma
    else atual.despesa += soma
    porEvento.set(g.eventoId, atual)
  }

  const negativos = [...porEvento.entries()]
    .map(([eventoId, v]) => ({ eventoId, ...v, saldo: v.receita - v.despesa }))
    .filter((e) => e.saldo < 0)
    .sort((a, b) => a.saldo - b.saldo)
    .slice(0, limite)

  if (negativos.length === 0) return []

  const eventos: Array<{ id: string; titulo: string; data: Date }> = await db.evento.findMany({
    where: { tenantId, id: { in: negativos.map((n) => n.eventoId) } },
    select: { id: true, titulo: true, data: true },
  })
  const porId = new Map(eventos.map((e) => [e.id, e]))

  return negativos.flatMap((n) => {
    const evento = porId.get(n.eventoId)
    if (!evento) return []
    return [
      {
        eventoId: n.eventoId,
        titulo: evento.titulo,
        data: evento.data,
        receita: n.receita,
        despesa: n.despesa,
        saldo: n.saldo,
      },
    ]
  })
}

export type EventoParaRateio = { id: string; titulo: string; data: Date; tipo: string }

/**
 * Operações que aceitam rateio no formulário de lançamento: janela curta em
 * torno de hoje, porque despesa de caravana se lança na semana da viagem —
 * lista longa viraria caçada.
 */
export const listarEventosParaRateio = cache(async function listarEventosParaRateio(
  tenantId: string,
): Promise<EventoParaRateio[]> {
  const agora = Date.now()
  const de = new Date(agora - 120 * 24 * 60 * 60 * 1000)
  const ate = new Date(agora + 60 * 24 * 60 * 60 * 1000)

  const rows: EventoParaRateio[] = await db.evento.findMany({
    where: { tenantId, data: { gte: de, lte: ate } },
    orderBy: { data: 'desc' },
    take: 60,
    select: { id: true, titulo: true, data: true, tipo: true },
  })
  return rows
})
