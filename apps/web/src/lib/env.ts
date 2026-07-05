import { z } from 'zod'

// ── Esquema servidor ──────────────────────────────────────────────────────────
// Validado uma única vez no startup. Variáveis ausentes ou malformadas
// lançam um erro explícito antes de qualquer requisição ser processada.

const serverSchema = z.object({
  // Banco de dados
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL é obrigatória')
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
      message: 'DATABASE_URL deve ser uma URL PostgreSQL válida (postgresql:// ou postgres://)',
    }),

  // NextAuth v5 / Auth.js
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET deve ter pelo menos 32 caracteres — gere com: openssl rand -base64 32'),

  // Discord OAuth
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID é obrigatória'),
  DISCORD_CLIENT_SECRET: z.string().min(1, 'DISCORD_CLIENT_SECRET é obrigatória'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID é obrigatória'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET é obrigatória'),

  // Multi-tenancy
  TENANT_SLUG: z.string().optional(),
  // Domínio raiz pra roteamento por subdomínio real (ex: torcida.app, ou
  // lvh.me em dev — resolve *.lvh.me pra 127.0.0.1 sem precisar de DNS).
  // Ausente = modo single-tenant via TENANT_SLUG (comportamento atual).
  ROOT_DOMAIN: z.string().optional(),

  // Super admins (e-mails separados por vírgula)
  SUPER_ADMIN_EMAILS: z.string().optional(),

  // Runtime
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOSTNAME: z.string().default('0.0.0.0'),
})

// ── Esquema cliente ───────────────────────────────────────────────────────────
// Apenas variáveis com prefixo NEXT_PUBLIC_ são enviadas ao browser.

const clientSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
})

// ── Validação ─────────────────────────────────────────────────────────────────

function validateEnv() {
  // Pula validação durante tsc --noEmit (código não é executado em typecheck)
  // Em testes unitários, defina SKIP_ENV_VALIDATION=true
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    return {
      DATABASE_URL: '',
      AUTH_SECRET: '',
      DISCORD_CLIENT_ID: '',
      DISCORD_CLIENT_SECRET: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      TENANT_SLUG: undefined,
      ROOT_DOMAIN: undefined,
      SUPER_ADMIN_EMAILS: undefined,
      NODE_ENV: 'development' as const,
      PORT: 3000,
      HOSTNAME: '0.0.0.0',
      NEXT_PUBLIC_API_URL: undefined,
    }
  }

  const parsed = serverSchema.safeParse(process.env)

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    const messages = Object.entries(errors)
      .map(([field, msgs]) => `  • ${field}: ${msgs?.join(', ')}`)
      .join('\n')

    console.error('\n❌  Variáveis de ambiente inválidas ou ausentes:\n')
    console.error(messages)
    console.error('\n   Consulte apps/web/.env.example para referência.\n')

    throw new Error('Configuração de ambiente inválida. Veja o console para detalhes.')
  }

  const clientParsed = clientSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  })

  return {
    ...parsed.data,
    ...(clientParsed.success ? clientParsed.data : {}),
  }
}

export const env = validateEnv()

// ── Helpers derivados ─────────────────────────────────────────────────────────

export const superAdminEmails: string[] = env.SUPER_ADMIN_EMAILS
  ? env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)
  : []

export const isDev = env.NODE_ENV === 'development'
export const isProd = env.NODE_ENV === 'production'
