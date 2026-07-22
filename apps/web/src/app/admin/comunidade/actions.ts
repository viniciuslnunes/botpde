'use server'

import { revalidatePath } from 'next/cache'
import { db, Prisma } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { invalidateComunicadosCache } from '@/lib/comunidade'
import { notificarComunicadoUrgente } from '@/lib/notificacoes-routing'
import { PERMISSIONS } from '@torcida/types'
import { z } from 'zod'
import { isDurableRemoteImageUrl } from '@/lib/optimizable-image'
import { isCloudinaryUrl, isSocialUrl, isStickerPath, midiasComEmbedDoTexto } from '@/lib/social-embed'

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
  revalidatePath('/admin/comunidade/mural')
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
  revalidatePath('/admin/comunidade/mural')
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
  revalidatePath('/admin/comunidade/mural')
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
  revalidatePath('/admin/comunidade/mural')
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

type PrioridadeComunicado = 'NORMAL' | 'IMPORTANTE' | 'URGENTE'

/**
 * Cria o Announcement + o Post institucional vinculado (entrada real do
 * feed — ver `getDescobrirPostsBaseCached`/`scoreDescobrirPost` em
 * `@/lib/feed`), audita, notifica urgência e invalida os caches. Único
 * ponto de publicação — `criarComunicado` e `publicarComunicadoComposer`
 * só coletam/validam o input e chamam isto.
 */
async function publicarComunicadoENotificar(opts: {
  tenantId: string
  autorId: string
  titulo: string
  corpo: string
  prioridade: PrioridadeComunicado
  midias?: string[]
}): Promise<{ id: string }> {
  const comunicado = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const criado = await tx.announcement.create({
      data: {
        tenantId: opts.tenantId,
        autorId: opts.autorId,
        titulo: opts.titulo,
        corpo: opts.corpo,
        prioridade: opts.prioridade,
      },
    })
    await tx.post.create({
      data: {
        tenantId: opts.tenantId,
        autorId: opts.autorId,
        titulo: null,
        conteudo: '',
        tipo: 'INSTITUCIONAL',
        visibilidade: 'PUBLICO',
        fixado: false,
        midiaUrls: midiasComEmbedDoTexto(opts.corpo, opts.midias ?? []),
        comunicadoOrigemId: criado.id,
      },
    })
    return criado
  })

  await db.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      atorId: opts.autorId,
      acao: 'COMUNICADO_CRIADO',
      entidade: 'Announcement',
      entidadeId: comunicado.id,
    },
  })

  if (opts.prioridade === 'URGENTE') {
    await notificarComunicadoUrgente({
      tenantId: opts.tenantId,
      tipo: 'COMUNICADO_URGENTE',
      titulo: `Urgente: ${opts.titulo}`,
      corpo: opts.corpo.slice(0, 280),
      link: '/portal/comunidade',
      excetoUserId: opts.autorId,
    })
  }

  invalidateComunicadosCache(opts.tenantId)
  revalidatePath('/admin/comunidade')
  revalidatePath('/admin/comunidade/comunicados')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')

  return comunicado
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

  await publicarComunicadoENotificar({
    tenantId: tenant.id,
    autorId: session.user.id,
    titulo,
    corpo,
    prioridade,
  })

  return {}
}

// Mesma forma de validação de anexo usada no composer do feed (member
// posts) — replicada aqui porque não é exportada de
// apps/web/src/app/portal/comunidade/actions.ts.
const midiaUrlSchema = z
  .string()
  .max(500)
  .refine(
    (url) => isCloudinaryUrl(url) || isSocialUrl(url) || isStickerPath(url),
    'Tipo de anexo não permitido',
  )

const comunicadoComposerSchema = z.object({
  titulo: z.string().min(1, 'Título é obrigatório').max(150),
  corpo: z.string().min(1, 'Conteúdo é obrigatório').max(4000),
  prioridade: z.enum(['NORMAL', 'IMPORTANTE', 'URGENTE']),
  midias: z.array(midiaUrlSchema).max(10, 'Máximo de 10 anexos').default([]),
})

export type ComunicadoComposerState = {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
  /** Muda a cada publicação — usado no cliente para remontar/limpar o composer. */
  token?: string
}

