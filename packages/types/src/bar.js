import { z } from 'zod'

/**
 * Regras de negócio do Bar (PDV da sede): validação, totais e custo médio.
 * Testável sem dependência de Prisma/Next.
 */

/** Métodos de pagamento aceitos no balcão (espelha enum MetodoPagamentoBar). */
export const METODO_PAGAMENTO_BAR = ['PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'FIADO']

/** Métodos aceitos na quitação de um fiado (não inclui FIADO). */
export const METODO_PAGAMENTO_QUITACAO_FIADO_BAR = ['PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO']

/** @type {Record<string, string>} */
export const METODO_PAGAMENTO_BAR_LABEL = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
  FIADO: 'Fiado',
}

/** @type {Record<string, string>} */
export const STATUS_FIADO_BAR_LABEL = {
  PENDENTE: 'Pendente',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
  VENCIDA: 'Vencida',
}

/** @type {Record<string, string>} */
export const STATUS_VENDA_BAR_LABEL = {
  PENDENTE: 'Aguardando pagamento',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
  ESTORNADA: 'Estornada',
  EM_COMANDA: 'Em comanda',
}

/** @type {Record<string, string>} */
export const STATUS_COMANDA_BAR_LABEL = {
  ABERTA: 'Aberta',
  FECHADA_PAGA: 'Fechada (paga)',
  FECHADA_COM_DEBITO: 'Fechada com débito',
  QUITADA: 'Quitada',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
}

/** @type {Record<string, string>} */
export const STATUS_PAGAMENTO_COMANDA_BAR_LABEL = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  CANCELADO: 'Cancelado',
}

/** @type {Record<string, string>} */
export const TIPO_TITULAR_COMANDA_BAR_LABEL = {
  MEMBRO: 'Membro',
  AVULSO: 'Avulso',
}

/**
 * Teto padrão de consumo por comanda (R$). `null` no nível da unidade
 * desliga o controle (ver `limiteEfetivoComanda`).
 */
export const LIMITE_COMANDA_PADRAO = 150

/** Limite de vendas por página nas listagens do Bar. */
export const BAR_PAGE_SIZE = 40

/**
 * Divergência absoluta (R$) a partir da qual o fechamento de turno vira alerta.
 * Vive aqui (não em `apps/web/src/lib/bar.ts`, que é `server-only`) para poder
 * ser importada por client components (painel de fechamento de turno).
 */
export const LIMIAR_DIVERGENCIA_ABS = 20
/** Divergência percentual (sobre o dinheiro esperado) que também caracteriza alerta. */
export const LIMIAR_DIVERGENCIA_PCT = 0.05

export const MetodoPagamentoBarSchema = z.enum(['PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'FIADO'])

/** Métodos válidos para quitar um fiado (exclui FIADO). */
export const MetodoPagamentoQuitacaoFiadoBarSchema = z.enum(['PIX', 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO'])

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
  fornecedorId: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined))
    .refine((v) => v === undefined || z.string().uuid().safeParse(v).success, 'Fornecedor inválido'),
})

export const ItemVendaBarSchema = z.object({
  produtoId: z.string().uuid('Produto inválido'),
  quantidade: z.coerce.number().int('Quantidade deve ser inteira').min(1, 'Quantidade mínima é 1').max(99, 'Quantidade máxima é 99'),
})

/**
 * Compra antecipada pelo portal — o sócio paga pelo celular e retira no balcão.
 *
 * Deliberadamente mais pobre que `VendaBarSchema`: **sem método de pagamento**
 * (é sempre PIX; não existe dinheiro pela internet), **sem desconto** (quem
 * concede desconto é o operador, na frente da pessoa) e **sem fiado** (crédito
 * é decisão de gestor, não de formulário). Cada campo ausente aqui é uma
 * decisão de gestão que não pode escapar para o cliente.
 */
export const CompraBarPortalSchema = z.object({
  itens: z.array(ItemVendaBarSchema).min(1, 'Escolha pelo menos um item').max(20, 'Muitos itens'),
})

