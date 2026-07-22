import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { ultimosMesesSP } from '@/lib/admin-insights'

const DIA_MS = 24 * 60 * 60 * 1000

/** Cobrança exigível e não paga: PENDENTE que passou do vencimento ou já marcada VENCIDA. */
const STATUS_EM_ABERTO = ['PENDENTE', 'VENCIDA'] as const

export type CobrancaAgingBucket = {
  faixa: string
  quantidade: number
  valor: number
}

export type InadimplenciaResumo = {
  /** Aging do valor em atraso: 0–30 / 31–60 / 61–90 / 90+ dias. */
  aging: CobrancaAgingBucket[]
  valorEmAtraso: number
  quantidadeEmAtraso: number
  /**
   * Valor em atraso ÷ valor exigível (cobranças não-canceladas com vencimento
   * nos últimos 90 dias). `null` sem base de comparação.
   */
  taxaInadimplencia: number | null
  /** Mensalidades PAGAS com `pagoEm` no mês corrente (fuso SP). */
  mrrAtual: number
  mrrAnterior: number
}

const FAIXAS: Array<{ faixa: string; deDias: number; ateDias: number | null }> = [
  { faixa: '0–30 dias', deDias: 0, ateDias: 30 },
  { faixa: '31–60 dias', deDias: 31, ateDias: 60 },
  { faixa: '61–90 dias', deDias: 61, ateDias: 90 },
  { faixa: '90+ dias', deDias: 91, ateDias: null },
]

/**
 * Inadimplência da associação — primeiro consumidor do índice
 * `CobrancaAssociacao (tenantId, status, vencimento)`.
 */
export const resumirInadimplencia = cache(async function resumirInadimplencia(
  tenantId: string,
): Promise<InadimplenciaResumo> {
  const agora = new Date()
  const ha90dias = new Date(agora.getTime() - 90 * DIA_MS)
  // Mês corrente e anterior no fuso SP para o recorte de MRR.
  const [mesAnterior, mesAtual] = ultimosMesesSP(2)

  type AtrasadaRow = { valor: Prisma.Decimal; vencimento: Date }
  type AggRow = { _sum: { valor: Prisma.Decimal | null } }

  const [atrasadas, exigivel90d, mrrAtualAgg, mrrAnteriorAgg]: [
    AtrasadaRow[],
    AggRow,
    AggRow,
    AggRow,
  ] = await Promise.all([
    db.cobrancaAssociacao.findMany({
      where: {
        tenantId,
        status: { in: [...STATUS_EM_ABERTO] },
        vencimento: { lt: agora },
      },
      select: { valor: true, vencimento: true },
    }),
    db.cobrancaAssociacao.aggregate({
      where: {
        tenantId,
        status: { not: 'CANCELADA' },
        vencimento: { gte: ha90dias, lte: agora },
      },
      _sum: { valor: true },
    }),
    db.cobrancaAssociacao.aggregate({
      where: {
        tenantId,
        status: 'PAGA',
        tipo: 'MENSALIDADE',
        pagoEm: { gte: mesAtual.inicio },
      },
      _sum: { valor: true },
    }),
    db.cobrancaAssociacao.aggregate({
      where: {
        tenantId,
        status: 'PAGA',
        tipo: 'MENSALIDADE',
        pagoEm: { gte: mesAnterior.inicio, lt: mesAtual.inicio },
      },
      _sum: { valor: true },
    }),
  ])

  const aging: CobrancaAgingBucket[] = FAIXAS.map((f) => ({
    faixa: f.faixa,
    quantidade: 0,
    valor: 0,
  }))

  let valorEmAtraso = 0
  for (const cobranca of atrasadas) {
    const valor = Number(cobranca.valor)
    const diasAtraso = Math.floor((agora.getTime() - cobranca.vencimento.getTime()) / DIA_MS)
    const idx = FAIXAS.findIndex(
      (f) => diasAtraso >= f.deDias && (f.ateDias === null || diasAtraso <= f.ateDias),
    )
    const bucket = aging[idx === -1 ? FAIXAS.length - 1 : idx]
    bucket.quantidade += 1
    bucket.valor += valor
    valorEmAtraso += valor
  }

  // Atrasadas com vencimento > 90 dias atrás não entram no exigível de 90d —
  // soma as duas parcelas para a taxa não passar de 100%.
  const valorAtrasoAntigo = atrasadas
    .filter((c) => c.vencimento < ha90dias)
    .reduce((acc, c) => acc + Number(c.valor), 0)
  const baseExigivel = Number(exigivel90d._sum.valor ?? 0) + valorAtrasoAntigo

  return {
    aging,
    valorEmAtraso,
    quantidadeEmAtraso: atrasadas.length,
    taxaInadimplencia: baseExigivel > 0 ? valorEmAtraso / baseExigivel : null,
    mrrAtual: Number(mrrAtualAgg._sum.valor ?? 0),
    mrrAnterior: Number(mrrAnteriorAgg._sum.valor ?? 0),
  }
})
