import { z } from 'zod'
import { parseDataCompetencia, validarJanelaCompetencia } from './financeiro.js'

export const PeriodicidadePlanoSchema = z.enum([
  'MENSAL',
  'TRIMESTRAL',
  'QUADRIMENSAL',
  'SEMESTRAL',
  'ANUAL',
  'UNICA',
])
export const TipoCobrancaSchema = z.enum(['MENSALIDADE', 'ADESAO', 'AVULSA'])
export const StatusCobrancaSchema = z.enum(['PENDENTE', 'PAGA', 'CANCELADA', 'VENCIDA'])

/** @typedef {z.infer<typeof PeriodicidadePlanoSchema>} PeriodicidadePlano */

export const PERIODICIDADE_PLANO_LABEL = Object.freeze({
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  QUADRIMENSAL: 'Quadrimensal',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
  UNICA: 'Única',
})

/** Meses a somar à data de expedição para obter a validade. UNICA = null (sem ciclo). */
export const PERIODICIDADE_PLANO_MESES = Object.freeze({
  MENSAL: 1,
  TRIMESTRAL: 3,
  QUADRIMENSAL: 4,
  SEMESTRAL: 6,
  ANUAL: 12,
  UNICA: null,
})

/** Fallback quando Tenant.periodicidadesOnboarding está vazio (âncora Gaviões). */
export const PERIODICIDADES_ONBOARDING_PADRAO = Object.freeze(
  /** @type {readonly ['QUADRIMENSAL', 'ANUAL']} */ (['QUADRIMENSAL', 'ANUAL']),
)

/**
 * Resolve as periodicidades oferecidas no wizard «Já sou sócio».
 * @param {readonly string[] | null | undefined} configuradas
 * @returns {PeriodicidadePlano[]}
 */
export function resolverPeriodicidadesOnboarding(configuradas) {
  const validas = (configuradas ?? []).filter(
    (p) => PeriodicidadePlanoSchema.safeParse(p).success,
  )
  if (validas.length === 0) return [...PERIODICIDADES_ONBOARDING_PADRAO]
  return /** @type {PeriodicidadePlano[]} */ (validas)
}

/**
 * Soma a periodicidade à data de expedição (calendário civil, dia preservado).
 * UNICA: validade prática longe (100 anos) — sem ciclo de renovação.
 * @param {Date} dataExpedicao
 * @param {PeriodicidadePlano} periodicidade
 * @returns {Date}
 */
export function calcularValidadeCarteirinha(dataExpedicao, periodicidade) {
  const base = new Date(dataExpedicao.getTime())
  if (Number.isNaN(base.getTime())) {
    throw new Error('Data de expedição inválida')
  }
  const meses = PERIODICIDADE_PLANO_MESES[periodicidade]
  const out = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  if (meses == null) {
    out.setFullYear(out.getFullYear() + 100)
    return out
  }
  out.setMonth(out.getMonth() + meses)
  return out
}

export const SalvarPeriodicidadesOnboardingSchema = z.object({
  periodicidades: z.array(PeriodicidadePlanoSchema).min(1).max(6),
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

/**
 * Normaliza RG no formato brasileiro comum (SP): dígitos + verificador opcional `X`.
 * Aceita 5–9 caracteres alfanuméricos (ex.: `12.345.678-9` → `123456789`).
 * @param {string | undefined | null} raw
 */
export function normalizarRg(raw) {
  if (!raw) return null
  const upper = String(raw).toUpperCase().replace(/[^0-9X]/g, '')
  // `X` só é permitido como dígito verificador (último caractere).
  if (/X/.test(upper.slice(0, -1))) return null
  if (upper.length < 5 || upper.length > 9) return null
  return upper
}

/**
 * Valida RG normalizado: tamanho 5–9, `X` só no fim, rejeita sequência repetida.
 * @param {string | undefined | null} raw
 */
export function validarRg(raw) {
  const n = normalizarRg(raw)
  if (!n) return false
  const corpo = n.endsWith('X') ? n.slice(0, -1) : n
  if (!/^\d+$/.test(corpo)) return false
  if (/^(\d)\1+$/.test(corpo)) return false
  return true
}

/**
 * Telefone BR só com dígitos (DDD + número). Aceita 10 (fixo) ou 11 (celular).
 * @param {string | undefined | null} raw
 */
export function normalizarTelefone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11) return null
  // DDD 11–99; rejeita 00 e começo inválido.
  const ddd = Number(digits.slice(0, 2))
  if (ddd < 11) return null
  return digits
}

/**
 * Valida telefone BR (máscara ou só dígitos).
 * @param {string | undefined | null} raw
 */
export function validarTelefoneBr(raw) {
  return normalizarTelefone(raw) != null
}

/**
 * Máscara progressiva: `(XX) XXXX-XXXX` ou `(XX) XXXXX-XXXX`.
 * @param {string | undefined | null} raw
 */
export function maskTelefone(raw) {
  const digitos = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 11)
  if (digitos.length === 0) return ''
  if (digitos.length <= 2) return `(${digitos}`
  const ddd = digitos.slice(0, 2)
  const resto = digitos.slice(2)
  const corte = digitos.length > 10 ? 5 : 4
  if (resto.length <= corte) return `(${ddd}) ${resto}`
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`
}

/**
 * Máscara progressiva de RG (formato SP): `00.000.000-0` — verificador pode ser `X`.
 * @param {string | undefined | null} raw
 */
export function maskRg(raw) {
  const upper = String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9X]/g, '')
  let limpo = ''
  for (let i = 0; i < upper.length; i++) {
    const c = upper[i]
    if (c === 'X') {
      if (i === upper.length - 1 && limpo.length > 0) limpo += 'X'
    } else {
      limpo += c
    }
  }
  limpo = limpo.slice(0, 9)
  const p1 = limpo.slice(0, 2)
  const p2 = limpo.slice(2, 5)
  const p3 = limpo.slice(5, 8)
  const p4 = limpo.slice(8, 9)
  let out = p1
  if (p2) out += `.${p2}`
  if (p3) out += `.${p3}`
  if (p4) out += `-${p4}`
  return out
}

/**
 * Formata RG armazenado (normalizado ou mascarado) para exibição.
 * @param {string | undefined | null} raw
 */
export function formatRg(raw) {
  if (!raw) return null
  const upper = String(raw).toUpperCase().replace(/[^0-9X]/g, '')
  if (!upper) return null
  return maskRg(upper)
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

const rgField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined))
  .superRefine((v, ctx) => {
    if (!v) return
    if (!validarRg(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'RG inválido' })
    }
  })
  .transform((v) => (v ? normalizarRg(v) ?? undefined : undefined))

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
  rg: rgField,
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
