import { z } from 'zod'

const cloudinaryUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((url) => url.includes('res.cloudinary.com'), 'URL de imagem inválida')

export const atualizarPerfilSocialSchema = z.object({
  bio: z.string().max(280, 'Bio deve ter no máximo 280 caracteres').optional(),
  perfilPrivado: z.boolean(),
  exibirCidade: z.boolean(),
  exibirSede: z.boolean(),
  exibirDesde: z.boolean(),
  bannerUrl: cloudinaryUrlSchema.nullable().optional(),
  bannerPos: z.number().int().min(0).max(100).nullable().optional(),
  avatarUrl: cloudinaryUrlSchema.nullable().optional(),
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
