'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo, assertPermission } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { marcarComunicadosLidos } from '@/lib/comunidade'
import { db } from '@torcida/db'
import { PERMISSIONS, atualizarPerfilSocialSchema, editarPostSchema, visibilidadePostSchema, reacaoTipoSchema, publicarEnqueteSchema, votarEnqueteSchema, repostarSchema, repostarComunicadoSchema, publicarPostEventoSchema, criarGrupoPublicoSchema, criarDestaqueSchema, publicarPostGrupoSchema, publicarMomentoStorySchema, MAX_MENCOES_POR_CONTEUDO } from '@torcida/types'
import { notificarMencoesDoPost, sincronizarHashtagsDoPost } from '@/lib/comunidade-publish'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { extrairMencoes } from '@/lib/comunidade-social'
import { canFollowUser, getOrCreatePerfilMembro, getSeguimentoStatus } from '@/lib/social'
import { criarNotificacao } from '@/lib/notificacoes'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import { getVisibleTenantIds } from '@/lib/hierarquia'
import { getEscopoEventosVisiveis } from '@/lib/eventos'
import { getPostPorId } from '@/lib/feed'
import { calcularExpiraStory } from '@/lib/stories'
import { TIPOS_NOTIFICACAO_SOCIAL } from '@/lib/notificacoes-comunidade'
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
  visibilidade: visibilidadePostSchema.default('PUBLICO'),
})

