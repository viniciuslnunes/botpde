import { z } from 'zod'

export const CriarMembroSchema = z.object({
  tipo: z.enum(['SOCIO', 'TORCEDOR']),
  nome: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(100),
  idade: z.number().int().min(14).max(100).optional(),
  telefone: z.string().max(20).optional(),
  cidade: z.string().max(100).optional(),
  numeroAssociado: z.string().max(50).optional(),
})

export const AprovarMembroSchema = z.object({
  membroId: z.string().uuid(),
})

export const ReprovarMembroSchema = z.object({
  membroId: z.string().uuid(),
  motivo: z.string().max(500).optional(),
})
