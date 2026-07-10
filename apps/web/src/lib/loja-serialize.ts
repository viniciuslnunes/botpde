/** Props serializáveis para Client Components da loja (Prisma Decimal → number). */
export type LojaProdutoCard = {
  id: string
  nome: string
  preco: number
  precoOriginal?: number | null
  imagensUrl: string[]
}

export function toLojaProdutoCard(p: {
  id: string
  nome: string
  preco: unknown
  precoOriginal?: unknown | null
  imagensUrl: string[]
}): LojaProdutoCard {
  return {
    id: p.id,
    nome: p.nome,
    preco: Number(p.preco),
    precoOriginal: p.precoOriginal != null ? Number(p.precoOriginal) : null,
    imagensUrl: p.imagensUrl ?? [],
  }
}

export type SacolaItemSerializado = {
  id: string
  quantidade: number
  tamanho: string
  produto: {
    id: string
    nome: string
    preco: number
    imagensUrl: string[]
    ativo: boolean
  }
}

export type CheckoutItemSerializado = {
  id: string
  quantidade: number
  tamanho: string
  produto: { nome: string; preco: number }
}

export function toCheckoutItem(item: {
  id: string
  quantidade: number
  tamanho: string
  produto: { nome: string; preco: unknown }
}): CheckoutItemSerializado {
  return {
    id: item.id,
    quantidade: item.quantidade,
    tamanho: item.tamanho,
    produto: {
      nome: item.produto.nome,
      preco: Number(item.produto.preco),
    },
  }
}

export function toSacolaItem(item: {
  id: string
  quantidade: number
  tamanho: string
  produto: {
    id: string
    nome: string
    preco: unknown
    imagensUrl: string[]
    ativo: boolean
  }
}): SacolaItemSerializado {
  return {
    id: item.id,
    quantidade: item.quantidade,
    tamanho: item.tamanho,
    produto: {
      id: item.produto.id,
      nome: item.produto.nome,
      preco: Number(item.produto.preco),
      imagensUrl: item.produto.imagensUrl ?? [],
      ativo: item.produto.ativo,
    },
  }
}