function parseMidias(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function erroMencoesExcessivas(conteudo: string): string | null {
  if (extrairMencoes(conteudo).length > MAX_MENCOES_POR_CONTEUDO) {
    return `Máximo de ${MAX_MENCOES_POR_CONTEUDO} menções por publicação.`
  }
  return null
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
  tipo: reacaoTipoSchema,
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
    visibilidade: formData.get('visibilidade') ?? 'PUBLICO',
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { conteudo, midias, visibilidade } = parsed.data
  const erroMencoes = erroMencoesExcessivas(conteudo)
  if (erroMencoes) return { message: erroMencoes }

  await getOrCreatePerfilMembro(session.user.id, tenant.id)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo,
      midiaUrls: midias,
      tipo: 'MEMBRO',
      visibilidade,
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

  await Promise.all([
    sincronizarHashtagsDoPost(post.id, tenant.id, conteudo),
    notificarMencoesDoPost({
      conteudo,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      tenantId: tenant.id,
      postId: post.id,
      link: linkPostComunidade(post.id),
    }),
  ])

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

  await criarNotificacao({
    userId: seguimento.seguidorId,
    tenantId: tenant.id,
    tipo: 'SEGUIMENTO_APROVADO',
    titulo: 'Solicitação aprovada',
    corpo: `${session.user.name ?? 'Um membro'} aceitou você.`,
    link: `/portal/comunidade/perfil/${session.user.id}`,
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

export async function deixarDeSeguir(userId: string): Promise<void> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')

  await assertMembroAtivo(tenant.id, session.user.id)

  await db.seguimento.deleteMany({
    where: {
      seguidorId: session.user.id,
      seguidoId: userId,
      status: 'APROVADO',
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${userId}`)
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
}

export interface AtualizarPerfilSocialInput {
  bio: string
  perfilPrivado: boolean
  exibirCidade: boolean
  exibirSede: boolean
  exibirDesde: boolean
  bannerUrl: string | null
  avatarUrl: string | null
}

export async function atualizarPerfilSocial(input: AtualizarPerfilSocialInput): Promise<void> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')

  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = atualizarPerfilSocialSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Perfil inválido')

  if (parsed.data.bannerUrl && !isCloudinaryUrl(parsed.data.bannerUrl)) {
    throw new Error('Banner inválido')
  }
  if (parsed.data.avatarUrl && !isCloudinaryUrl(parsed.data.avatarUrl)) {
    throw new Error('Avatar inválido')
  }

  await db.perfilMembro.upsert({
    where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
    create: {
      userId: session.user.id,
      tenantId: tenant.id,
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado: parsed.data.perfilPrivado,
      exibirCidade: parsed.data.exibirCidade,
      exibirSede: parsed.data.exibirSede,
      exibirDesde: parsed.data.exibirDesde,
      bannerUrl: parsed.data.bannerUrl ?? null,
      avatarUrl: parsed.data.avatarUrl ?? null,
    },
    update: {
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado: parsed.data.perfilPrivado,
      exibirCidade: parsed.data.exibirCidade,
      exibirSede: parsed.data.exibirSede,
      exibirDesde: parsed.data.exibirDesde,
      bannerUrl: parsed.data.bannerUrl ?? null,
      avatarUrl: parsed.data.avatarUrl ?? null,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PERFIL_SOCIAL_ATUALIZADO',
      entidade: 'PerfilMembro',
      entidadeId: session.user.id,
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
}

/** @deprecated Use atualizarPerfilSocial */
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

export async function editarPost(postId: string, conteudo: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = editarPostSchema.safeParse({ postId, conteudo })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Post inválido')

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) throw new Error(erroMencoes)

  const post = await db.post.findFirst({
    where: { id: parsed.data.postId, autorId: session.user.id, tenantId: tenant.id, oculto: false },
    select: { id: true },
  })
  if (!post) throw new Error('Post não encontrado')

  await db.post.update({
    where: { id: post.id },
    data: { conteudo: parsed.data.conteudo },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_SOCIAL_EDITADO',
      entidade: 'Post',
      entidadeId: post.id,
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
}

export async function excluirPost(postId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const post = await db.post.findFirst({
    where: { id: postId, autorId: session.user.id, tenantId: tenant.id },
    select: { id: true },
  })
  if (!post) throw new Error('Post não encontrado')

  await db.post.update({
    where: { id: post.id },
    data: { oculto: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_SOCIAL_EXCLUIDO',
      entidade: 'Post',
      entidadeId: post.id,
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

export interface ComentarioPostItem {
  id: string
  conteudo: string
  criadoEm: string
  autor: { id: string; nome: string | null; avatarUrl: string | null }
}

export async function listarComentariosPost(postId: string): Promise<ComentarioPostItem[]> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const visibleIds = await getVisibleTenantIds(tenant.id, 'comunidade')
  const post: { id: string } | null = await db.post.findFirst({
    where: { id: postId, tenantId: { in: visibleIds }, oculto: false },
    select: { id: true },
  })
  if (!post) throw new Error('Post não encontrado')

  const rows: Array<{
    id: string
    conteudo: string
    criadoEm: Date
    autor: { id: string; nome: string | null; avatarUrl: string | null }
  }> = await db.comentario.findMany({
    where: { postId },
    orderBy: { criadoEm: 'asc' },
    take: 100,
    include: { autor: { select: { id: true, nome: true, avatarUrl: true } } },
  })

  return rows.map((c) => ({
    id: c.id,
    conteudo: c.conteudo,
    criadoEm: c.criadoEm.toISOString(),
    autor: c.autor,
  }))
}

export async function comentarPost(
  postId: string,
  conteudo: string,
): Promise<ComentarioPostItem> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = comentarioSchema.safeParse({ postId, conteudo })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Comentário inválido')

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) throw new Error(erroMencoes)

  const limiterKey = `comment:${tenant.id}:${session.user.id}`
  if (excedeuLimiteEngajamento(limiterKey)) {
    throw new Error('Você está comentando rápido demais. Aguarde um pouco.')
  }
  registrarAcaoEngajamento(limiterKey)

  const visibleIds = await getVisibleTenantIds(tenant.id, 'comunidade')
  const post = await db.post.findFirst({
    where: { id: parsed.data.postId, tenantId: { in: visibleIds }, oculto: false },
    select: { id: true, autorId: true, titulo: true, tenantId: true },
  })
  if (!post) throw new Error('Post não encontrado')

  const comentario = await db.comentario.create({
    data: { postId: post.id, autorId: session.user.id, conteudo: parsed.data.conteudo },
    include: { autor: { select: { id: true, nome: true, avatarUrl: true } } },
  })

  if (post.autorId !== session.user.id) {
    await criarNotificacao({
      userId: post.autorId,
      tenantId: tenant.id,
      tipo: 'NOVO_COMENTARIO',
      titulo: 'Novo comentário no seu post',
      corpo: parsed.data.conteudo.slice(0, 140),
      link: linkPostComunidade(post.id),
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

  await notificarMencoesDoPost({
    conteudo: parsed.data.conteudo,
    autorId: session.user.id,
    autorNome: session.user.name ?? null,
    tenantId: tenant.id,
    postId: post.id,
    link: linkPostComunidade(post.id),
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/post/${post.id}`)

  return {
    id: comentario.id,
    conteudo: comentario.conteudo,
    criadoEm: comentario.criadoEm.toISOString(),
    autor: comentario.autor,
  }
}

export async function publicarEnquete(
  _prevState: PublicarPostState,
  formData: FormData,
): Promise<PublicarPostState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  let opcoesRaw: unknown = []
  try {
    opcoesRaw = JSON.parse(String(formData.get('opcoes') ?? '[]'))
  } catch {
    return { message: 'Opções de enquete inválidas.' }
  }

  const parsed = publicarEnqueteSchema.safeParse({
    conteudo: formData.get('conteudo'),
    opcoes: opcoesRaw,
    visibilidade: formData.get('visibilidade') ?? 'PUBLICO',
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) return { message: erroMencoes }

  await getOrCreatePerfilMembro(session.user.id, tenant.id)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: parsed.data.conteudo,
      tipo: 'MEMBRO',
      visibilidade: parsed.data.visibilidade,
      enquete: {
        create: {
          opcoes: {
            create: parsed.data.opcoes.map((texto, ordem) => ({ texto, ordem })),
          },
        },
      },
    },
  })

  await Promise.all([
    sincronizarHashtagsDoPost(post.id, tenant.id, parsed.data.conteudo),
    notificarMencoesDoPost({
      conteudo: parsed.data.conteudo,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      tenantId: tenant.id,
      postId: post.id,
      link: linkPostComunidade(post.id),
    }),
  ])

  revalidatePath('/portal/comunidade')
  return { success: true, token: post.id }
}

export async function votarEnquetePost(enqueteId: string, opcaoId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = votarEnqueteSchema.safeParse({ enqueteId, opcaoId })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Voto inválido')

  const enquete: { id: string; encerradaEm: Date | null; post: { tenantId: string; oculto: boolean } } | null =
    await db.enquetePost.findFirst({
      where: { id: parsed.data.enqueteId },
      select: {
        id: true,
        encerradaEm: true,
        post: { select: { tenantId: true, oculto: true } },
      },
    })
  if (!enquete || enquete.post.oculto || enquete.encerradaEm) {
    throw new Error('Enquete indisponível')
  }

  const visibleIds = await getVisibleTenantIds(tenant.id, 'comunidade')
  if (!visibleIds.includes(enquete.post.tenantId)) throw new Error('Enquete não encontrada')

  const opcao: { id: string } | null = await db.opcaoEnquetePost.findFirst({
    where: { id: parsed.data.opcaoId, enqueteId: enquete.id },
    select: { id: true },
  })
  if (!opcao) throw new Error('Opção inválida')

  await db.votoEnquetePost.upsert({
    where: { enqueteId_userId: { enqueteId: enquete.id, userId: session.user.id } },
    create: { enqueteId: enquete.id, opcaoId: opcao.id, userId: session.user.id },
    update: { opcaoId: opcao.id },
  })

  revalidatePath('/portal/comunidade')
}

export async function encerrarEnquetePost(enqueteId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const enquete: {
    id: string
    encerradaEm: Date | null
    post: { autorId: string; tenantId: string; oculto: boolean }
  } | null = await db.enquetePost.findFirst({
    where: { id: enqueteId },
    select: {
      id: true,
      encerradaEm: true,
      post: { select: { autorId: true, tenantId: true, oculto: true } },
    },
  })
  if (!enquete || enquete.post.oculto || enquete.encerradaEm) {
    throw new Error('Enquete indisponível')
  }
  if (enquete.post.autorId !== session.user.id) {
    throw new Error('Só o autor pode encerrar a enquete')
  }

  await db.enquetePost.update({
    where: { id: enquete.id },
    data: { encerradaEm: new Date() },
  })

  revalidatePath('/portal/comunidade')
}

export async function fixarPostPerfil(postId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const post: { id: string; fixado: boolean } | null = await db.post.findFirst({
    where: {
      id: postId,
      autorId: session.user.id,
      tenantId: tenant.id,
      tipo: 'MEMBRO',
      oculto: false,
    },
    select: { id: true, fixado: true },
  })
  if (!post) throw new Error('Post não encontrado')

  if (!post.fixado) {
    const fixados = await db.post.count({
      where: {
        autorId: session.user.id,
        tenantId: tenant.id,
        tipo: 'MEMBRO',
        oculto: false,
        fixado: true,
      },
    })
    if (fixados >= 3) throw new Error('Máximo de 3 posts fixados no perfil')
  }

  await db.post.update({
    where: { id: post.id },
    data: { fixado: !post.fixado },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: post.fixado ? 'POST_DESAFIXADO_PERFIL' : 'POST_FIXADO_PERFIL',
      entidade: 'Post',
      entidadeId: post.id,
      detalhes: {},
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
  revalidatePath(linkPostComunidade(post.id))
}

export async function salvarPost(postId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const post = await getPostPorId(postId, tenant.id, session.user.id)
  if (!post) throw new Error('Post não encontrado')

  await db.postSalvo.upsert({
    where: { userId_postId: { userId: session.user.id, postId } },
    create: { userId: session.user.id, postId, tenantId: tenant.id },
    update: {},
  })

  revalidatePath('/portal/comunidade/salvos')
}

export async function removerPostSalvo(postId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  await db.postSalvo.deleteMany({
    where: { userId: session.user.id, postId, tenantId: tenant.id },
  })

  revalidatePath('/portal/comunidade/salvos')
}

export async function repostarPost(postId: string, comentario?: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = repostarSchema.safeParse({ postId, comentario })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Repost inválido')

  const visibleIds = await getVisibleTenantIds(tenant.id, 'comunidade')
  const original: { id: string; autorId: string; oculto: boolean; visibilidade: string } | null =
    await db.post.findFirst({
      where: { id: parsed.data.postId, tenantId: { in: visibleIds }, oculto: false },
      select: { id: true, autorId: true, oculto: true, visibilidade: true },
    })
  if (!original) throw new Error('Post não encontrado')

  const texto = parsed.data.comentario?.trim() || '🔁 Compartilhou uma publicação'
  const repost = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: texto,
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
      postOrigemId: original.id,
    },
  })

  if (original.autorId !== session.user.id) {
    await criarNotificacao({
      userId: original.autorId,
      tenantId: tenant.id,
      tipo: 'REPOST',
      titulo: 'Sua publicação foi compartilhada',
      corpo: `${session.user.name ?? 'Um membro'} compartilhou seu post.`,
      link: linkPostComunidade(original.id),
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_REPOSTADO',
      entidade: 'Post',
      entidadeId: repost.id,
      detalhes: { postOrigemId: original.id },
    },
  })

  revalidatePath('/portal/comunidade')
}

export async function repostarComunicado(comunicadoId: string, comentario?: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = repostarComunicadoSchema.safeParse({ comunicadoId, comentario })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Repost inválido')

  const visibleIds = await getVisibleTenantIds(tenant.id, 'comunidade')
  const comunicado: { id: string; autorId: string } | null = await db.announcement.findFirst({
    where: { id: parsed.data.comunicadoId, tenantId: { in: visibleIds } },
    select: { id: true, autorId: true },
  })
  if (!comunicado) throw new Error('Comunicado não encontrado')

  await getOrCreatePerfilMembro(session.user.id, tenant.id)

  const texto = parsed.data.comentario?.trim() || '📢 Compartilhou um comunicado oficial'
  const repost = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: texto,
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
      comunicadoOrigemId: comunicado.id,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COMUNICADO_REPOSTADO',
      entidade: 'Post',
      entidadeId: repost.id,
      detalhes: { comunicadoOrigemId: comunicado.id },
    },
  })

  revalidatePath('/portal/comunidade')
}

