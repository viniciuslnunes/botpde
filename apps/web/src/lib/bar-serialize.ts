/** Props serializáveis para Client Components do Bar (Prisma Decimal → number). */

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
