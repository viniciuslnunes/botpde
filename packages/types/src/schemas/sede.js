import { z } from 'zod'

export const CriarSedeSchema = z.object({
  nome: z.string().min(2).max(100),
  tipo: z.enum(['SEDE', 'SUBSEDE', 'PONTO_ENCONTRO']),
  endereco: z.string().max(200).optional(),
  cidade: z.string().max(100).optional(),
  estado: z.string().length(2).optional(),
  cep: z.string().max(10).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  capacidade: z.number().int().positive().optional(),
  responsavel: z.string().max(100).optional(),
  telefone: z.string().max(20).optional(),
  horarios: z.string().max(200).optional(),
  descricao: z.string().max(1000).optional(),
  sedeId: z.string().uuid().optional().nullable(),
})

export const UpdateSedeSchema = CriarSedeSchema.partial()