export async function publicarPostEvento(
  _prevState: PublicarPostState,
  formData: FormData,
): Promise<PublicarPostState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = publicarPostEventoSchema.safeParse({
    conteudo: formData.get('conteudo'),
    eventoId: formData.get('eventoId'),
    visibilidade: formData.get('visibilidade') ?? 'PUBLICO',
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const escopo = await getEscopoEventosVisiveis(tenant.id, session.user.id)
  const evento: { id: string } | null = await db.evento.findFirst({
    where: { id: parsed.data.eventoId, ...escopo },
    select: { id: true },
  })
  if (!evento) return { message: 'Evento não encontrado ou indisponível.' }

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) return { message: erroMencoes }

  await getOrCreatePerfilMembro(session.user.id, tenant.id)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: parsed.data.conteudo,
      tipo: 'MEMBRO',
      visibilidade: parsed.data.visibilidade,
      eventoId: evento.id,
    },
  })

  await Promise.all([
    sincronizarHashtagsDoPost(post.id, tenant.id, parsed.data.conteudo),
    notificarMencoesDoPost({
      conteudo: parsed.data.conteudo,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      tenantId: tenant.id,
      postId: post.id,
      link: linkPostComunidade(post.id),
    }),
  ])

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_EVENTO_PUBLICADO',
      entidade: 'Post',
      entidadeId: post.id,
      detalhes: { eventoId: evento.id },
    },
  })

  revalidatePath('/portal/comunidade')
  return { success: true, token: post.id }
}

