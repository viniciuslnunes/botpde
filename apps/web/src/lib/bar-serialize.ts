/** Props serializáveis para Client Components do Bar (Prisma Decimal → number). */

import {
  LIMITE_COMANDA_PADRAO,
  limiteEfetivoComanda,
  percentualLimite,
  saldoComanda,
} from '@torcida/types'

export type BarProdutoSerializado = {
  id: string
  nome: string
  descricao: string | null
  preco: number
  custoMedio: number
  estoque: number
  estoqueMinimo: number | null
  imagemUrl: string | null
  ativo: boolean
  destaque: boolean
  ordem: number
  categoria: { id: string; nome: string } | null
}

export function serializeProdutoBar(p: {
  id: string
  nome: string
  descricao: string | null
  preco: unknown
  custoMedio: unknown
  estoque: number
  estoqueMinimo: number | null
  imagemUrl: string | null
  ativo: boolean
  destaque: boolean
  ordem: number
  categoria: { id: string; nome: string } | null
}): BarProdutoSerializado {
  return {
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    preco: Number(p.preco),
    custoMedio: Number(p.custoMedio),
    estoque: p.estoque,
    estoqueMinimo: p.estoqueMinimo,
    imagemUrl: p.imagemUrl,
    ativo: p.ativo,
    destaque: p.destaque,
    ordem: p.ordem,
    categoria: p.categoria,
  }
}

export type BarVendaItemSerializado = {
  id: string
  produtoId: string | null
  produtoNome: string
  quantidade: number
  precoUnit: number
  total: number
}

export type BarVendaSerializada = {
  id: string
  subtotal: number
  desconto: number
  total: number
  metodoPagamento: string
  status: string
  pagoEm: Date | null
  observacao: string | null
  criadoEm: string
  pixCopiaCola: string | null
  gatewayProvider: string | null
  operador: { id: string; nome: string | null }
  fiadoStatus: string | null
  itens: BarVendaItemSerializado[]
}

export function serializeVendaBar(v: {
  id: string
  subtotal: unknown
  desconto: unknown
  total: unknown
  metodoPagamento: string
  status: string
  pagoEm: Date | null
  observacao: string | null
  criadoEm: Date
  pixCopiaCola?: string | null
  gatewayProvider?: string | null
  operador: { id: string; nome: string | null }
  fiado?: { status: string } | null
  itens: Array<{
    id: string
    produtoId: string | null
    produtoNome: string
    quantidade: number
    precoUnit: unknown
    total: unknown
  }>
}): BarVendaSerializada {
  return {
    id: v.id,
    subtotal: Number(v.subtotal),
    desconto: Number(v.desconto),
    total: Number(v.total),
    metodoPagamento: v.metodoPagamento,
    status: v.status,
    pagoEm: v.pagoEm,
    observacao: v.observacao,
    criadoEm: v.criadoEm.toISOString(),
    pixCopiaCola: v.pixCopiaCola ?? null,
    gatewayProvider: v.gatewayProvider ?? null,
    operador: v.operador,
    fiadoStatus: v.fiado?.status ?? null,
    itens: v.itens.map((item) => ({
      id: item.id,
      produtoId: item.produtoId,
      produtoNome: item.produtoNome,
      quantidade: item.quantidade,
      precoUnit: Number(item.precoUnit),
      total: Number(item.total),
    })),
  }
}

export type BarComandaLancamentoSerializado = {
  id: string
  total: number
  criadoEm: string
  itens: BarVendaItemSerializado[]
}

export type BarComandaSerializada = {
  id: string
  codigo: string
  tipo: 'MEMBRO' | 'AVULSO'
  status: string
  titularNome: string
  titularMembroId: string | null
  /** Override gravado; `null` = padrão da unidade. */
  limite: number | null
  /** Limite efetivo (override ou `LIMITE_COMANDA_PADRAO`). */
  limiteEfetivo: number | null
  total: number
  totalPago: number
  desconto: number
  saldo: number
  /** % do limite consumido; `null` se sem teto. */
  percentualLimite: number | null
  abertaEm: string
  lancamentos: BarComandaLancamentoSerializado[]
}

export function serializeComandaBar(c: {
  id: string
  codigo: string
  tipo: string
  status: string
  titularNome: string
  titularMembroId: string | null
  limite: unknown
  total: unknown
  totalPago: unknown
  desconto: unknown
  abertaEm: Date
  vendas: Array<{
    id: string
    total: unknown
    criadoEm: Date
    itens: Array<{
      id: string
      produtoId: string | null
      produtoNome: string
      quantidade: number
      precoUnit: unknown
      total: unknown
    }>
  }>
}): BarComandaSerializada {
  const total = Number(c.total)
  const totalPago = Number(c.totalPago)
  const desconto = Number(c.desconto)
  const limiteOverride = c.limite == null ? null : Number(c.limite)
  const limiteEfetivo = limiteEfetivoComanda(limiteOverride, LIMITE_COMANDA_PADRAO)
  return {
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo as 'MEMBRO' | 'AVULSO',
    status: c.status,
    titularNome: c.titularNome,
    titularMembroId: c.titularMembroId,
    limite: limiteOverride,
    limiteEfetivo,
    total,
    totalPago,
    desconto,
    saldo: saldoComanda({ total, desconto, totalPago }),
    percentualLimite: percentualLimite(total, limiteEfetivo),
    abertaEm: c.abertaEm.toISOString(),
    lancamentos: c.vendas.map((v) => ({
      id: v.id,
      total: Number(v.total),
      criadoEm: v.criadoEm.toISOString(),
      itens: v.itens.map((item) => ({
        id: item.id,
        produtoId: item.produtoId,
        produtoNome: item.produtoNome,
        quantidade: item.quantidade,
        precoUnit: Number(item.precoUnit),
        total: Number(item.total),
      })),
    })),
  }
}
