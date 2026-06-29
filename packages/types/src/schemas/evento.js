import { z } from 'zod'

export const CriarEventoSchema = z.object({
  titulo: z.string().min(3).max(200),
  descricao: z.string().max(2000).optional(),
  data: z.string().datetime({ message: 'Data inválida' }),
  local: z.string().max(200).optional(),
  sedeId: z.string().uuid().optional().nullable(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

export const UpdateEventoSchema = CriarEventoSchema.partial()
