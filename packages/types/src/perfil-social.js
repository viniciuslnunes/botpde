import { z } from 'zod'

const cloudinaryUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((url) => url.includes('res.cloudinary.com'), 'URL de imagem inválida')

export const atualizarPerfilSocialSchema = z.object({
  /** Tenant da tela aberta — evita gravar no tenant errado quando o host/proxy diverge. */
  tenantId: z.string().min(1),
  bio: z.string().max(280, 'Bio deve ter no máximo 280 caracteres').optional(),
  perfilPrivado: z.boolean().optional(),
  exibirCidade: z.boolean().optional(),
  exibirSede: z.boolean().optional(),
  exibirDesde: z.boolean().optional(),
  /** Badge do feed: "Sócio - Nº N". Default true quando omitido no create. */
  exibirNumeroSocioNoFeed: z.boolean().optional(),
  /** Opt-in: aparecer em "quem estava" na memória após check-in. Default off. */
  memoriaPresencaVisivel: z.boolean().optional(),
  bannerUrl: cloudinaryUrlSchema.nullable().optional(),
  bannerPos: z.number().int().min(0).max(100).nullable().optional(),
  avatarUrl: cloudinaryUrlSchema.nullable().optional(),
  /**
   * Upload de capa/foto: atualiza só mídia, sem alterar bio/privacidade
   * (evita gravar checkbox ainda não confirmado pelo botão Salvar).
   */
  apenasMidia: z.boolean().optional(),
})

export const buscaMembrosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  take: z.coerce.number().int().min(1).max(40).default(20),
})

export const listarRedeSocialSchema = z.object({
  userId: z.string().min(1),
  tipo: z.enum(['seguidores', 'seguindo']),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(30),
})

export const editarPostSchema = z.object({
  postId: z.string().min(1),
  conteudo: z.string().trim().min(1).max(3000),
})

export const visibilidadePostSchema = z.enum(['PUBLICO', 'TENANT', 'PRIVADO'])
