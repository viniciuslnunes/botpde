import { z } from 'zod'

export const TipoFinanceiroSchema = z.enum(['RECEITA', 'DESPESA'])
export const CategoriaFinanceiroSchema = z.enum([
  'MENSALIDADE',
  'LOJA',
  'EVENTO',
  'CARAVANA',
  'PATRIMONIO',
  'BAR',
  'DOACAO',
  'OUTROS',
])

/** Limite de lançamentos por página (portal e admin alinhados). */
export const FINANCEIRO_PAGE_SIZE = 40

/**
 * Interpreta `YYYY-MM-DD` como data de competência no calendário local
 * (meio-dia evita deslocamento por fuso/DST).
 * @param {string} isoDate
 * @returns {Date | null}
 */
export function parseDataCompetencia(isoDate) {
  if (typeof isoDate !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const date = new Date(y, mo, d, 12, 0, 0, 0)
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null
  return date
}

/**
 * @param {Date} data
 * @returns {string} YYYY-MM-DD no calendário local
 */
export function formatDataCompetenciaInput(data) {
  const y = data.getFullYear()
  const m = String(data.getMonth() + 1).padStart(2, '0')
  const d = String(data.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Regras de competência do livro-caixa:
 * - não anterior a 01/01/2000
 * - no máximo 1 ano no futuro (adiantamentos / provisões)
 * @param {Date} data
 * @returns {string | null} mensagem de erro ou null se ok
 */
export function validarJanelaCompetencia(data) {
  const min = new Date(2000, 0, 1, 12, 0, 0, 0)
  const max = new Date()
  max.setFullYear(max.getFullYear() + 1)
  max.setHours(12, 0, 0, 0)
  if (data < min) return 'Data anterior a 2000 não é permitida'
  if (data > max) return 'Data não pode ser mais de 1 ano no futuro'
  return null
}

const dataCompetenciaField = z
  .string()
  .min(1, 'Data obrigatória')
  .superRefine((v, ctx) => {
    const d = parseDataCompetencia(v)
    if (!d) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Data inválida' })
      return
    }
    const err = validarJanelaCompetencia(d)
    if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err })
  })

const lancamentoCampos = {
  tipo: TipoFinanceiroSchema,
  categoria: CategoriaFinanceiroSchema,
  valor: z.coerce.number().positive('Informe um valor maior que zero').max(99_999_999.99, 'Valor muito alto'),
  descricao: z.string().trim().min(3, 'Descrição muito curta').max(200),
  data: dataCompetenciaField,
  observacao: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
}

export const CriarLancamentoSchema = z.object(lancamentoCampos)

export const AtualizarLancamentoSchema = z.object({
  id: z.string().uuid('Lançamento inválido'),
  ...lancamentoCampos,
})

export const FiltroFinanceiroSchema = z.object({
  tipo: TipoFinanceiroSchema.optional(),
  categoria: CategoriaFinanceiroSchema.optional(),
  q: z.string().trim().max(80).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  dataDe: z
    .string()
    .optional()
    .transform((v) => (v && parseDataCompetencia(v) ? v : undefined)),
  dataAte: z
    .string()
    .optional()
    .transform((v) => (v && parseDataCompetencia(v) ? v : undefined)),
  page: z.coerce.number().int().min(1).max(200).optional().default(1),
})

/** @type {Record<string, string>} */
export const CATEGORIA_FINANCEIRO_LABEL = {
  MENSALIDADE: 'Mensalidade',
  LOJA: 'Loja / materiais',
  EVENTO: 'Evento / festa',
  CARAVANA: 'Caravana',
  PATRIMONIO: 'Patrimônio',
  BAR: 'Bar',
  DOACAO: 'Doação',
  OUTROS: 'Outros',
}

/** @type {Record<string, string>} */
export const TIPO_FINANCEIRO_LABEL = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
}

/**
 * @param {number} valor
 * @returns {string}
 */
export function formatarMoedaBRL(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}