export async function criarGrupoPublico(nome: string, descricao?: string): Promise<{ id: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.GROUPS_CREATE)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = criarGrupoPublicoSchema.safeParse({ nome, descricao })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Grupo inválido')

  const conversa: { id: string } = await db.conversa.create({
    data: {
      tipo: 'GRUPO',
      tenantId: tenant.id,
      nome: parsed.data.nome,
      descricao: parsed.data.descricao?.trim() || null,
      publica: true,
      criadoPorId: session.user.id,
      membros: {
        create: { userId: session.user.id, papel: 'ADMIN' },
      },
    },
    select: { id: true },
  })

  revalidatePath('/portal/comunidade/grupos')
  return conversa
}

export async function entrarGrupoPublico(conversaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const conversa: { id: string; publica: boolean; tipo: string } | null = await db.conversa.findFirst({
    where: { id: conversaId, tenantId: tenant.id, tipo: 'GRUPO', publica: true },
    select: { id: true, publica: true, tipo: true },
  })
  if (!conversa) throw new Error('Grupo não encontrado')

  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId, userId: session.user.id } },
    create: { conversaId, userId: session.user.id, papel: 'MEMBRO' },
    update: { saiuEm: null },
  })

  revalidatePath('/portal/comunidade/grupos')
  revalidatePath('/portal/mensagens')
}

