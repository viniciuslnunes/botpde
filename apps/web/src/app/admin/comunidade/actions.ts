'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { z } from 'zod'

const postSchema = z.object({
  titulo: z
    .string()
    .max(150)
    .optional()
    .transform((v) => v || undefined),
  conteudo: z.string().min(1, 'Conteúdo é obrigatório').max(4000),
  imagemUrl: z
    .string()
    .url('URL de imagem inválida')
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
})

export type PostState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function criarPost(_prev: PostState, formData: FormData): Promise<PostState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MANAGE)

  const raw = {
    titulo: formData.get('titulo') as string,
    conteudo: formData.get('conteudo') as string,
    imagemUrl: formData.get('imagemUrl') as string,
  }

  const parsed = postSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { titulo, conteudo, imagemUrl } = parsed.data

  const post = await db.post.create({
    data: { tenantId: tenant.id, autorId: session.user.id, titulo, conteudo, imagemUrl },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_CRIADO',
      entidade: 'Post',
      entidadeId: post.id,
    },
  })

  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade')
  return {}
}

export async function atualizarPost(
  postId: string,
  _prev: PostState,
  formData: FormData,
): Promise<PostState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MANAGE)

  const post = await db.post.findFirst({ where: { id: postId, tenantId: tenant.id } })
  if (!post) return { message: 'Post não encontrado' }

  const raw = {
    titulo: formData.get('titulo') as string,
    conteudo: formData.get('conteudo') as string,
    imagemUrl: formData.get('imagemUrl') as string,
  }

  const parsed = postSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { titulo, conteudo, imagemUrl } = parsed.data

  await db.post.update({
    where: { id: postId },
    data: { titulo, conteudo, imagemUrl },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_ATUALIZADO',
      entidade: 'Post',
      entidadeId: postId,
    },
  })

  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade')
  return {}
}

export async function alternarFixado(postId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MANAGE)

  const post = await db.post.findFirst({ where: { id: postId, tenantId: tenant.id } })
  if (!post) throw new Error('Post não encontrado')

  await db.post.update({ where: { id: postId }, data: { fixado: !post.fixado } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: post.fixado ? 'POST_DESAFIXADO' : 'POST_FIXADO',
      entidade: 'Post',
      entidadeId: postId,
    },
  })

  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade')
}

export async function excluirPost(postId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MANAGE)

  const post = await db.post.findFirst({ where: { id: postId, tenantId: tenant.id } })
  if (!post) throw new Error('Post não encontrado')

  await db.post.delete({ where: { id: postId } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_EXCLUIDO',
      entidade: 'Post',
      entidadeId: postId,
    },
  })

  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade')
}
