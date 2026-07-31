import 'server-only'

import { cache } from 'react'
import { db, Prisma } from '@torcida/db'
import type {
  MetodoPagamentoBar,
  StatusComandaBar,
  StatusPagamentoComandaBar,
  TipoTitularComandaBar,
} from '@torcida/db'
import {
  LIMITE_COMANDA_PADRAO,
  limiteEfetivoComanda,
  percentualLimite,
  round2,
  saldoComanda,
} from '@torcida/types'

/** Reexport — padrão da unidade; `null` no call site desliga o controle. */
export { LIMITE_COMANDA_PADRAO }

export type BarComandaLancamentoLite = {
  id: string
  total: Prisma.Decimal
  criadoEm: Date
  itens: Array<{
    id: string
    produtoId: string | null
    produtoNome: string
    quantidade: number
    precoUnit: Prisma.Decimal
    total: Prisma.Decimal
  }>
}

/** Comanda ABERTA da unidade com lançamentos EM_COMANDA (PDV). */
export type BarComandaAbertaLite = {
  id: string
  codigo: string
  tipo: TipoTitularComandaBar
  status: StatusComandaBar
  titularNome: string
  titularMembroId: string | null
  limite: Prisma.Decimal | null
  total: Prisma.Decimal
  totalPago: Prisma.Decimal
  desconto: Prisma.Decimal
  abertaEm: Date
  vendas: BarComandaLancamentoLite[]
}

/** Lista comandas ABERTA da unidade, com itens ainda em comanda. */
export const listarComandasAbertasBar = cache(async function listarComandasAbertasBar(
  tenantId: string,
  sedeId: string,
): Promise<BarComandaAbertaLite[]> {
  const rows: BarComandaAbertaLite[] = await db.barComanda.findMany({
    where: { tenantId, sedeId, status: 'ABERTA' },
    orderBy: [{ codigo: 'asc' }, { abertaEm: 'asc' }],
    select: {
      id: true,
      codigo: true,
      tipo: true,
      status: true,
      titularNome: true,
      titularMembroId: true,
      limite: true,
      total: true,
      totalPago: true,
      desconto: true,
      abertaEm: true,
      vendas: {
        where: { status: 'EM_COMANDA' },
        orderBy: { criadoEm: 'asc' },
        select: {
          id: true,
          total: true,
          criadoEm: true,
          itens: {
            select: {
              id: true,
              produtoId: true,
              produtoNome: true,
              quantidade: true,
              precoUnit: true,
              total: true,
            },
          },
        },
      },
    },
  })
  return rows
})

export type FiltroListagemComandaBar = 'abertas' | 'em_aberto' | 'historico'

export type BarComandaListagemLite = {
  id: string
  codigo: string
  tipo: TipoTitularComandaBar
  status: StatusComandaBar
  titularNome: string
  limite: Prisma.Decimal | null
  total: Prisma.Decimal
  totalPago: Prisma.Decimal
  desconto: Prisma.Decimal
  abertaEm: Date
  fechadaEm: Date | null
  vencimento: Date | null
  pagoEm: Date | null
  canceladaEm: Date | null
}

const STATUS_POR_FILTRO: Record<FiltroListagemComandaBar, StatusComandaBar[]> = {
  abertas: ['ABERTA'],
  em_aberto: ['FECHADA_COM_DEBITO', 'VENCIDA'],
  historico: ['FECHADA_PAGA', 'QUITADA', 'CANCELADA'],
}

/**
 * Lista comandas da unidade por aba (Abertas / Em aberto / Histórico).
 * Select explícito — sem `any`.
 */
export const listarComandasBar = cache(async function listarComandasBar(
  tenantId: string,
  sedeId: string,
  opts: { filtro: FiltroListagemComandaBar; take?: number },
): Promise<BarComandaListagemLite[]> {
  const statuses = STATUS_POR_FILTRO[opts.filtro]
  const take = opts.take ?? (opts.filtro === 'historico' ? 80 : 200)

  const rows: BarComandaListagemLite[] = await db.barComanda.findMany({
    where: { tenantId, sedeId, status: { in: statuses } },
    orderBy:
      opts.filtro === 'abertas'
        ? [{ codigo: 'asc' }, { abertaEm: 'asc' }]
        : opts.filtro === 'em_aberto'
          ? [{ vencimento: 'asc' }, { abertaEm: 'desc' }]
          : [{ fechadaEm: 'desc' }, { abertaEm: 'desc' }],
    take,
    select: {
      id: true,
      codigo: true,
      tipo: true,
      status: true,
      titularNome: true,
      limite: true,
      total: true,
      totalPago: true,
      desconto: true,
      abertaEm: true,
      fechadaEm: true,
      vencimento: true,
      pagoEm: true,
      canceladaEm: true,
    },
  })

  if (opts.filtro === 'em_aberto') {
    const prioridade: Record<string, number> = { VENCIDA: 0, FECHADA_COM_DEBITO: 1 }
    return [...rows].sort(
      (a, b) => (prioridade[a.status] ?? 9) - (prioridade[b.status] ?? 9),
    )
  }
  return rows
})

