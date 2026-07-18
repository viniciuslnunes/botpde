import { z } from 'zod'
import { formatNomeTorcida } from '../nome-torcida.js'

export const CreateTenantSchema = z.object({
  nome: z
    .string()
    .min(3, 'Nome deve ter ao menos 3 caracteres')
    .max(100)
    .transform(formatNomeTorcida),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  corPrimaria: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .optional(),
  discordGuildId: z.string().optional(),
})

export const UpdateTenantSchema = CreateTenantSchema.partial().extend({
  logoUrl: z.string().url().optional().nullable(),
})

// TenantDesignSchema vive em ../design.js (módulo Design admin).