export async function publicarPostGrupo(
  conversaId: string,
  conteudo: string,
): Promise<{ success: boolean; message?: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = publicarPostGrupoSchema.safeParse({ conversaId, conteudo })
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const membro: { id: string } | null = await db.membroConversa.findFirst({
    where: { conversaId: parsed.data.conversaId, userId: session.user.id, saiuEm: null },
    select: { id: true },
  })
  if (!membro) return { success: false, message: 'Você precisa ser membro do grupo.' }

  const conversa: { id: string; tipo: string } | null = await db.conversa.findFirst({
    where: { id: parsed.data.conversaId, tenantId: tenant.id, tipo: 'GRUPO' },
    select: { id: true, tipo: true },
  })
  if (!conversa) return { success: false, message: 'Grupo não encontrado.' }

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) return { success: false, message: erroMencoes }

  await getOrCreatePerfilMembro(session.user.id, tenant.id)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: parsed.data.conteudo,
      tipo: 'MEMBRO',
      visibilidade: 'TENANT',
      conversaId: conversa.id,
    },
  })

  await Promise.all([
    sincronizarHashtagsDoPost(post.id, tenant.id, parsed.data.conteudo),
    notificarMencoesDoPost({
      conteudo: parsed.data.conteudo,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      tenantId: tenant.id,
      postId: post.id,
      link: `/portal/comunidade/grupos/${conversa.id}`,
    }),
  ])

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_GRUPO_PUBLICADO',
      entidade: 'Post',
      entidadeId: post.id,
      detalhes: { conversaId: conversa.id },
    },
  })

  revalidatePath(`/portal/comunidade/grupos/${conversa.id}`)
  return { success: true }
}