function parseMidiasComunicado(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/** Publica um comunicado a partir do composer rico (`FeedComposer` modo `comunicado`). */
export async function publicarComunicadoComposer(
  _prev: ComunicadoComposerState,
  formData: FormData,
): Promise<ComunicadoComposerState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH)

  const parsed = comunicadoComposerSchema.safeParse({
    titulo: formData.get('titulo'),
    corpo: formData.get('conteudo'),
    prioridade: formData.get('prioridade'),
    midias: parseMidiasComunicado(formData.get('midias')),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { titulo, corpo, prioridade, midias } = parsed.data

  const criado = await publicarComunicadoENotificar({
    tenantId: tenant.id,
    autorId: session.user.id,
    titulo,
    corpo,
    prioridade,
    midias,
  })

  return { success: true, token: criado.id }
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
  const agora = new Date()

  // Republica no Descobrir: bump de `publicadoEm`/`criadoEm` recoloca o
  // post institucional no topo da janela de candidatos (oficialBoost).
  await db.$transaction([
    db.announcement.update({
      where: { id: comunicadoId },
      data: { titulo, corpo, prioridade, publicadoEm: agora },
    }),
    db.post.updateMany({
      where: { comunicadoOrigemId: comunicadoId, tipo: 'INSTITUCIONAL' },
      data: { criadoEm: agora },
    }),
  ])

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
  revalidatePath('/admin/comunidade/comunicados')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
  return {}
}

/**
 * Atualiza o Announcement e sincroniza o Post institucional vinculado
 * (mídia + republicação no feed). Título/corpo/prioridade já são lidos ao
 * vivo da relação `comunicadoOrigem` pelo embed — a mídia mora no Post.
 * Bump de `publicadoEm`/`criadoEm` faz o comunicado voltar como sugestão
 * prioritária no Descobrir (`scoreDescobrirPost` / `oficialBoost`).
 * Se o Post institucional não existir (comunicados legados/seed), cria um.
 * Único ponto de edição usado pelo composer rico.
 */
async function atualizarComunicadoEPost(opts: {
  tenantId: string
  autorId: string
  comunicadoId: string
  titulo: string
  corpo: string
  prioridade: PrioridadeComunicado
  midias: string[]
}): Promise<void> {
  const agora = new Date()
  const midiaUrls = midiasComEmbedDoTexto(opts.corpo, opts.midias)

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const atualizado = await tx.announcement.update({
      where: { id: opts.comunicadoId },
      data: {
        titulo: opts.titulo,
        corpo: opts.corpo,
        prioridade: opts.prioridade,
        publicadoEm: agora,
      },
      select: { fixado: true },
    })

    const postExistente: { id: string } | null = await tx.post.findFirst({
      where: { comunicadoOrigemId: opts.comunicadoId, tipo: 'INSTITUCIONAL' },
      select: { id: true },
    })

    if (postExistente) {
      await tx.post.update({
        where: { id: postExistente.id },
        data: { midiaUrls, criadoEm: agora },
      })
    } else {
      // Comunicados antigos / seed sem Post institucional — a mídia só vive no Post.
      await tx.post.create({
        data: {
          tenantId: opts.tenantId,
          autorId: opts.autorId,
          titulo: null,
          conteudo: '',
          tipo: 'INSTITUCIONAL',
          visibilidade: 'PUBLICO',
          fixado: atualizado.fixado,
          midiaUrls,
          comunicadoOrigemId: opts.comunicadoId,
          criadoEm: agora,
        },
      })
    }
  })

  await db.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      atorId: opts.autorId,
      acao: 'COMUNICADO_ATUALIZADO',
      entidade: 'Announcement',
      entidadeId: opts.comunicadoId,
    },
  })

  invalidateComunicadosCache(opts.tenantId)
  revalidatePath('/admin/comunidade')
  revalidatePath('/admin/comunidade/comunicados')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
}

/** Salva edição de um comunicado a partir do composer rico (`FeedComposer` modo `comunicado`). */
export async function atualizarComunicadoComposer(
  comunicadoId: string,
  _prev: ComunicadoComposerState,
  formData: FormData,
): Promise<ComunicadoComposerState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH)

  const comunicado = await db.announcement.findFirst({
    where: { id: comunicadoId, tenantId: tenant.id },
    select: { id: true },
  })
  if (!comunicado) return { message: 'Comunicado não encontrado' }

  const parsed = comunicadoComposerSchema.safeParse({
    titulo: formData.get('titulo'),
    corpo: formData.get('conteudo'),
    prioridade: formData.get('prioridade'),
    midias: parseMidiasComunicado(formData.get('midias')),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { titulo, corpo, prioridade, midias } = parsed.data

  await atualizarComunicadoEPost({
    tenantId: tenant.id,
    autorId: session.user.id,
    comunicadoId,
    titulo,
    corpo,
    prioridade,
    midias,
  })

  return { success: true, token: comunicadoId }
}

export async function alternarFixadoComunicado(comunicadoId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH)

  const comunicado = await db.announcement.findFirst({
    where: { id: comunicadoId, tenantId: tenant.id },
  })
  if (!comunicado) throw new Error('Comunicado não encontrado')

  await db.$transaction([
    db.announcement.update({ where: { id: comunicadoId }, data: { fixado: !comunicado.fixado } }),
    db.post.updateMany({
      where: { comunicadoOrigemId: comunicadoId, tipo: 'INSTITUCIONAL' },
      data: { fixado: !comunicado.fixado },
    }),
  ])

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
  revalidatePath('/admin/comunidade/comunicados')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
}

export async function excluirComunicado(comunicadoId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH)

  const comunicado = await db.announcement.findFirst({
    where: { id: comunicadoId, tenantId: tenant.id },
  })
  if (!comunicado) throw new Error('Comunicado não encontrado')

  await db.$transaction([
    db.post.deleteMany({ where: { comunicadoOrigemId: comunicadoId, tipo: 'INSTITUCIONAL' } }),
    db.announcement.delete({ where: { id: comunicadoId } }),
  ])

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
  revalidatePath('/admin/comunidade/comunicados')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
}
