import { z } from 'zod'

export const TipoEventoSchema = z.enum(['GERAL', 'CARAVANA', 'ENSAIO'])

/** @type {Record<string, string>} */
export const TIPO_EVENTO_LABEL = {
  GERAL: 'Evento',
  CARAVANA: 'Caravana',
  ENSAIO: 'Ensaio',
}

export const CriarEventoSchema = z.object({
  titulo: z.string().min(3, 'Título muito curto').max(200),
  descricao: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  data: z.string().min(1, 'Data obrigatória'),
  local: z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  tipo: TipoEventoSchema.default('GERAL'),
  sedeId: z.string().uuid().optional().nullable(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /** Valor da vaga (só caravana). Vazio = sem cobrança. */
  valorVaga: z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return undefined
    return v
  }, z.coerce.number().positive('Valor deve ser positivo').max(99_999.99).optional()),
})

export const UpdateEventoSchema = CriarEventoSchema.partial()
