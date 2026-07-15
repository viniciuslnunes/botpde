import { z } from 'zod'

/** Reservados — não podem ser reclamados como @nickname. */
export const NICKNAMES_RESERVADOS = new Set([
  'admin',
  'administrador',
  'api',
  'bot',
  'comunidade',
  'help',
  'me',
  'mod',
  'moderador',
  'null',
  'oficial',
  'onboarding',
  'root',
  'suporte',
  'support',
  'system',
  'torcida',
  'undefined',
])

/** Remove @ inicial e normaliza para minúsculas. */
export function normalizarNickname(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

/**
 * Sugestão a partir do nome de exibição (OAuth) — só letras/números/_.
 * Pode ser inválida ou vazia; o formulário valida de novo.
 */
export function sugerirNickname(nome) {
  const base = String(nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20)
  if (base.length < 3 || /^\d+$/.test(base) || NICKNAMES_RESERVADOS.has(base)) {
    return ''
  }
  return base
}

/**
 * Handle público único (@usuario).
 * 3–20 chars, letras minúsculas, números e underscore; não só dígitos.
 */
export const nicknameSchema = z
  .string()
  .transform(normalizarNickname)
  .pipe(
    z
      .string()
      .min(3, 'Apelido deve ter ao menos 3 caracteres')
      .max(20, 'Apelido deve ter no máximo 20 caracteres')
      .regex(
        /^[a-z0-9_]+$/,
        'Use apenas letras minúsculas, números e underscore (sem acentos ou espaços)',
      )
      .refine((v) => !/^\d+$/.test(v), 'Apelido não pode ser só números')
      .refine((v) => !NICKNAMES_RESERVADOS.has(v), 'Este apelido está reservado'),
  )

/**
 * Candidatos de @ a partir do nome — base + variantes numéricas se a base
 * estiver ocupada/reservada. Usado no cadastro e na API de sugestão.
 */
export function candidatosNickname(nome, max = 24) {
  const bruto = String(nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20)

  let base = sugerirNickname(nome)
  if (!base && bruto.length >= 3 && !/^\d+$/.test(bruto)) {
    // Nome caiu em reservado (ex.: "Admin") — ancora com sufixo.
    base = `${bruto.slice(0, 18)}_1`
  }
  if (!base) return []

  const out = []
  const push = (n) => {
    const parsed = nicknameSchema.safeParse(n)
    if (parsed.success && !out.includes(parsed.data)) out.push(parsed.data)
  }

  push(base)
  for (let i = 1; i <= max && out.length < max; i++) {
    const suffix = String(i)
    push(`${base.slice(0, 20 - suffix.length)}${suffix}`)
    if (out.length >= max) break
    const under = `_${i}`
    push(`${base.slice(0, 20 - under.length)}${under}`)
  }
  return out
}

/**
 * Campo de formulário: vazio → null; valor válido → string normalizada.
 * Preferir `nicknameSchema` (obrigatório) no perfil e no pós-login.
 */
export const nicknameFormSchema = z.preprocess(
  (v) => {
    if (v == null) return ''
    return normalizarNickname(String(v))
  },
  z.union([
    z.literal('').transform(() => null),
    nicknameSchema,
  ]),
)
