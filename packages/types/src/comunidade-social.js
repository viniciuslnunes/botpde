import { z } from 'zod'

/** Formato de menção no texto: @[Nome](user:uuid) */
export const MENCAO_REGEX = /@\[([^\]]+)\]\(user:([0-9a-f-]{36})\)/gi
export const HASHTAG_REGEX = /#([\p{L}\p{N}_]{2,40})/gu

export const reacaoTipoSchema = z.enum(['CURTIR'])

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

export const criarCanalTematicoSchema = z.object({
  nome: z.string().trim().min(3).max(80),
  descricao: z.string().trim().max(280).optional(),
  visibilidadeCanal: z.enum(['TENANT', 'HIERARQUIA', 'ALIADOS', 'PUBLICO']).default('HIERARQUIA'),
  avatarUrl: z.string().url().max(500).optional(),
  /** false = canal fechado — entrada mediante pedido/aprovação de um admin. */
  publica: z.boolean().default(true),
})

export const alterarAdminCanalSchema = z.object({
  conversaId: z.string().min(1),
  userId: z.string().min(1),
  papel: z.enum(['ADMIN', 'MEMBRO']),
})

export const publicarPostCanalSchema = z.object({
  conversaId: z.string().min(1),
  conteudo: z.string().trim().min(1).max(3000),
})

/** Campos editáveis de um canal (oficial ou temático) após criado. */
const canalEditavelBase = z.object({
  nome: z.string().trim().min(3).max(80),
  descricao: z.string().trim().max(280).optional(),
  visibilidadeCanal: z.enum(['TENANT', 'HIERARQUIA', 'ALIADOS', 'PUBLICO']),
  somenteAdminPublica: z.boolean(),
  publica: z.boolean(),
  avatarUrl: z.string().max(500).optional(),
})

/** Canal oficial da unidade — editado em `/admin/configuracoes` (SETTINGS_MANAGE). */
export const editarCanalOficialSchema = canalEditavelBase

/** Canal temático — editado no próprio painel do canal (admin do canal ou CHANNELS_MANAGE). */
export const atualizarCanalTematicoSchema = canalEditavelBase.extend({
  conversaId: z.string().min(1),
})

export const pedirEntradaCanalSchema = z.object({
  conversaId: z.string().min(1),
})

export const decidirPedidoCanalSchema = z.object({
  conversaId: z.string().min(1),
  userId: z.string().min(1),
  aprovar: z.boolean(),
})

export const criarGrupoSchema = z.object({
  nome: z.string().trim().min(3).max(80),
  descricao: z.string().trim().max(280).optional(),
  publica: z.boolean().default(true),
})

/** @deprecated Use criarGrupoSchema — mantido para compat. */
export const criarGrupoPublicoSchema = criarGrupoSchema

export const atualizarGrupoSchema = z.object({
  conversaId: z.string().min(1),
  nome: z.string().trim().min(3).max(80),
  descricao: z.string().trim().max(280).optional().nullable(),
  publica: z.boolean(),
  avatarUrl: z.string().url().nullable().optional(),
  somenteAdminPublica: z.boolean().optional(),
})

export const alterarPapelGrupoSchema = z.object({
  conversaId: z.string().min(1),
  userId: z.string().min(1),
  papel: z.enum(['ADMIN', 'MEMBRO']),
})

export const removerMembroGrupoSchema = z.object({
  conversaId: z.string().min(1),
  userId: z.string().min(1),
})

export const conversaGrupoIdSchema = z.object({
  conversaId: z.string().min(1),
})

export const entrarPorConviteGrupoSchema = z.object({
  codigo: z.string().trim().min(4).max(32),
})

export const ocultarPostGrupoSchema = z.object({
  postId: z.string().min(1),
})

export const pedirEntradaGrupoSchema = z.object({
  conversaId: z.string().min(1),
})

export const decidirPedidoGrupoSchema = z.object({
  conversaId: z.string().min(1),
  userId: z.string().min(1),
  aprovar: z.boolean(),
})

export const sairGrupoSchema = z.object({
  conversaId: z.string().min(1),
})

export const alternarSilencioGrupoSchema = z.object({
  conversaId: z.string().min(1),
})

export const criarDestaqueSchema = z.object({
  titulo: z.string().trim().min(1).max(40),
  postIds: z.array(z.string().min(1)).min(1).max(20),
})