export type BarComandaLite = {
  id: string
  tenantId: string
  sedeId: string
  codigo: string
  tipo: TipoTitularComandaBar
  status: StatusComandaBar
  titularUserId: string | null
  titularMembroId: string | null
  titularNome: string
  limite: Prisma.Decimal | null
  total: Prisma.Decimal
  totalPago: Prisma.Decimal
  desconto: Prisma.Decimal
  vencimento: Date | null
}

const comandaSelect = {
  id: true,
  tenantId: true,
  sedeId: true,
  codigo: true,
  tipo: true,
  status: true,
  titularUserId: true,
  titularMembroId: true,
  titularNome: true,
  limite: true,
  total: true,
  totalPago: true,
  desconto: true,
  vencimento: true,
} satisfies Prisma.BarComandaSelect

/**
 * Garante que a comanda existe na unidade do ator.
 * Aceita client Prisma ou TransactionClient.
 */
export async function assertComandaUnidade(
  client: Prisma.TransactionClient | typeof db,
  input: { comandaId: string; tenantId: string; sedeId: string },
): Promise<BarComandaLite> {
  const comanda: BarComandaLite | null = await client.barComanda.findFirst({
    where: {
      id: input.comandaId,
      tenantId: input.tenantId,
      sedeId: input.sedeId,
    },
    select: comandaSelect,
  })
  if (!comanda) throw new Error('Comanda não encontrada nesta unidade')
  return comanda
}

/**
 * Recalcula `total` a partir das vendas EM_COMANDA ativas.
 * Não altera `totalPago` nem `desconto`.
 */
export async function recalcularTotaisComanda(
  tx: Prisma.TransactionClient,
  comandaId: string,
): Promise<number> {
  const agg: { _sum: { total: Prisma.Decimal | null } } = await tx.barVenda.aggregate({
    where: { comandaId, status: 'EM_COMANDA' },
    _sum: { total: true },
  })
  const total = round2(Number(agg._sum.total ?? 0))
  await tx.barComanda.update({
    where: { id: comandaId },
    data: { total },
  })
  return total
}

/**
 * Limite efetivo da comanda (override ou padrão da unidade).
 * Hoje o padrão é `LIMITE_COMANDA_PADRAO`; quando a unidade puder gravar
 * override próprio, passe-o em `padraoUnidade` (`null` desliga).
 */
export function resolverLimiteComanda(
  comandaLimite: Prisma.Decimal | number | null | undefined,
  padraoUnidade: number | null = LIMITE_COMANDA_PADRAO,
): number | null {
  const override =
    comandaLimite == null ? null : Number(comandaLimite)
  return limiteEfetivoComanda(override, padraoUnidade)
}

/**
 * Aviso (≥80%) e bloqueio (ultrapassa) para quem só tem `bar:operate`.
 * `podeLiberar` = tem `bar:manage` → passa mesmo estourando.
 */
export function avaliarLimiteLancamento(input: {
  totalAtual: number
  valorNovo: number
  limite: number | null
  podeLiberar: boolean
}): { ok: true; avisoPct: number | null } | { ok: false; error: string; pct: number } {
  const { totalAtual, valorNovo, limite, podeLiberar } = input
  if (limite == null) return { ok: true, avisoPct: null }

  const novoTotal = round2(totalAtual + valorNovo)
  const pct = percentualLimite(novoTotal, limite)
  if (novoTotal > limite && !podeLiberar) {
    return {
      ok: false,
      error: `Limite da comanda (R$ ${limite.toFixed(2)}) seria ultrapassado`,
      pct: pct ?? 100,
    }
  }
  return { ok: true, avisoPct: pct != null && pct >= 80 ? pct : null }
}

export type ConfirmarPagamentoComandaInput = {
  tenantId: string
  pagamentoId: string
  atorId?: string | null
}

/**
 * Confirma BarComandaPagamento PENDENTE (webhook PIX / mock).
 * Idempotente por status + financeiroLancamentoId.
 *
 * PIX: fecharComanda cria pagamentos PENDENTE e NÃO transiciona status enquanto
 * houver PIX aberto; ao confirmar o último (saldo coberto), completa FECHADA_PAGA.
 */
