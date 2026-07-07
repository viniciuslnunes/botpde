import { z } from 'zod'

/**
 * Contrato único de entrada da importação de membros — source-agnostic.
 * Todo adapter de origem (mock, bot, csv) produz MembroImportInput[];
 * o pipeline não conhece a fonte. Ver docs/data/spec-importacao-membros.md.
 */
export const MembroImportInputSchema = z.object({
  discordId: z.string().min(1).optional(),
  nome: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(100),
  tipo: z.enum(['SOCIO', 'TORCEDOR']),
  numeroAssociado: z.string().max(50).optional(),
  cidade: z.string().max(100).optional(),
  telefone: z.string().max(20).optional(),
  idade: z.number().int().min(14).max(100).optional(),
  email: z.string().email().optional(),
})

/** Lote de entrada validado de uma vez (limite defensivo por execução). */
export const ImportacaoLoteSchema = z.array(MembroImportInputSchema).max(1000)
