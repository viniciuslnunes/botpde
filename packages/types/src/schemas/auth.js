import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
})

export const SessionUserSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().nullable(),
  email: z.string().email().nullable(),
  avatarUrl: z.string().url().nullable(),
  discordId: z.string().nullable(),
  googleId: z.string().nullable(),
})
