import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
})

/** Senhas banidas no cadastro (lista curta — não substitui HIBP). */
export const SENHAS_COMUNS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'qwerty12',
  'qwerty123',
  'abcdefgh',
  'senha123',
  'senha1234',
  'torcida1',
  'torcida12',
  '11111111',
  '00000000',
  '87654321',
  'abcdefg1',
  'letmein1',
  'welcome1',
  'iloveyou',
  'admin123',
])

/**
 * Política de senha no cadastro (não no login — contas antigas podem ser fracas).
 * 8–72 chars, não só dígitos, letra + número, denylist básica.
 */
export const senhaCadastroSchema = z
  .string()
  .min(8, 'A senha deve ter ao menos 8 caracteres')
  .max(72, 'A senha deve ter no máximo 72 caracteres')
  .refine((s) => !/^\d+$/.test(s), 'A senha não pode ser só números')
  .refine(
    (s) => /[a-zA-Z]/.test(s) && /\d/.test(s),
    'Use letras e pelo menos um número',
  )
  .refine(
    (s) => !SENHAS_COMUNS.has(s.toLowerCase()),
    'Senha muito comum. Escolha outra.',
  )

export const SessionUserSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().nullable(),
  email: z.string().email().nullable(),
  avatarUrl: z.string().url().nullable(),
  discordId: z.string().nullable(),
  googleId: z.string().nullable(),
})
