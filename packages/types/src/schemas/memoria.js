import { z } from 'zod'
import { MEMORIA_ESCOPO, MEMORIA_FATO_VISIBILIDADE } from '../memoria.js'

export const MemoriaEscopoSchema = z.enum([
  MEMORIA_ESCOPO.UNIDADE,
  MEMORIA_ESCOPO.TORCIDA,
  MEMORIA_ESCOPO.CLUBE,
])

export const MemoriaFatoVisibilidadeSchema = z.enum([
  MEMORIA_FATO_VISIBILIDADE.PUBLICO,
  MEMORIA_FATO_VISIBILIDADE.TENANT,
])

const DiaIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o dia em YYYY-MM-DD')

/** Query da rota `/portal/memoria`. */
export const MemoriaQuerySchema = z.object({
  dia: DiaIsoSchema.optional(),
  f: z.enum(['todos', 'jogo', 'evento', 'publicacao']).optional(),
  escopo: MemoriaEscopoSchema.optional(),
  cap: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
})

/**
 * Publicar na data da Memória. `dia` é o dia da linha, não o de agora.
 * Passado = fato atrasado (moderação). Hoje/futuro do calendário entram na hora.
 */
export const CriarMemoriaFatoSchema = z
  .object({
    dia: DiaIsoSchema,
    conteudo: z.string().trim().max(2000),
    midiaUrls: z.array(z.string().url()).max(6).default([]),
    visibilidade: MemoriaFatoVisibilidadeSchema.default('PUBLICO'),
    eventoId: z.string().uuid().optional(),
    postId: z.string().uuid().optional(),
  })
  .refine((d) => d.conteudo.length > 0 || d.midiaUrls.length > 0, {
    message: 'Escreva algo ou anexe foto, vídeo ou link.',
    path: ['conteudo'],
  })

/** Texto único do composer — a intenção é inferida no servidor. */
export const PublicarMemoriaDiaSchema = z.object({
  dia: DiaIsoSchema,
  texto: z.string().trim().max(2000),
  midiaUrls: z.array(z.string().url()).max(6).default([]),
  visibilidade: MemoriaFatoVisibilidadeSchema.default('PUBLICO'),
  modo: z.enum(['fato', 'marco', 'aniversario']).optional(),
  eventoId: z.string().uuid().optional(),
  postId: z.string().uuid().optional(),
})

export const DecidirMemoriaFatoSchema = z.object({
  id: z.string().uuid(),
  decidir: z.enum(['aprovar', 'rejeitar']),
  motivo: z.string().trim().max(500).optional(),
})

export const AlternarMemoriaAliadosSchema = z.object({
  habilitada: z.boolean(),
})

export const AlternarMemoriaPresencaSchema = z.object({
  visivel: z.boolean(),
})

export const CriarMemoriaMarcoSchema = z.object({
  dia: DiaIsoSchema,
  titulo: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(500).optional(),
})

export const RemoverMemoriaMarcoSchema = z.object({
  id: z.string().uuid(),
})

export const SalvarMemoriaCapituloSchema = z.object({
  id: z.string().uuid().optional(),
  titulo: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas e hífens'),
  descricao: z.string().trim().max(500).optional(),
  dias: z.array(DiaIsoSchema).max(120).default([]),
  ativo: z.boolean().default(true),
})
