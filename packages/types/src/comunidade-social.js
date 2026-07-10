import { z } from 'zod'

/** Formato de menção no texto: @[Nome](user:uuid) */
export const MENCAO_REGEX = /@\[([^\]]+)\]\(user:([0-9a-f-]{36})\)/gi
export const HASHTAG_REGEX = /#([\p{L}\p{N}_]{2,40})/gu

export const reacaoTipoSchema = z.enum(['CURTIR', 'FORCA', 'VAMOS', 'PRESENTE'])

export const enqueteOpcoesSchema = z
  .array(z.string().trim().min(1).max(120))
  .min(2, 'Enquete precisa de ao menos 2 opções')
  .max(6, 'Máximo de 6 opções')

export const publicarEnqueteSchema = z.object({
  conteudo: z.string().trim().min(1).max(3000),
  opcoes: enqueteOpcoesSchema,
  visibilidade: z.enum(['PUBLICO', 'TENANT', 'PRIVADO']).default('PUBLICO'),
})

export const votarEnqueteSchema = z.object({
  enqueteId: z.string().min(1),
  opcaoId: z.string().min(1),
})

export const repostarComunicadoSchema = z.object({
  comunicadoId: z.string().min(1),
  comentario: z.string().trim().max(500).optional(),
})

export const repostarSchema = z.object({
  postId: z.string().min(1),
  comentario: z.string().trim().max(500).optional(),
})

export const publicarPostEventoSchema = z.object({
  conteudo: z.string().trim().min(1).max(3000),
  eventoId: z.string().min(1),
  visibilidade: z.enum(['PUBLICO', 'TENANT', 'PRIVADO']).default('PUBLICO'),
})

/** Máximo de menções distintas por publicação ou comentário. */
export const MAX_MENCOES_POR_CONTEUDO = 10

export const publicarPostGrupoSchema = z.object({
  conversaId: z.string().min(1),
  conteudo: z.string().trim().min(1).max(3000),
})

export const publicarMomentoStorySchema = z.object({
  midiaUrl: z.string().min(1).max(500),
  conteudo: z.string().trim().max(280).optional(),
})

export const criarGrupoPublicoSchema = z.object({
  nome: z.string().trim().min(3).max(80),
  descricao: z.string().trim().max(280).optional(),
})

export const criarDestaqueSchema = z.object({
  titulo: z.string().trim().min(1).max(40),
  postIds: z.array(z.string().min(1)).min(1).max(20),
})