export async function confirmarPagamentoComandaBar(
  input: ConfirmarPagamentoComandaInput,
): Promise<{ ok: true; comandaId: string } | { ok: false; error: string }> {
  type PagRow = {
    id: string
    comandaId: string
    valor: Prisma.Decimal
    status: StatusPagamentoComandaBar
    metodoPagamento: MetodoPagamentoBar
    financeiroLancamentoId: string | null
    operadorId: string
    comanda: {
      id: string
      tenantId: string
      status: StatusComandaBar
      total: Prisma.Decimal
      totalPago: Prisma.Decimal
      desconto: Prisma.Decimal
      codigo: string
    }
  }

  const pag: PagRow | null = await db.barComandaPagamento.findFirst({
    where: { id: input.pagamentoId, comanda: { tenantId: input.tenantId } },
    select: {
      id: true,
      comandaId: true,
      valor: true,
      status: true,
      metodoPagamento: true,
      financeiroLancamentoId: true,
      operadorId: true,
      comanda: {
        select: {
          id: true,
          tenantId: true,
          status: true,
          total: true,
          totalPago: true,
          desconto: true,
          codigo: true,
        },
      },
    },
  })
  if (!pag) return { ok: false, error: 'Pagamento não encontrado' }
  if (pag.status === 'CONFIRMADO') return { ok: true, comandaId: pag.comandaId }
  if (pag.status === 'CANCELADO') return { ok: false, error: 'Pagamento cancelado' }

  type ComandaSede = { sedeId: string }
  const comandaSede: ComandaSede | null = await db.barComanda.findFirst({
    where: { id: pag.comandaId, tenantId: input.tenantId },
    select: { sedeId: true },
  })
  const turnoAberto: { id: string } | null = comandaSede
    ? await db.barCaixaTurno.findFirst({
        where: { tenantId: input.tenantId, sedeId: comandaSede.sedeId, fechadoEm: null },
        select: { id: true },
      })
    : null

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    let lancamentoId = pag.financeiroLancamentoId
    if (!lancamentoId) {
      const lanc: { id: string } = await tx.financeiroLancamento.create({
        data: {
          tenantId: input.tenantId,
          tipo: 'RECEITA',
          categoria: 'BAR',
          valor: pag.valor,
          descricao: `Pagamento comanda ${pag.comanda.codigo}`.slice(0, 240),
          data: new Date(),
          observacao: `PIX — pagamento ${pag.id}`,
          criadoPorId: input.atorId ?? pag.operadorId,
        },
        select: { id: true },
      })
      lancamentoId = lanc.id
    }

    await tx.barComandaPagamento.update({
      where: { id: pag.id },
      data: {
        status: 'CONFIRMADO',
        pagoEm: new Date(),
        financeiroLancamentoId: lancamentoId,
        ...(turnoAberto ? { turnoId: turnoAberto.id } : {}),
      },
    })

    const novoTotalPago = round2(Number(pag.comanda.totalPago) + Number(pag.valor))
    await tx.barComanda.update({
      where: { id: pag.comandaId },
      data: { totalPago: novoTotalPago },
    })

    const pendentes: number = await tx.barComandaPagamento.count({
      where: { comandaId: pag.comandaId, status: 'PENDENTE' },
    })

    const saldo = saldoComanda({
      total: Number(pag.comanda.total),
      desconto: Number(pag.comanda.desconto),
      totalPago: novoTotalPago,
    })

    // Só completa fechamento se ainda ABERTA, sem PIX pendente e saldo zerado
    // (fechamento iniciado com cobertura via PIX — ver fecharComandaBar).
    if (pag.comanda.status === 'ABERTA' && pendentes === 0 && saldo <= 0) {
      const turnoFech: { id: string } | null = turnoAberto
      await tx.barComanda.update({
        where: { id: pag.comandaId },
        data: {
          status: 'FECHADA_PAGA',
          fechadaEm: new Date(),
          fechadaPorId: input.atorId ?? pag.operadorId,
          ...(turnoFech ? { turnoFechamentoId: turnoFech.id } : {}),
        },
      })
    }
  })

  return { ok: true, comandaId: pag.comandaId }
}

/**
 * Resolve pagamento de comanda por id ou gatewayExternalId (webhook MP).
 */
export async function resolverPagamentoComandaBar(
  ref: string,
): Promise<{ id: string; tenantId: string } | null> {
  type Row = { id: string; comanda: { tenantId: string } }
  const byId: Row | null = await db.barComandaPagamento.findFirst({
    where: { id: ref },
    select: { id: true, comanda: { select: { tenantId: true } } },
  })
  if (byId) return { id: byId.id, tenantId: byId.comanda.tenantId }

  const byExt: Row | null = await db.barComandaPagamento.findFirst({
    where: { gatewayExternalId: ref },
    select: { id: true, comanda: { select: { tenantId: true } } },
  })
  if (byExt) return { id: byExt.id, tenantId: byExt.comanda.tenantId }
  return null
}

// ─── Portal do membro (leitura) ───────────────────────────────────────────────

