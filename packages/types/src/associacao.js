import { z } from 'zod'
import { parseDataCompetencia, validarJanelaCompetencia } from './financeiro.js'

export const PeriodicidadePlanoSchema = z.enum(['MENSAL', 'TRIMESTRAL', 'ANUAL', 'UNICA'])
export const TipoCobrancaSchema = z.enum(['MENSALIDADE', 'ADESAO', 'AVULSA'])
export const StatusCobrancaSchema = z.enum(['PENDENTE', 'PAGA', 'CANCELADA', 'VENCIDA'])

export const PERIODICIDADE_PLANO_LABEL = Object.freeze({
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  ANUAL: 'Anual',
  UNICA: 'Única',
})

export const TIPO_COBRANCA_LABEL = Object.freeze({
  MENSALIDADE: 'Mensalidade',
  ADESAO: 'Taxa de adesão',
  AVULSA: 'Avulsa',
})

export const STATUS_COBRANCA_LABEL = Object.freeze({
  PENDENTE: 'Pendente',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
  VENCIDA: 'Vencida',
})

/** @param {string | undefined | null} raw */
export function normalizarCpf(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  return digits.length === 11 ? digits : null
}

/** @param {string} cpfDigits */
export function validarCpfDigitos(cpfDigits) {
  if (!/^\d{11}$/.test(cpfDigits)) return false
  if (/^(\d)\1{10}$/.test(cpfDigits)) return false
  const calc = (base, factor) => {
    let sum = 0
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i)
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }
  const d1 = calc(cpfDigits.slice(0, 9), 10)
  const d2 = calc(cpfDigits.slice(0, 10), 11)
  return d1 === Number(cpfDigits[9]) && d2 === Number(cpfDigits[10])
}

const cpfField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined))
  .superRefine((v, ctx) => {
    if (!v) return
    const n = normalizarCpf(v)
    if (!n || !validarCpfDigitos(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CPF inválido' })
    }
  })
  .transform((v) => (v ? normalizarCpf(v) : undefined))

const dataNascimentoField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined))
  .superRefine((v, ctx) => {
    if (!v) return
    const d = parseDataCompetencia(v)
    if (!d) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Data de nascimento inválida' })
      return
    }
    const hoje = new Date()
    if (d > hoje) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nascimento no futuro' })
      return
    }
    const min = new Date(1900, 0, 1)
    if (d < min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Data de nascimento inválida' })
    }
  })

export const AtualizarMembroLgeSchema = z.object({
  membroId: z.string().uuid(),
  rg: z.string().trim().max(30).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  cpf: cpfField,
  filiacao: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  escolaridade: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  profissao: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  dataNascimento: dataNascimentoField,
  planoAssociacaoId: z
    .union([z.string().uuid(), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v && String(v).length > 0 ? v : null)),
})

export const CriarPlanoAssociacaoSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  descricao: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  valor: z.coerce.number().positive().max(99_999_999.99),
  periodicidade: PeriodicidadePlanoSchema.default('MENSAL'),
  beneficios: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  ativo: z.coerce.boolean().optional().default(true),
})

export const AtualizarPlanoAssociacaoSchema = CriarPlanoAssociacaoSchema.extend({
  id: z.string().uuid(),
})

const vencimentoField = z
  .string()
  .min(1)
  .superRefine((v, ctx) => {
    const d = parseDataCompetencia(v)
    if (!d) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Vencimento inválido' })
      return
    }
    const err = validarJanelaCompetencia(d)
    if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err })
  })

export const CriarCobrancaSchema = z.object({
  userId: z.string().uuid(),
  planoAssociacaoId: z.string().uuid().optional(),
  tipo: TipoCobrancaSchema.default('MENSALIDADE'),
  descricao: z.string().trim().min(3).max(200),
  valor: z.coerce.number().positive().max(99_999_999.99),
  vencimento: vencimentoField,
})

export const BaixarCobrancaManualSchema = z.object({
  cobrancaId: z.string().uuid(),
})

export const CancelarCobrancaSchema = z.object({
  cobrancaId: z.string().uuid(),
})

export const DesligarMembroSchema = z.object({
  membroId: z.string().uuid(),
  motivo: z.string().trim().min(5).max(500),
})

export const COBRANCA_PAGE_SIZE = 40
