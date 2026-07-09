'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo, assertPermission } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { canFollowUser, getOrCreatePerfilMembro, getSeguimentoStatus } from '@/lib/social'
import { criarNotificacao } from '@/lib/notificacoes'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import { isCloudinaryUrl, isSocialUrl, isStickerPath } from '@/lib/social-embed'

const MAX_MIDIAS = 10

// Cada anexo deve ser mídia do nosso Cloudinary (imagem/vídeo), um link de rede
// social (embed) ou um sticker do app — bloqueia URLs arbitrárias de terceiros.
const midiaUrlSchema = z
  .string()
  .max(500)
  .refine(
    (url) => isCloudinaryUrl(url) || isSocialUrl(url) || isStickerPath(url),
    'Tipo de anexo não permitido',
  )

const postSchema = z.object({
  conteudo: z.string().trim().min(1, 'Conteúdo é obrigatório').max(3000),
  midias: z.array(midiaUrlSchema).max(MAX_MIDIAS, 'Máximo de 10 anexos').default([]),
})

function parseMidias(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

const perfilSchema = z.object({
  bio: z.string().max(280, 'Bio deve ter no máximo 280 caracteres').optional(),
  perfilPrivado: z.boolean(),
})

const comentarioSchema = z.object({
  postId: z.string().min(1),
  conteudo: z.string().trim().min(1, 'Comentário é obrigatório').max(500),
})

const reacaoSchema = z.object({
  postId: z.string().min(1),
  tipo: z.enum(['CURTIR', 'FORCA']),
})

const denunciaSchema = z.object({
  postId: z.string().min(1),
  motivo: z.string().trim().min(5, 'Motivo deve ter ao menos 5 caracteres').max(500),
})

export interface PublicarPostState {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
  /** Muda a cada publicação — usado no cliente para remontar/limpar o composer. */
  token?: string
}

export async function publicarPost(
  _prevState: PublicarPostState,
  formData: FormData,
): Promise<PublicarPostState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = postSchema.safeParse({
    conteudo: formData.get('conteudo'),
    midias: parseMidias(formData.get('midias')),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { conteudo, midias } = parsed.data
  await getOrCreatePerfilMembro(session.user.id, tenant.id)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo,
      midiaUrls: midias,
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_SOCIAL_PUBLICADO',
      entidade: 'Post',
      entidadeId: post.id,
      detalhes: { tipo: 'MEMBRO' },
    },
  })

  revalidatePath('/portal/comunidade')
  return { success: true, token: post.id }
}

export async function solicitarSeguir(userId: string): Promise<void> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')

  await assertMembroAtivo(tenant.id, session.user.id)
  await assertMembroAtivo(tenant.id, userId)

  const podeSeguir = await canFollowUser(session.user.id, userId, tenant.id)
  if (!podeSeguir) throw new Error('Você só pode seguir membros da sua torcida ou torcidas aliadas.')

  const statusAtual = await getSeguimentoStatus(session.user.id, userId)
  if (statusAtual === 'APROVADO' || statusAtual === 'PENDENTE') return

  const perfilSeguido = await db.perfilMembro.findUnique({
    where: { userId_tenantId: { userId, tenantId: tenant.id } },
    select: { perfilPrivado: true },
  })
  const statusInicial = perfilSeguido?.perfilPrivado === false ? 'APROVADO' : 'PENDENTE'

  await db.seguimento.upsert({
    where: { seguidorId_seguidoId: { seguidorId: session.user.id, seguidoId: userId } },
    create: {
      seguidorId: session.user.id,
      seguidoId: userId,
      tenantContextoId: tenant.id,
      status: statusInicial,
    },
    update: { status: statusInicial, tenantContextoId: tenant.id },
  })

  if (statusInicial === 'PENDENTE') {
    await criarNotificacao({
      userId,
      tenantId: tenant.id,
      tipo: 'SEGUIMENTO_PENDENTE',
      titulo: 'Nova solicitação para seguir',
      corpo: `${session.user.name ?? 'Um membro'} quer seguir você.`,
      link: '/portal/comunidade/seguindo',
    })
  }

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${userId}`)
  revalidatePath('/portal/comunidade/seguindo')
}

export async function aprovarSeguimento(seguimentoId: string): Promise<void> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')

  const seguimento = await db.seguimento.findFirst({
    where: { id: seguimentoId, seguidoId: session.user.id, tenantContextoId: tenant.id },
    select: { id: true, seguidorId: true },
  })
  if (!seguimento) throw new Error('Solicitação não encontrada')

  await db.seguimento.update({
    where: { id: seguimento.id },
    data: { status: 'APROVADO' },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${seguimento.seguidorId}`)
  revalidatePath('/portal/comunidade/seguindo')
}

export async function rejeitarSeguimento(seguimentoId: string): Promise<void> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')

  const seguimento = await db.seguimento.findFirst({
    where: { id: seguimentoId, seguidoId: session.user.id, tenantContextoId: tenant.id },
    select: { id: true, seguidorId: true },
  })
  if (!seguimento) throw new Error('Solicitação não encontrada')

  await db.seguimento.update({
    where: { id: seguimento.id },
    data: { status: 'REJEITADO' },
  })

  revalidatePath('/portal/comunidade/seguindo')
  revalidatePath(`/portal/comunidade/perfil/${seguimento.seguidorId}`)
}