export async function publicarMomentoStory(
  midiaUrl: string,
  conteudo?: string,
): Promise<{ success: boolean; message?: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = publicarMomentoStorySchema.safeParse({ midiaUrl, conteudo })
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }
  if (!isCloudinaryUrl(parsed.data.midiaUrl)) {
    return { success: false, message: 'Mídia inválida.' }
  }

  const criadoEm = new Date()
  const story: { id: string } = await db.momentoStory.create({
    data: {
      tenantId: tenant.id,
      userId: session.user.id,
      midiaUrl: parsed.data.midiaUrl,
      conteudo: parsed.data.conteudo?.trim() || null,
      expiraEm: calcularExpiraStory(criadoEm),
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MOMENTO_STORY_PUBLICADO',
      entidade: 'MomentoStory',
      entidadeId: story.id,
    },
  })

  revalidatePath('/portal/comunidade')
  return { success: true }
}

export async function criarDestaquePerfil(titulo: string, postIds: string[]): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = criarDestaqueSchema.safeParse({ titulo, postIds })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Destaque inválido')

  const posts: Array<{ id: string }> = await db.post.findMany({
    where: {
      id: { in: parsed.data.postIds },
      autorId: session.user.id,
      tenantId: tenant.id,
      oculto: false,
    },
    select: { id: true },
  })
  if (posts.length === 0) throw new Error('Nenhum post válido para o destaque')

  const count = await db.perfilDestaque.count({
    where: { userId: session.user.id, tenantId: tenant.id },
  })

  const destaque: { id: string } = await db.perfilDestaque.create({
    data: {
      userId: session.user.id,
      tenantId: tenant.id,
      titulo: parsed.data.titulo,
      ordem: count,
      itens: {
        create: posts.map((p, ordem) => ({ postId: p.id, ordem })),
      },
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PERFIL_DESTAQUE_CRIADO',
      entidade: 'PerfilDestaque',
      entidadeId: destaque.id,
    },
  })

  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
}

export async function reagirPost(postId: string, tipo: 'CURTIR' | 'FORCA' | 'VAMOS' | 'PRESENTE'): Promise<void> {
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
      corpo:
        parsed.data.tipo === 'FORCA'
          ? 'Recebeu uma reação de Força.'
          : parsed.data.tipo === 'VAMOS'
            ? 'Recebeu um Vamos!'
            : parsed.data.tipo === 'PRESENTE'
              ? 'Marcou presença no seu post.'
              : 'Recebeu uma curtida.',
      link: linkPostComunidade(post.id),
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
  revalidatePath('/portal/comunidade/notificacoes')
}

export async function marcarTodasNotificacoesLidas(): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)

  await db.notificacao.updateMany({
    where: {
      tenantId: tenant.id,
      userId: session.user.id,
      lida: false,
      tipo: { in: TIPOS_NOTIFICACAO_SOCIAL },
    },
    data: { lida: true },
  })

  revalidatePath('/portal')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/comunidade/notificacoes')
}

/** Marca comunicados como lidos após a UI renderizar (evita write-on-read no SSR). */
export async function marcarComunicadosLidosAction(announcementIds: string[]): Promise<void> {
  const session = await auth()
  if (!session?.user?.id || announcementIds.length === 0) return
  try {
    await marcarComunicadosLidos(announcementIds, session.user.id)
  } catch {
    // silencioso — não bloqueia a experiência do feed
  }
}
