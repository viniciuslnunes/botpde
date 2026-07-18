import { z } from 'zod'

export const TipoEventoSchema = z.enum(['GERAL', 'CARAVANA', 'ENSAIO'])

export const RsvpStatusSchema = z.enum(['CONFIRMADO', 'RECUSADO', 'LISTA_ESPERA'])

/** @type {Record<string, string>} */
export const TIPO_EVENTO_LABEL = {
  GERAL: 'Evento',
  CARAVANA: 'Caravana',
  ENSAIO: 'Ensaio',
}

/** @type {Record<string, string>} */
export const RSVP_STATUS_LABEL = {
  CONFIRMADO: 'Confirmado',
  RECUSADO: 'Recusado',
  LISTA_ESPERA: 'Lista de espera',
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
  fotoUrl: z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return undefined
    return v
  }, z.string().url('URL da foto inválida').max(500).optional()),
  tipo: TipoEventoSchema.default('GERAL'),
  sedeId: z.preprocess((v) => {
    if (v === '' || v === null || v === undefined || v === 'global') return null
    return v
  }, z.string().uuid().nullable().optional()),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /** Override de lotação. Vazio = usa capacidade da sede (se houver). */
  capacidade: z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return undefined
    return v
  }, z.coerce.number().int().positive('Capacidade deve ser positiva').max(100_000).optional()),
  /** Valor da vaga (só caravana). Vazio = sem cobrança. */
  valorVaga: z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return undefined
    return v
  }, z.coerce.number().positive('Valor deve ser positivo').max(99_999.99).optional()),
})

export const UpdateEventoSchema = CriarEventoSchema.partial()