export const VendaBarSchema = z
  .object({
    itens: z.array(ItemVendaBarSchema).min(1, 'Adicione pelo menos um item'),
    metodoPagamento: MetodoPagamentoBarSchema,
    desconto: z.coerce.number().min(0, 'Desconto não pode ser negativo').default(0),
    observacao: z
      .string()
      .trim()
      .max(200, 'Observação muito longa')
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    membroId: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined))
      .refine((v) => v === undefined || z.string().uuid().safeParse(v).success, 'Membro inválido'),
    vencimento: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  })
  // Venda a FIADO exige um devedor (membro) e uma data de vencimento — não é
  // uma venda anônima/à vista como os demais métodos.
  .superRefine((data, ctx) => {
    if (data.metodoPagamento !== 'FIADO') return
    if (!data.membroId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione o membro devedor', path: ['membroId'] })
    }
    if (!data.vencimento) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o vencimento do fiado', path: ['vencimento'] })
    }
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
  /**
   * Ciência explícita de comandas ABERTA na unidade ao fechar o turno.
   * Obrigatória no server quando count(ABERTA) > 0 — não bloqueia o fechamento.
   */
  cienciaComandasAbertas: z.boolean().optional(),
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

/** Quitação de um fiado pendente/vencido — cria o lançamento no livro-caixa. */
export const QuitarFiadoBarSchema = z.object({
  fiadoId: z.string().uuid('Fiado inválido'),
  metodoPagamento: MetodoPagamentoQuitacaoFiadoBarSchema,
})

/** Cancelamento de um fiado pendente (estorna o estoque como venda cancelada). */
export const CancelarFiadoBarSchema = z.object({
  fiadoId: z.string().uuid('Fiado inválido'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Informe o motivo (mín. 3 caracteres)')
    .max(200, 'Motivo muito longo'),
})

export const TipoTitularComandaBarSchema = z.enum(['MEMBRO', 'AVULSO'])

/** Métodos válidos em pagamento de comanda (exclui FIADO). */
export const MetodoPagamentoComandaBarSchema = MetodoPagamentoQuitacaoFiadoBarSchema

const PagamentoComandaBarItemSchema = z.object({
  metodo: MetodoPagamentoComandaBarSchema,
  valor: z.coerce.number().positive('Valor deve ser maior que zero').max(9999999.99, 'Valor muito alto'),
})

/**
 * Abertura de comanda. MEMBRO exige membroId; AVULSO exige titularNome ≥ 2.
 */
export const AbrirComandaBarSchema = z
  .object({
    codigo: z.string().trim().min(1, 'Informe o código da comanda').max(40, 'Código muito longo'),
    tipo: TipoTitularComandaBarSchema,
    membroId: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined))
      .refine((v) => v === undefined || z.string().uuid().safeParse(v).success, 'Membro inválido'),
    titularNome: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
    limite: z.preprocess(
      (val) => (val === '' || val === null || val === undefined ? undefined : val),
      z.coerce
        .number()
        .positive('Limite deve ser maior que zero')
        .max(9999999.99, 'Limite muito alto')
        .optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === 'MEMBRO') {
      if (!data.membroId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione o membro titular', path: ['membroId'] })
      }
    } else {
      if (!data.titularNome || data.titularNome.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe o nome do titular (mín. 2 caracteres)',
          path: ['titularNome'],
        })
      }
    }
  })

export const LancarItensComandaBarSchema = z.object({
  comandaId: z.string().uuid('Comanda inválida'),
  itens: z.array(ItemVendaBarSchema).min(1, 'Adicione pelo menos um item'),
})

export const RemoverLancamentoComandaBarSchema = z.object({
  vendaId: z.string().uuid('Lançamento inválido'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Informe o motivo (mín. 3 caracteres)')
    .max(200, 'Motivo muito longo'),
})

/**
 * Fechamento: N pagamentos. `vencimento` obrigatório quando o saldo após
 * pagamentos confirmados + desconto permanece > 0 (débito — só MEMBRO no server).
 */
export const FecharComandaBarSchema = z
  .object({
    comandaId: z.string().uuid('Comanda inválida'),
    desconto: z.coerce.number().min(0, 'Desconto não pode ser negativo').max(9999999.99).default(0),
    motivoDesconto: z
      .string()
      .trim()
      .max(200, 'Motivo muito longo')
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    pagamentos: z.array(PagamentoComandaBarItemSchema).default([]),
    vencimento: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  })
  .superRefine((data, ctx) => {
    if (data.desconto > 0 && !data.motivoDesconto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe o motivo do desconto',
        path: ['motivoDesconto'],
      })
    }
  })

/** Pagamento avulso / parcial em comanda (abertura antecipada ou quitação). */
export const RegistrarPagamentoComandaBarSchema = z.object({
  comandaId: z.string().uuid('Comanda inválida'),
  metodo: MetodoPagamentoComandaBarSchema,
  valor: z.coerce.number().positive('Valor deve ser maior que zero').max(9999999.99, 'Valor muito alto'),
})