export async function atualizarPerfil(bio: string, perfilPrivado: boolean): Promise<void> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')

  await assertMembroAtivo(tenant.id, session.user.id)
  const parsed = perfilSchema.safeParse({ bio, perfilPrivado })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Perfil inválido')

  await db.perfilMembro.upsert({
    where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
    create: {
      userId: session.user.id,
      tenantId: tenant.id,
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado: parsed.data.perfilPrivado,
    },
    update: {
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado: parsed.data.perfilPrivado,
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
}

async function listarModeradoresIds(tenantId: string): Promise<string[]> {
  const rows: { userId: string }[] = await db.userRole.findMany({
    where: {
      tenantId,
      role: { permissions: { has: PERMISSIONS.COMMUNITY_MODERATE } },
    },
    select: { userId: true },
  })
  return [...new Set(rows.map((row) => row.userId))]
}

export async function comentarPost(postId: string, conteudo: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = comentarioSchema.safeParse({ postId, conteudo })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Comentário inválido')

  const limiterKey = `comment:${tenant.id}:${session.user.id}`
  if (excedeuLimiteEngajamento(limiterKey)) {
    throw new Error('Você está comentando rápido demais. Aguarde um pouco.')
  }
  registrarAcaoEngajamento(limiterKey)

  const post = await db.post.findFirst({
    where: { id: parsed.data.postId, tenantId: tenant.id, oculto: false },
    select: { id: true, autorId: true, titulo: true },
  })
  if (!post) throw new Error('Post não encontrado')

  const comentario = await db.comentario.create({
    data: { postId: post.id, autorId: session.user.id, conteudo: parsed.data.conteudo },
  })

  if (post.autorId !== session.user.id) {
    await criarNotificacao({
      userId: post.autorId,
      tenantId: tenant.id,
      tipo: 'NOVO_COMENTARIO',
      titulo: 'Novo comentário no seu post',
      corpo: parsed.data.conteudo.slice(0, 140),
      link: '/portal/comunidade',
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_COMENTARIO_CRIADO',
      entidade: 'Comentario',
      entidadeId: comentario.id,
      detalhes: { postId: post.id },
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
}

export async function reagirPost(postId: string, tipo: 'CURTIR' | 'FORCA'): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = reacaoSchema.safeParse({ postId, tipo })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Reação inválida')

  const limiterKey = `reaction:${tenant.id}:${session.user.id}`
  if (excedeuLimiteEngajamento(limiterKey)) {
    throw new Error('Você está reagindo rápido demais. Aguarde um pouco.')
  }
  registrarAcaoEngajamento(limiterKey)

  const post = await db.post.findFirst({
    where: { id: parsed.data.postId, tenantId: tenant.id, oculto: false },
    select: { id: true, autorId: true, titulo: true },
  })
  if (!post) throw new Error('Post não encontrado')

  const existente = await db.reacao.findUnique({
    where: { postId_userId: { postId: post.id, userId: session.user.id } },
    select: { id: true, tipo: true },
  })

  if (existente?.tipo === parsed.data.tipo) {
    await db.reacao.delete({ where: { id: existente.id } })
  } else if (existente) {
    await db.reacao.update({ where: { id: existente.id }, data: { tipo: parsed.data.tipo } })
  } else {
    await db.reacao.create({
      data: { postId: post.id, userId: session.user.id, tipo: parsed.data.tipo },
    })
  }

  if (post.autorId !== session.user.id) {
    await criarNotificacao({
      userId: post.autorId,
      tenantId: tenant.id,
      tipo: 'NOVA_REACAO',
      titulo: 'Nova reação no seu post',
      corpo: parsed.data.tipo === 'FORCA' ? 'Recebeu uma reação de Força.' : 'Recebeu uma curtida.',
      link: '/portal/comunidade',
    })
  }

  revalidatePath('/portal/comunidade')
  revalidatePath('/portal')
}

export async function denunciarPost(postId: string, motivo: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = denunciaSchema.safeParse({ postId, motivo })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Denúncia inválida')

  const limiterKey = `report:${tenant.id}:${session.user.id}`
  if (excedeuLimiteEngajamento(limiterKey)) {
    throw new Error('Você atingiu o limite de denúncias por minuto.')
  }
  registrarAcaoEngajamento(limiterKey)

  const post = await db.post.findFirst({
    where: { id: parsed.data.postId, tenantId: tenant.id },
    select: { id: true, autorId: true },
  })
  if (!post) throw new Error('Post não encontrado')

  const denuncia = await db.denuncia.create({
    data: {
      tenantId: tenant.id,
      postId: post.id,
      denuncianteId: session.user.id,
      motivo: parsed.data.motivo,
    },
  })

  const moderadores = (await listarModeradoresIds(tenant.id)).filter((id) => id !== session.user.id)
  if (moderadores.length > 0) {
    await db.$transaction(
      moderadores.map((moderadorId) =>
        db.notificacao.create({
          data: {
            userId: moderadorId,
            tenantId: tenant.id,
            tipo: 'DENUNCIA_NOVA',
            titulo: 'Nova denúncia pendente',
            corpo: parsed.data.motivo.slice(0, 140),
            link: '/admin/comunidade/moderacao',
          },
        }),
      ),
    )
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_DENUNCIADO',
      entidade: 'Denuncia',
      entidadeId: denuncia.id,
      detalhes: { postId: post.id },
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath('/admin/comunidade/moderacao')
}

export async function marcarNotificacaoLida(notificacaoId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)

  await db.notificacao.updateMany({
    where: { id: notificacaoId, tenantId: tenant.id, userId: session.user.id },
    data: { lida: true },
  })

  revalidatePath('/portal')
  revalidatePath('/portal/comunidade')
}