export type BarComandaPortalItem = {
  produtoNome: string
  quantidade: number
  total: number
}

/** Comanda ABERTA do próprio membro na unidade (portal). */
export type BarComandaAbertaPortal = {
  id: string
  codigo: string
  total: number
  limiteEfetivo: number | null
  percentualLimite: number | null
  restanteLimite: number | null
  itens: BarComandaPortalItem[]
}

/** Débito FECHADA_COM_DEBITO / VENCIDA do próprio membro. */
export type BarDebitoComandaPortal = {
  id: string
  codigo: string
  status: 'FECHADA_COM_DEBITO' | 'VENCIDA'
  saldo: number
  vencimento: Date | null
}

/** Titular = userId ou SaasMembro APROVADO do mesmo user na unidade. */
async function whereTitularMembro(
  tenantId: string,
  sedeId: string,
  userId: string,
): Promise<Prisma.BarComandaWhereInput> {
  const membro: { id: string } | null = await db.saasMembro.findFirst({
    where: { tenantId, userId, status: 'APROVADO' },
    select: { id: true },
  })
  const or: Prisma.BarComandaWhereInput[] = [{ titularUserId: userId }]
  if (membro) or.push({ titularMembroId: membro.id })
  return { tenantId, sedeId, OR: or }
}

/**
 * Comanda ABERTA do membro na unidade — itens EM_COMANDA, limite efetivo e
 * quanto falta para o teto. Leitura portal (§6).
 */
export const getComandaAbertaDoMembro = cache(async function getComandaAbertaDoMembro(
  tenantId: string,
  sedeId: string,
  userId: string,
): Promise<BarComandaAbertaPortal | null> {
  const titularWhere = await whereTitularMembro(tenantId, sedeId, userId)
  type Row = {
    id: string
    codigo: string
    limite: Prisma.Decimal | null
    total: Prisma.Decimal
    desconto: Prisma.Decimal
    vendas: Array<{
      itens: Array<{
        produtoNome: string
        quantidade: number
        total: Prisma.Decimal
      }>
    }>
  }
  const row: Row | null = await db.barComanda.findFirst({
    where: { ...titularWhere, status: 'ABERTA' },
    orderBy: { abertaEm: 'desc' },
    select: {
      id: true,
      codigo: true,
      limite: true,
      total: true,
      desconto: true,
      vendas: {
        where: { status: 'EM_COMANDA' },
        orderBy: { criadoEm: 'asc' },
        select: {
          itens: {
            select: {
              produtoNome: true,
              quantidade: true,
              total: true,
            },
          },
        },
      },
    },
  })
  if (!row) return null

  const total = round2(Number(row.total) - Number(row.desconto))
  const limiteEfetivo = resolverLimiteComanda(row.limite, LIMITE_COMANDA_PADRAO)
  const pct = percentualLimite(total, limiteEfetivo)
  const restanteLimite =
    limiteEfetivo == null ? null : round2(Math.max(0, limiteEfetivo - total))

  const itens: BarComandaPortalItem[] = []
  for (const venda of row.vendas) {
    for (const item of venda.itens) {
      itens.push({
        produtoNome: item.produtoNome,
        quantidade: item.quantidade,
        total: Number(item.total),
      })
    }
  }

  return {
    id: row.id,
    codigo: row.codigo,
    total,
    limiteEfetivo,
    percentualLimite: pct,
    restanteLimite,
    itens,
  }
})

/**
 * Débitos em aberto (FECHADA_COM_DEBITO | VENCIDA) do próprio membro na unidade.
 */
export const listarDebitosComandaDoMembro = cache(async function listarDebitosComandaDoMembro(
  tenantId: string,
  sedeId: string,
  userId: string,
): Promise<BarDebitoComandaPortal[]> {
  const titularWhere = await whereTitularMembro(tenantId, sedeId, userId)
  type Row = {
    id: string
    codigo: string
    status: StatusComandaBar
    total: Prisma.Decimal
    desconto: Prisma.Decimal
    totalPago: Prisma.Decimal
    vencimento: Date | null
  }
  const rows: Row[] = await db.barComanda.findMany({
    where: {
      ...titularWhere,
      status: { in: ['FECHADA_COM_DEBITO', 'VENCIDA'] },
    },
    orderBy: [{ vencimento: 'asc' }, { fechadaEm: 'desc' }],
    select: {
      id: true,
      codigo: true,
      status: true,
      total: true,
      desconto: true,
      totalPago: true,
      vencimento: true,
    },
  })

  return rows.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    status: r.status as 'FECHADA_COM_DEBITO' | 'VENCIDA',
    saldo: saldoComanda({
      total: Number(r.total),
      desconto: Number(r.desconto),
      totalPago: Number(r.totalPago),
    }),
    vencimento: r.vencimento,
  }))
})
