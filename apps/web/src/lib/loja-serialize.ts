/** Props serializáveis para Client Components da loja (Prisma Decimal → number). */
export type LojaProdutoCard = {
  id: string
  nome: string
  preco: number
  precoOriginal?: number | null
  imagensUrl: string[]
  href: string
}

export function toLojaProdutoCard(
  p: {
    id: string
    nome: string
    preco: unknown
    precoOriginal?: unknown | null
    imagensUrl: string[]
  },
  tenantId: string,
): LojaProdutoCard {
  return {
    id: p.id,
    nome: p.nome,
    preco: Number(p.preco),
    precoOriginal: p.precoOriginal != null ? Number(p.precoOriginal) : null,
    imagensUrl: p.imagensUrl ?? [],
    href: `/portal/loja/${tenantId}/${p.id}`,
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
    tenantId: string
  }
}

export type CheckoutItemSerializado = {
  id: string
  quantidade: number
  tamanho: string
  produto: {
    nome: string
    preco: number
    tenantId: string
  }
}

export function toCheckoutItem(item: {
  id: string
  quantidade: number
  tamanho: string
  produto: { nome: string; preco: unknown; tenantId: string }
}): CheckoutItemSerializado {
  return {
    id: item.id,
    quantidade: item.quantidade,
    tamanho: item.tamanho,
    produto: {
      nome: item.produto.nome,
      preco: Number(item.produto.preco),
      tenantId: item.produto.tenantId,
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
    tenantId: string
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
      tenantId: item.produto.tenantId,
    },
  }
}
