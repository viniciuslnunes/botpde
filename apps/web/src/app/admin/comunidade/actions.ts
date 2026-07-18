'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { invalidateComunicadosCache } from '@/lib/comunidade'
import { notificarComunicadoUrgente } from '@/lib/notificacoes-routing'
import { PERMISSIONS } from '@torcida/types'
import { z } from 'zod'
import { isDurableRemoteImageUrl } from '@/lib/optimizable-image'

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
    .transform((v) => v || undefined)
    .refine(
      (v) => v === undefined || isDurableRemoteImageUrl(v),
      'URL de imagem temporária (ex.: Discord) não é aceita — use upload permanente',
    ),
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
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      titulo,
      conteudo,
      imagemUrl,
      tipo: 'INSTITUCIONAL',
    },
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

/* ── Comunicados oficiais ──────────────────────────────────────────────────
 * Distintos de Post: gated por ANNOUNCEMENTS_PUBLISH, não por
 * COMMUNITY_MANAGE — nem todo post comunitário é comunicado oficial, e só
 * perfis autorizados a publicar conteúdo institucional passam neste gate. */

const comunicadoSchema = z.object({
  titulo: z.string().min(1, 'Título é obrigatório').max(150),
  corpo: z.string().min(1, 'Conteúdo é obrigatório').max(4000),
  prioridade: z.enum(['NORMAL', 'IMPORTANTE', 'URGENTE']),
})

export type ComunicadoState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function criarComunicado(
  _prev: ComunicadoState,
  formData: FormData,
): Promise<ComunicadoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH)

  const raw = {
    titulo: formData.get('titulo') as string,
    corpo: formData.get('corpo') as string,
    prioridade: formData.get('prioridade') as string,
  }

  const parsed = comunicadoSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { titulo, corpo, prioridade } = parsed.data

  const comunicado = await db.announcement.create({
    data: { tenantId: tenant.id, autorId: session.user.id, titulo, corpo, prioridade },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COMUNICADO_CRIADO',
      entidade: 'Announcement',
      entidadeId: comunicado.id,
    },
  })

  if (prioridade === 'URGENTE') {
    await notificarComunicadoUrgente({
      tenantId: tenant.id,
      tipo: 'COMUNICADO_URGENTE',
      titulo: `Urgente: ${titulo}`,
      corpo: corpo.slice(0, 280),
      link: '/portal/comunidade',
      excetoUserId: session.user.id,
    })
  }

  invalidateComunicadosCache(tenant.id)
  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
  return {}
}

export async function atualizarComunicado(
  comunicadoId: string,
  _prev: ComunicadoState,
  formData: FormData,
): Promise<ComunicadoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH)

  const comunicado = await db.announcement.findFirst({
    where: { id: comunicadoId, tenantId: tenant.id },
  })
  if (!comunicado) return { message: 'Comunicado não encontrado' }

  const raw = {
    titulo: formData.get('titulo') as string,
    corpo: formData.get('corpo') as string,
    prioridade: formData.get('prioridade') as string,
  }

  const parsed = comunicadoSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { titulo, corpo, prioridade } = parsed.data

  await db.announcement.update({
    where: { id: comunicadoId },
    data: { titulo, corpo, prioridade },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COMUNICADO_ATUALIZADO',
      entidade: 'Announcement',
      entidadeId: comunicadoId,
    },
  })

  invalidateComunicadosCache(tenant.id)
  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
  return {}
}

export async function alternarFixadoComunicado(comunicadoId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH)

  const comunicado = await db.announcement.findFirst({
    where: { id: comunicadoId, tenantId: tenant.id },
  })
  if (!comunicado) throw new Error('Comunicado não encontrado')

  await db.announcement.update({ where: { id: comunicadoId }, data: { fixado: !comunicado.fixado } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: comunicado.fixado ? 'COMUNICADO_DESAFIXADO' : 'COMUNICADO_FIXADO',
      entidade: 'Announcement',
      entidadeId: comunicadoId,
    },
  })

  invalidateComunicadosCache(tenant.id)
  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
}

export async function excluirComunicado(comunicadoId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH)

  const comunicado = await db.announcement.findFirst({
    where: { id: comunicadoId, tenantId: tenant.id },
  })
  if (!comunicado) throw new Error('Comunicado não encontrado')

  await db.announcement.delete({ where: { id: comunicadoId } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COMUNICADO_EXCLUIDO',
      entidade: 'Announcement',
      entidadeId: comunicadoId,
    },
  })

  invalidateComunicadosCache(tenant.id)
  revalidatePath('/admin/comunidade')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
}