/** Quitação (parcial ou total) de débito FECHADA_COM_DEBITO / VENCIDA. */
export const QuitarComandaBarSchema = RegistrarPagamentoComandaBarSchema

export const CancelarComandaBarSchema = z.object({
  comandaId: z.string().uuid('Comanda inválida'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Informe o motivo (mín. 3 caracteres)')
    .max(200, 'Motivo muito longo'),
})

export const LiberarLimiteComandaBarSchema = z.object({
  comandaId: z.string().uuid('Comanda inválida'),
  novoLimite: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce
      .number()
      .positive('Limite deve ser maior que zero')
      .max(9999999.99, 'Limite muito alto')
      .optional(),
  ),
})

/** Cadastro de fornecedor de insumos do Bar. */
export const CriarFornecedorBarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  contato: z
    .string()
    .trim()
    .max(120, 'Contato muito longo')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  documento: z
    .string()
    .trim()
    .max(30, 'Documento muito longo')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  observacao: z
    .string()
    .trim()
    .max(300, 'Observação muito longa')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})

/** Edição de fornecedor de insumos do Bar. */
export const EditarFornecedorBarSchema = CriarFornecedorBarSchema.extend({
  id: z.string().uuid('Fornecedor inválido'),
  ativo: z.coerce.boolean().optional(),
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

/**
 * Saldo em aberto da comanda: total − desconto − totalPago.
 * @param {{ total: number, desconto?: number, totalPago?: number }} p
 * @returns {number}
 */
export function saldoComanda({ total, desconto = 0, totalPago = 0 }) {
  return round2(Number(total || 0) - Number(desconto || 0) - Number(totalPago || 0))
}

/**
 * Limite efetivo: override da comanda, senão padrão da unidade.
 * `null` no padrão (e sem override) desliga o controle.
 * @param {number | null | undefined} comandaLimite
 * @param {number | null | undefined} padraoUnidade
 * @returns {number | null}
 */
export function limiteEfetivoComanda(comandaLimite, padraoUnidade) {
  if (comandaLimite != null && !Number.isNaN(Number(comandaLimite))) {
    return Number(comandaLimite)
  }
  if (padraoUnidade == null || Number.isNaN(Number(padraoUnidade))) return null
  return Number(padraoUnidade)
}

/**
 * Percentual do limite consumido (0–100+). `null` se limite desligado.
 * @param {number} total
 * @param {number | null | undefined} limite
 * @returns {number | null}
 */
export function percentualLimite(total, limite) {
  if (limite == null || Number(limite) <= 0) return null
  return round2((Number(total || 0) / Number(limite)) * 100)
}

/**
 * Recebido do bar = vendas rápidas PAGA (sem comanda) + pagamentos de comanda
 * CONFIRMADO. Não inclui lançamentos EM_COMANDA.
 * @param {number} vendasRapidasTotal
 * @param {number} pagamentosComandaTotal
 * @returns {number}
 */
export function somarRecebidoBar(vendasRapidasTotal, pagamentosComandaTotal) {
  return round2(Number(vendasRapidasTotal || 0) + Number(pagamentosComandaTotal || 0))
}

/**
 * Monta o resumo Recebido no formato legado `BarVendasResumo`
 * (`totalPago` = dinheiro entrado; `quantidade` = nº de eventos).
 * @param {{
 *   vendasRapidasTotal?: number
 *   vendasRapidasCount?: number
 *   pagamentosComandaTotal?: number
 *   pagamentosComandaCount?: number
 * }} p
 * @returns {{ totalVendas: number, totalPago: number, quantidade: number }}
 */
export function montarResumoRecebidoBar({
  vendasRapidasTotal = 0,
  vendasRapidasCount = 0,
  pagamentosComandaTotal = 0,
  pagamentosComandaCount = 0,
} = {}) {
  const totalPago = somarRecebidoBar(vendasRapidasTotal, pagamentosComandaTotal)
  return {
    totalVendas: totalPago,
    totalPago,
    quantidade: Number(vendasRapidasCount || 0) + Number(pagamentosComandaCount || 0),
  }
}

/**
 * Consumo em aberto: soma dos totais líquidos (total − desconto) das comandas ABERTA.
 * @param {Array<{ total: number, desconto?: number }>} comandas
 * @returns {number}
 */
export function somarConsumoEmAbertoBar(comandas) {
  let soma = 0
  for (const c of comandas || []) {
    soma += Number(c.total || 0) - Number(c.desconto || 0)
  }
  return round2(Math.max(0, soma))
}

// `slugify` (para slug de categoria) já é exportado por `./loja.js` no índice do pacote.
