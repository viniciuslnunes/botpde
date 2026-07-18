import { z } from 'zod'

/**
 * Regras de negócio do Bar (PDV da sede): validação, totais e custo médio.
 * Testável sem dependência de Prisma/Next.
 */

/** Métodos de pagamento aceitos no balcão (espelha enum MetodoPagamentoBar). */
export const METODO_PAGAMENTO_BAR = ['PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO']

/** @type {Record<string, string>} */
export const METODO_PAGAMENTO_BAR_LABEL = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
}

/** @type {Record<string, string>} */
export const STATUS_VENDA_BAR_LABEL = {
  PENDENTE: 'Aguardando pagamento',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
  ESTORNADA: 'Estornada',
}

/** Limite de vendas por página nas listagens do Bar. */
export const BAR_PAGE_SIZE = 40

export const MetodoPagamentoBarSchema = z.enum(['PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO'])

export const ProdutoBarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  descricao: z
    .string()
    .trim()
    .max(500, 'Descrição muito longa')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  categoriaId: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, 'Categoria inválida'),
  preco: z.coerce.number().positive('Informe um preço maior que zero').max(999999.99, 'Preço muito alto'),
  estoque: z.coerce.number().int('Estoque deve ser inteiro').min(0, 'Estoque não pode ser negativo'),
  estoqueMinimo: z.coerce
    .number()
    .int('Estoque mínimo deve ser inteiro')
    .min(0, 'Estoque mínimo não pode ser negativo')
    .optional(),
  imagemUrl: z
    .string()
    .trim()
    .url('URL de imagem inválida')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  ativo: z.coerce.boolean().default(true),
  destaque: z.coerce.boolean().default(false),
  ordem: z.coerce.number().int().optional(),
})

export const CategoriaBarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(60, 'Nome muito longo'),
  ordem: z.coerce.number().int().optional(),
  ativo: z.coerce.boolean().optional(),
})

/** Entrada de estoque/insumo (compra) — direção ENTRADA no BarMovimentacaoEstoque. */
export const CompraBarSchema = z.object({
  produtoId: z.string().uuid('Produto inválido'),
  quantidade: z.coerce.number().int('Quantidade deve ser inteira').positive('Quantidade deve ser maior que zero'),
  custoTotal: z.coerce.number().positive('Informe o custo da compra').max(9999999.99, 'Custo muito alto'),
  motivo: z
    .string()
    .trim()
    .max(200, 'Motivo muito longo')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})

export const ItemVendaBarSchema = z.object({
  produtoId: z.string().uuid('Produto inválido'),
  quantidade: z.coerce.number().int('Quantidade deve ser inteira').min(1, 'Quantidade mínima é 1').max(99, 'Quantidade máxima é 99'),
})

export const VendaBarSchema = z.object({
  itens: z.array(ItemVendaBarSchema).min(1, 'Adicione pelo menos um item'),
  metodoPagamento: MetodoPagamentoBarSchema,
  desconto: z.coerce.number().min(0, 'Desconto não pode ser negativo').default(0),
  observacao: z
    .string()
    .trim()
    .max(200, 'Observação muito longa')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})

/** Fechamento de turno de caixa do bar. */
export const FecharTurnoBarSchema = z.object({
  dinheiroContado: z.coerce
    .number()
    .min(0, 'Dinheiro contado não pode ser negativo')
    .max(9999999.99, 'Valor muito alto'),
  sangria: z.coerce
    .number()
    .min(0, 'Sangria não pode ser negativa')
    .max(9999999.99, 'Valor muito alto')
    .default(0),
  observacao: z
    .string()
    .trim()
    .max(300, 'Observação muito longa')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})

/** Motivo opcional do estorno de venda paga. */
export const EstornarVendaBarSchema = z.object({
  vendaId: z.string().uuid('Venda inválida'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Informe o motivo (mín. 3 caracteres)')
    .max(200, 'Motivo muito longo'),
})

/**
 * Arredondamento monetário consistente (2 casas).
 * @param {number} valor
 * @returns {number}
 */
export function round2(valor) {
  return Math.round(valor * 100) / 100
}

/**
 * Soma dos itens da venda (preço × quantidade), arredondada a 2 casas.
 * @param {Array<{ precoUnit: number, quantidade: number }>} itens
 * @returns {{ subtotal: number }}
 */
export function calcularTotaisVenda(itens) {
  const subtotal = round2(
    (itens ?? []).reduce((acc, item) => acc + Number(item.precoUnit) * Number(item.quantidade), 0),
  )
  return { subtotal }
}

/**
 * Total após desconto absoluto — nunca negativo.
 * @param {number} subtotal
 * @param {number} desconto
 * @returns {number}
 */
export function aplicarDesconto(subtotal, desconto) {
  return Math.max(0, round2(subtotal - Number(desconto || 0)))
}

/**
 * Resumo financeiro da venda (subtotal, desconto efetivo, total).
 * @param {Array<{ precoUnit: number, quantidade: number }>} itens
 * @param {number} [desconto]
 * @returns {{ subtotal: number, desconto: number, total: number }}
 */
export function resumirVenda(itens, desconto = 0) {
  const { subtotal } = calcularTotaisVenda(itens)
  const descontoEfetivo = round2(Math.max(0, Number(desconto || 0)))
  return { subtotal, desconto: descontoEfetivo, total: aplicarDesconto(subtotal, descontoEfetivo) }
}

/**
 * Custo médio ponderado após uma entrada de estoque.
 * `((estoqueAtual*custoMedioAtual) + custoTotalEntrada) / (estoqueAtual + quantidadeEntrada)`.
 * @param {{ estoqueAtual: number, custoMedioAtual: number, quantidadeEntrada: number, custoTotalEntrada: number }} params
 * @returns {number}
 */
export function recalcularCustoMedio({ estoqueAtual, custoMedioAtual, quantidadeEntrada, custoTotalEntrada }) {
  const estoque = Math.max(0, Number(estoqueAtual) || 0)
  const entrada = Math.max(0, Number(quantidadeEntrada) || 0)
  const denominador = estoque + entrada
  if (denominador <= 0) return 0
  if (estoque <= 0) return round2(Number(custoTotalEntrada) / entrada)
  return round2((estoque * Number(custoMedioAtual || 0) + Number(custoTotalEntrada)) / denominador)
}

// `slugify` (para slug de categoria) já é exportado por `./loja.js` no índice do pacote.
