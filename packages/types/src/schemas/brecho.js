import { z } from 'zod'

export const BrechoModalidadeEnum = z.enum(['TROCA', 'DOACAO', 'VENDA'])
export const BrechoCategoriaEnum = z.enum([
  'CAMISA',
  'BERMUDA',
  'PATCH',
  'BANDEIRA_PESSOAL',
  'OUTRO',
])

export const CriarBrechoLojaSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(280).optional().nullable(),
  fotoUrl: z.string().url().optional().nullable(),
  capaUrl: z.string().url().optional().nullable(),
})

export const AtualizarBrechoLojaSchema = CriarBrechoLojaSchema.partial()

export const CriarBrechoAnuncioSchema = z
  .object({
    titulo: z.string().trim().min(2).max(100),
    descricao: z.string().trim().min(8).max(2000),
    modalidade: BrechoModalidadeEnum,
    categoria: BrechoCategoriaEnum,
    tamanho: z.string().trim().max(10).optional().nullable(),
    preco: z.coerce.number().positive().optional().nullable(),
    aceitoTroca: z.string().trim().max(400).optional().nullable(),
    imagensUrl: z.array(z.string().url()).min(1, 'Envie ao menos uma foto.').max(4, 'Máximo 4 imagens'),
  })
  .superRefine((data, ctx) => {
    if (data.modalidade === 'VENDA' && (data.preco == null || data.preco <= 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe o preço pedido (informativo — o acerto é no chat).',
        path: ['preco'],
      })
    }
    if (data.modalidade === 'TROCA' && !(data.aceitoTroca ?? '').trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Diga o que você aceita em troca.',
        path: ['aceitoTroca'],
      })
    }
  })

export const AtualizarBrechoAnuncioSchema = z
  .object({
    titulo: z.string().trim().min(2).max(100).optional(),
    descricao: z.string().trim().min(8).max(2000).optional(),
    modalidade: BrechoModalidadeEnum.optional(),
    categoria: BrechoCategoriaEnum.optional(),
    tamanho: z.string().trim().max(10).optional().nullable(),
    preco: z.coerce.number().positive().optional().nullable(),
    aceitoTroca: z.string().trim().max(400).optional().nullable(),
    imagensUrl: z.array(z.string().url()).min(1).max(4).optional(),
    status: z.enum(['ATIVO', 'RESERVADO', 'OCULTO', 'REMOVIDO']).optional(),
  })

export const DenunciaBrechoSchema = z.object({
  motivo: z.string().trim().min(8).max(500),
  anuncioId: z.string().uuid().optional(),
  lojaUserId: z.string().uuid().optional(),
  interesseId: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (!data.anuncioId && !data.lojaUserId && !data.interesseId) {
    ctx.addIssue({ code: 'custom', message: 'Informe o alvo da denúncia.' })
  }
})

export const BrechoFeedQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  categoria: BrechoCategoriaEnum.optional(),
  modalidade: BrechoModalidadeEnum.optional(),
  sort: z.enum(['recentes', 'confiaveis']).default('confiaveis'),
  pagina: z.coerce.number().int().min(1).default(1),
})
