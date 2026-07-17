'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'
import { invalidarCachesComunidadeFeed } from '@/lib/comunidade-cache'
import { assertAutorPublicacaoPost, assertMembroAtivo, assertPermission, assertPodePublicarNoFeed } from '@/lib/authz'
import { getActiveTenant, getUserPermissionsInTenant } from '@/lib/tenant'
import { marcarComunicadosLidos } from '@/lib/comunidade'
import { db } from '@torcida/db'
import { PERMISSIONS, editarPostSchema, visibilidadePostSchema, reacaoTipoSchema, publicarEnqueteSchema, votarEnqueteSchema, repostarSchema, repostarComunicadoSchema, publicarPostEventoSchema, criarGrupoPublicoSchema, criarDestaqueSchema, publicarPostGrupoSchema, publicarMomentoStorySchema, publicarPostCanalSchema, criarCanalTematicoSchema, MAX_MENCOES_POR_CONTEUDO, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { notificarMencoesDoPost, sincronizarHashtagsDoPost } from '@/lib/comunidade-publish'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { extrairMencoes } from '@/lib/comunidade-social'
import { canFollowUser, getOrCreatePerfilMembro, getSeguimentoStatus } from '@/lib/social'
import { resolverPerfilPrivadoEfetivo } from '@/lib/perfil-social'
import { criarNotificacao, notificarSafe } from '@/lib/notificacoes'
import { notificarDenunciaPost } from '@/lib/notificacoes-routing'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import type { PostPublicadoPreview } from '@/lib/feed-live-refresh'
import { getOrCreateComunidadeNacionalTenant } from '@/lib/comunidade-contexto'
import { getVisibleTenantIds } from '@/lib/hierarquia'
import { getEscopoEventosVisiveis } from '@/lib/eventos'
import { getPostPorId, podeVerFeedSocios, resolveVisibleTenantIdsForFeed } from '@/lib/feed'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { calcularExpiraStory } from '@/lib/stories'
import {
  getCanalPorId,
  inscreverCanal,
  podePublicarNoCanal,
  linkCanalComunidade,
  linkUnidadeComunidade,
} from '@/lib/canais'
import { TIPOS_NOTIFICACAO_SOCIAL } from '@/lib/notificacoes-comunidade'
import { isCloudinaryUrl, isSocialUrl, isStickerPath } from '@/lib/social-embed'
import {
  backfillTimelineDoAutorParaViewer,
  materializarTimelineAutor,
  removerTimelineDoAutorParaViewer,
} from '@/lib/feed-timeline'
import { scheduleFanoutPostParaRede } from '@/lib/feed-timeline-queue'

const MAX_MIDIAS = 10

function invalidarLeituraComunidade(tenantId: string): void {
  invalidarCachesComunidadeFeed(tenantId)
}

/**
 * Trabalho pós-resposta: hashtags, menções, audit e perfil.
 * Mantém o caminho crítico = auth + create + timeline do autor.
 */
function agendarPosPublicacaoFeed(opts: {
  postId: string
  tenantId: string
  autorId: string
  autorNome: string | null
  conteudo: string
  ensurePerfil?: boolean
  audit?: { acao: string; detalhes?: Record<string, unknown> }
}): void {
  after(() => {
    void (async () => {
      try {
        const tasks: Array<Promise<unknown>> = [
          sincronizarHashtagsDoPost(opts.postId, opts.tenantId, opts.conteudo),
          notificarMencoesDoPost({
            conteudo: opts.conteudo,
            autorId: opts.autorId,
            autorNome: opts.autorNome,
            tenantId: opts.tenantId,
            postId: opts.postId,
            link: linkPostComunidade(opts.postId),
          }),
        ]
        if (opts.ensurePerfil) {
          tasks.push(getOrCreatePerfilMembro(opts.autorId, opts.tenantId))
        }
        if (opts.audit) {
          tasks.push(
            db.auditLog.create({
              data: {
                tenantId: opts.tenantId,
                atorId: opts.autorId,
                acao: opts.audit.acao,
                entidade: 'Post',
                entidadeId: opts.postId,
                detalhes: opts.audit.detalhes ?? {},
              },
            }),
          )
        }
        await Promise.all(tasks)
      } catch (err) {
        console.error('[pos-publicacao]', opts.postId, err)
      }
    })()
  })
}

function previewDoPost(opts: {
  post: { id: string; tenantId: string; conteudo: string; midiaUrls: string[]; visibilidade: string; criadoEm: Date }
  autorId: string
  autorNome: string | null
  autorAvatar: string | null
  tenantNome: string
}): PostPublicadoPreview {
  return {
    id: opts.post.id,
    tenantId: opts.post.tenantId,
    conteudo: opts.post.conteudo,
    midiaUrls: opts.post.midiaUrls,
    visibilidade: opts.post.visibilidade as PostPublicadoPreview['visibilidade'],
    criadoEm: opts.post.criadoEm.toISOString(),
    autor: {
      id: opts.autorId,
      nome: opts.autorNome,
      avatarUrl: opts.autorAvatar,
    },
    tenantNome: opts.tenantNome,
  }
}

/**
 * Contexto de engajamento (reação/comentário): sócio APROVADO com tenant ativo
 * OU torcedor global da Comunidade Nacional. O feed lista posts do tenant
 * sintético do clube — o lookup de engajamento precisa cobrir o mesmo conjunto
 * (produção quebrava com 500: assertPermission sem tenant, ou post CN fora de
 * getVisibleTenantIds).
 */
async function resolverContextoEngajamento(): Promise<{
  session: Session
  viewerId: string
  /** Tenant do viewer (sócio) ou null (torcedor global / CN). */
  tenantId: string | null
  /** Clube do viewer — rate-limit e escopo de posts engajáveis na CN. */
  afiliacaoId: string | null
}> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const viewerId = session.user.id
  const tenant = await getActiveTenant(viewerId, session.user.email)

  if (tenant && !tenant.sintetico) {
    const membro: { status: string; tipo: string } | null = await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: viewerId } },
      select: { status: true, tipo: true },
    })

    if (membro?.status === 'APROVADO') {
      if (isSuperAdminEmail(session.user.email)) {
        return {
          session,
          viewerId,
          tenantId: tenant.id,
          afiliacaoId: tenant.afiliacaoId,
        }
      }

      // Uma leitura de membro já feita — valida carteirinha + permissão em paralelo
      // (evita o 2º find de assertMembroAtivo no hot path de reação/comentário).
      const permPromise = getUserPermissionsInTenant(viewerId, tenant.id)
      const carteirinhaPromise =
        membro.tipo === 'SOCIO'
          ? db.saasSocio.findUnique({
              where: { tenantId_userId: { tenantId: tenant.id, userId: viewerId } },
              select: { validade: true },
            })
          : Promise.resolve(null)

      const [{ rolePermissions, overrides }, socio] = await Promise.all([
        permPromise,
        carteirinhaPromise,
      ])
      if (socio && socio.validade < new Date()) {
        throw new Error('Sua carteirinha está vencida. Regularize para continuar.')
      }
      const effective = calculateEffectivePermissions(rolePermissions, overrides)
      if (!hasPermission(effective, PERMISSIONS.COMMUNITY_POST)) {
        throw new Error('Sem permissão')
      }
      return {
        session,
        viewerId,
        tenantId: tenant.id,
        afiliacaoId: tenant.afiliacaoId,
      }
    }

    // Cookie/preview de torcida sem vínculo APROVADO — engaja como CN do clube.
    if (tenant.afiliacaoId) {
      return {
        session,
        viewerId,
        tenantId: null,
        afiliacaoId: tenant.afiliacaoId,
      }
    }
  }

  const perfil: {
    onboardingConcluidoEm: Date | null
    afiliacaoId: string | null
  } | null = await db.perfilTorcedor.findUnique({
    where: { userId: viewerId },
    select: { onboardingConcluidoEm: true, afiliacaoId: true },
  })
  if (!perfil?.onboardingConcluidoEm || !perfil.afiliacaoId) {
    throw new Error('Não autorizado')
  }

  return {
    session,
    viewerId,
    tenantId: null,
    afiliacaoId: perfil.afiliacaoId,
  }
}

type PostEngajavelLite = {
  id: string
  autorId: string
  tenantId: string
  oculto: boolean
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
  tenant: { afiliacaoId: string | null; sintetico: boolean }
}

/**
 * Gate alinhado ao feed: fast-path no próprio tenant / mesmo clube (CN
 * sintético ou PUBLICO); só resolve hierarquia/alianças no fallback.
 */
async function podeEngajarPostVisivel(
  ctx: { viewerId: string; tenantId: string | null; afiliacaoId: string | null },
  post: PostEngajavelLite,
): Promise<boolean> {
  if (post.oculto) return false

  if (!ctx.tenantId) {
    return (
      post.visibilidade === 'PUBLICO' &&
      ctx.afiliacaoId != null &&
      post.tenant.afiliacaoId === ctx.afiliacaoId
    )
  }

  if (post.tenantId === ctx.tenantId) return true

  if (
    ctx.afiliacaoId &&
    post.tenant.afiliacaoId === ctx.afiliacaoId &&
    (post.tenant.sintetico || post.visibilidade === 'PUBLICO')
  ) {
    return true
  }

  const ids = await resolveVisibleTenantIdsForFeed(ctx.tenantId, ctx.viewerId)
  return ids.includes(post.tenantId)
}

/**
 * Autor na timeline na hora; seguidores via fila (Redis ou in-process).
 * O ping SSE do feed só dispara depois do fan-out (`feed-timeline-queue`).
 */
async function publicarNaTimelineRede(seed: {
  postId: string
  autorId: string
  tenantId: string
  criadoEm: Date
}): Promise<void> {
  await materializarTimelineAutor({
    postId: seed.postId,
    autorId: seed.autorId,
    criadoEm: seed.criadoEm,
  })
  scheduleFanoutPostParaRede(seed)
}

async function getSessionAndPortalTenant() {
  const session = await auth()
  if (!session?.user?.id) return { session, tenant: null }
  const tenant = await getActiveTenant(session.user.id, session.user.email)
  return { session, tenant }
}

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
  /** Cliente só sugere — servidor revalida com COMMUNITY_POST_NACIONAL antes de gravar. */
  alcanceNacional: z.coerce.boolean().default(false),
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
  /** Prepend otimista no feed — evita esperar o refetch da API. */
  preview?: PostPublicadoPreview
}

export async function publicarPost(
  _prevState: PublicarPostState,
  formData: FormData,
): Promise<PublicarPostState> {
  try {
    const parsed = postSchema.safeParse({
      conteudo: formData.get('conteudo'),
      midias: parseMidias(formData.get('midias')),
      visibilidade: formData.get('visibilidade') ?? 'PUBLICO',
      alcanceNacional: formData.get('alcanceNacional'),
    })

    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    const { conteudo, midias, visibilidade, alcanceNacional: alcanceNacionalPedido } = parsed.data

    let session: Awaited<ReturnType<typeof assertAutorPublicacaoPost>>['session']
    let tenant: Awaited<ReturnType<typeof assertAutorPublicacaoPost>>['tenant']
    try {
      ;({ session, tenant } = await assertAutorPublicacaoPost(visibilidade))
    } catch (error) {
      return { message: error instanceof Error ? error.message : 'Não autorizado.' }
    }

    const erroMencoes = erroMencoesExcessivas(conteudo)
    if (erroMencoes) return { message: erroMencoes }

    // Servidor é a única fonte de verdade da permissão — o cliente só sugere.
    let alcanceNacional = false
    if (alcanceNacionalPedido && visibilidade === 'PUBLICO') {
      const { rolePermissions, overrides } = await getUserPermissionsInTenant(
        session.user.id,
        tenant.id,
      )
      const effective = calculateEffectivePermissions(rolePermissions, overrides)
      alcanceNacional = hasPermission(effective, PERMISSIONS.COMMUNITY_POST_NACIONAL)
    }

    const post = await db.post.create({
      data: {
        tenantId: tenant.id,
        autorId: session.user.id,
        conteudo,
        midiaUrls: midias,
        tipo: 'MEMBRO',
        visibilidade,
        alcanceNacional,
      },
    })

    // Caminho crítico: autor na timeline. Hashtags/menções/audit/perfil → after().
    await publicarNaTimelineRede({
      postId: post.id,
      autorId: session.user.id,
      tenantId: tenant.id,
      criadoEm: post.criadoEm,
    })

    agendarPosPublicacaoFeed({
      postId: post.id,
      tenantId: tenant.id,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      conteudo,
      ensurePerfil: true,
      audit: { acao: 'POST_SOCIAL_PUBLICADO', detalhes: { tipo: 'MEMBRO' } },
    })

    invalidarLeituraComunidade(tenant.id)
    return {
      success: true,
      token: post.id,
      preview: previewDoPost({
        post,
        autorId: session.user.id,
        autorNome: session.user.name ?? null,
        autorAvatar: session.user.image ?? null,
        tenantNome: tenant.nome,
      }),
    }
  } catch (error) {
    console.error('[publicarPost]', error)
    return { message: 'Não foi possível publicar. Tente novamente.' }
  }
}

/**
 * Publica um post na Comunidade Nacional do clube — torcedor global, sem vínculo
 * com torcida na plataforma. Post vai para o tenant sintético do clube, sempre
 * PUBLICO. Sem AuditLog (decisão registrada: o tenant sintético não tem admin
 * para consultar auditoria; moderação fica no mecanismo de denúncia/oculto).
 */
export async function publicarPostComoTorcedorGlobal(
  conteudo: string,
  midias: string[],
): Promise<PostPublicadoPreview> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const perfil: {
    onboardingConcluidoEm: Date | null
    afiliacaoId: string | null
    afiliacao: { nome: string; apelido: string | null } | null
  } | null = await db.perfilTorcedor.findUnique({
    where: { userId: session.user.id },
    select: {
      onboardingConcluidoEm: true,
      afiliacaoId: true,
      afiliacao: { select: { nome: true, apelido: true } },
    },
  })
  if (!perfil?.onboardingConcluidoEm || !perfil.afiliacaoId) {
    throw new Error('Conclua o onboarding do torcedor para publicar.')
  }

  const parsed = postSchema.safeParse({ conteudo, midias, visibilidade: 'PUBLICO' })
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Publicação inválida')
  }

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) throw new Error(erroMencoes)

  const tenant = await getOrCreateComunidadeNacionalTenant(perfil.afiliacaoId)

  const limiterKey = `post:${tenant.id}:${session.user.id}`
  if (excedeuLimiteEngajamento(limiterKey)) {
    throw new Error('Você está postando rápido demais. Aguarde um pouco.')
  }
  registrarAcaoEngajamento(limiterKey)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      tipo: 'MEMBRO',
      visibilidade: 'PUBLICO',
      conteudo: parsed.data.conteudo,
      midiaUrls: parsed.data.midias,
    },
  })

  await publicarNaTimelineRede({
    postId: post.id,
    autorId: session.user.id,
    tenantId: tenant.id,
    criadoEm: post.criadoEm,
  })

  agendarPosPublicacaoFeed({
    postId: post.id,
    tenantId: tenant.id,
    autorId: session.user.id,
    autorNome: session.user.name ?? null,
    conteudo: parsed.data.conteudo,
  })

  invalidarLeituraComunidade(tenant.id)
  return previewDoPost({
    post,
    autorId: session.user.id,
    autorNome: session.user.name ?? null,
    autorAvatar: session.user.image ?? null,
    tenantNome: perfil.afiliacao?.apelido ?? perfil.afiliacao?.nome ?? 'Comunidade',
  })
}

export type SeguimentoResultado = 'APROVADO' | 'PENDENTE'

export async function solicitarSeguir(userId: string): Promise<SeguimentoResultado> {
  const { session, tenant } = await getSessionAndPortalTenant()
  if (!session?.user?.id) throw new Error('Não autenticado')

  // canFollowUser é o ponto único do funil (mesma torcida, aliadas ou mesmo
  // clube para torcedor global) — sem exigir SaasMembro do ator.
  const podeSeguir = await canFollowUser(session.user.id, userId, tenant?.id ?? null)
  if (!podeSeguir) {
    throw new Error('Você só pode seguir torcedores do seu clube, da sua torcida ou de torcidas aliadas.')
  }

  const statusAtual = await getSeguimentoStatus(session.user.id, userId)
  if (statusAtual === 'APROVADO' || statusAtual === 'PENDENTE') return statusAtual

  // Seguimento.tenantContextoId é FK obrigatória: sem tenant do ator (torcedor
  // global), usa o tenant do alvo. Dois torcedores globais entre si ficam de fora.
  let tenantContextoId = tenant?.id ?? null
  if (!tenantContextoId) {
    const vinculoAlvo: { tenant: { id: string } } | null = await db.saasMembro.findFirst({
      where: { userId, status: 'APROVADO' },
      orderBy: { criadoEm: 'desc' },
      select: { tenant: { select: { id: true } } },
    })
    tenantContextoId = vinculoAlvo?.tenant.id ?? null
  }
  if (!tenantContextoId) {
    throw new Error(
      'Não é possível seguir outro torcedor sem torcida ainda — funcionalidade em desenvolvimento.',
    )
  }

  // Sócio é sempre "privado" pra torcedor: sem tenant (ator é torcedor global),
  // nunca auto-aprova, mesmo que o alvo tenha perfilPrivado=false — só o próprio
  // sócio aprovando manualmente libera as publicações dele pro torcedor.
  const perfilSeguido = await db.perfilMembro.findUnique({
    where: { userId_tenantId: { userId, tenantId: tenantContextoId } },
    select: { perfilPrivado: true },
  })
  const statusInicial =
    tenant && perfilSeguido?.perfilPrivado === false ? 'APROVADO' : 'PENDENTE'

  await db.seguimento.upsert({
    where: { seguidorId_seguidoId: { seguidorId: session.user.id, seguidoId: userId } },
    create: {
      seguidorId: session.user.id,
      seguidoId: userId,
      tenantContextoId,
      status: statusInicial,
    },
    update: { status: statusInicial, tenantContextoId },
  })

  if (statusInicial === 'APROVADO') {
    await backfillTimelineDoAutorParaViewer(session.user.id, userId)
  }

  if (statusInicial === 'PENDENTE') {
    await criarNotificacao({
      userId,
      tenantId: tenantContextoId,
      tipo: 'SEGUIMENTO_PENDENTE',
      titulo: 'Nova solicitação para seguir',
      corpo: `${session.user.name ?? 'Um membro'} quer seguir você.`,
      link: '/portal/comunidade/seguindo',
      atorId: session.user.id,
    })
  }

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${userId}`)
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
  revalidatePath('/portal/comunidade/seguindo')
  invalidarLeituraComunidade(tenantContextoId)

  return statusInicial
}

async function marcarNotificacoesSeguimentoPendentesLidas(
  userId: string,
  tenantId: string,
  atorId: string,
): Promise<void> {
  await db.notificacao.updateMany({
    where: {
      userId,
      tenantId,
      atorId,
      tipo: 'SEGUIMENTO_PENDENTE',
      lida: false,
    },
    data: { lida: true },
  })
}

export async function aprovarSeguimento(seguimentoId: string): Promise<void> {
  const { session, tenant } = await getSessionAndPortalTenant()
  if (!session?.user?.id) throw new Error('Não autenticado')

  // Destinatário torcedor global (sem tenant ativo): busca só por seguidoId —
  // não há tenant do destinatário para comparar com tenantContextoId.
  const seguimento = await db.seguimento.findFirst({
    where: tenant
      ? { id: seguimentoId, seguidoId: session.user.id, tenantContextoId: tenant.id }
      : { id: seguimentoId, seguidoId: session.user.id },
    select: { id: true, seguidorId: true, tenantContextoId: true },
  })
  if (!seguimento) throw new Error('Solicitação não encontrada')

  await db.seguimento.update({
    where: { id: seguimento.id },
    data: { status: 'APROVADO' },
  })

  await backfillTimelineDoAutorParaViewer(seguimento.seguidorId, session.user.id)

  const tenantNotif = tenant?.id ?? seguimento.tenantContextoId
  await marcarNotificacoesSeguimentoPendentesLidas(
    session.user.id,
    tenantNotif,
    seguimento.seguidorId,
  )

  await criarNotificacao({
    userId: seguimento.seguidorId,
    tenantId: tenantNotif,
    tipo: 'SEGUIMENTO_APROVADO',
    titulo: 'Solicitação aprovada',
    corpo: `${session.user.name ?? 'Um membro'} aceitou você.`,
    link: `/portal/comunidade/perfil/${session.user.id}`,
    atorId: session.user.id,
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${seguimento.seguidorId}`)
  revalidatePath('/portal/comunidade/seguindo')
  revalidatePath('/portal/comunidade/notificacoes')
  invalidarLeituraComunidade(tenantNotif)
}

export async function rejeitarSeguimento(seguimentoId: string): Promise<void> {
  const { session, tenant } = await getSessionAndPortalTenant()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const seguimento = await db.seguimento.findFirst({
    where: tenant
      ? { id: seguimentoId, seguidoId: session.user.id, tenantContextoId: tenant.id }
      : { id: seguimentoId, seguidoId: session.user.id },
    select: { id: true, seguidorId: true, tenantContextoId: true },
  })
  if (!seguimento) throw new Error('Solicitação não encontrada')

  await db.seguimento.update({
    where: { id: seguimento.id },
    data: { status: 'REJEITADO' },
  })

  await marcarNotificacoesSeguimentoPendentesLidas(
    session.user.id,
    tenant?.id ?? seguimento.tenantContextoId,
    seguimento.seguidorId,
  )

  revalidatePath('/portal/comunidade/seguindo')
  revalidatePath(`/portal/comunidade/perfil/${seguimento.seguidorId}`)
  revalidatePath('/portal/comunidade/notificacoes')
  revalidatePath('/portal/comunidade')
  invalidarLeituraComunidade(tenant?.id ?? seguimento.tenantContextoId)
}

export async function deixarDeSeguir(userId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const tenant = await getActiveTenant(session.user.id, session.user.email)

  // Só apaga o próprio seguimento (seguidorId = sessão) — não precisa de tenant.
  await db.seguimento.deleteMany({
    where: {
      seguidorId: session.user.id,
      seguidoId: userId,
      status: 'APROVADO',
    },
  })

  await removerTimelineDoAutorParaViewer(session.user.id, userId)

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${userId}`)
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
  if (tenant?.id) invalidarLeituraComunidade(tenant.id)
}

export interface AtualizarPerfilSocialInput {
  tenantId: string
  bio: string
  perfilPrivado: boolean
  exibirCidade: boolean
  exibirSede: boolean
  exibirDesde: boolean
  bannerUrl: string | null
  bannerPos: number | null
  avatarUrl: string | null
}

export async function atualizarPerfilSocial(input: AtualizarPerfilSocialInput): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')
  const { salvarPerfilSocial } = await import('@/lib/salvar-perfil-social')
  await salvarPerfilSocial(session.user.id, input)
}

/** @deprecated Use atualizarPerfilSocial */
export async function atualizarPerfil(bio: string, perfilPrivado: boolean): Promise<void> {
  const { session, tenant } = await getSessionAndPortalTenant()
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')
  await assertMembroAtivo(tenant.id, session.user.id)
  const parsed = perfilSchema.safeParse({ bio, perfilPrivado })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Perfil inválido')
  const membro: { tipo: 'SOCIO' | 'TORCEDOR'; status: string } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: { tipo: true, status: true },
  })
  const perfilPrivadoGravado = resolverPerfilPrivadoEfetivo(parsed.data.perfilPrivado, membro)
  await db.perfilMembro.upsert({
    where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
    create: {
      userId: session.user.id,
      tenantId: tenant.id,
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado: perfilPrivadoGravado,
    },
    update: {
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado: perfilPrivadoGravado,
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
  invalidarLeituraComunidade(tenant.id)
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
  invalidarLeituraComunidade(tenant.id)
}

export interface ComentarioPostItem {
  id: string
  conteudo: string
  criadoEm: string
  autor: { id: string; nome: string | null; avatarUrl: string | null }
}

export async function listarComentariosPost(postId: string): Promise<ComentarioPostItem[]> {
  // Leitura de comentários: gate é a visibilidade do PRÓPRIO POST (PUBLICO/
  // TENANT/PRIVADO), não a privacidade de perfil do autor — comentário de post
  // PUBLICO é legível por qualquer autenticado, mesmo torcedor global (sem
  // tenant) e mesmo que o autor tenha perfilPrivado=true. Não reusa podeVerPost
  // (feed.ts) porque essa função também exige podeVerConteudoSocial (privacidade
  // de perfil), regra que nunca existiu pra leitura de comentário.
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const post: {
    id: string
    autorId: string
    tenantId: string
    visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
    oculto: boolean
  } | null = await db.post.findUnique({
    where: { id: postId },
    select: { id: true, autorId: true, tenantId: true, visibilidade: true, oculto: true },
  })
  if (!post || post.oculto) throw new Error('Post não encontrado')

  const viewerId = session.user.id
  let podeVer = viewerId === post.autorId || post.visibilidade === 'PUBLICO'
  if (!podeVer && post.visibilidade === 'TENANT') {
    podeVer = await podeVerFeedSocios(viewerId, post.tenantId)
  }
  if (!podeVer && post.visibilidade === 'PRIVADO') {
    podeVer = (await getSeguimentoStatus(viewerId, post.autorId)) === 'APROVADO'
  }
  if (!podeVer) throw new Error('Post não encontrado')

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
  const parsed = comentarioSchema.safeParse({ postId, conteudo })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Comentário inválido')

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) throw new Error(erroMencoes)

  const [ctx, post] = await Promise.all([
    resolverContextoEngajamento(),
    db.post.findUnique({
      where: { id: parsed.data.postId },
      select: {
        id: true,
        autorId: true,
        tenantId: true,
        oculto: true,
        visibilidade: true,
        tenant: { select: { afiliacaoId: true, sintetico: true } },
      },
    }) as Promise<PostEngajavelLite | null>,
  ])

  if (!post || !(await podeEngajarPostVisivel(ctx, post))) {
    throw new Error('Post não encontrado')
  }

  const { session, viewerId, tenantId, afiliacaoId } = ctx
  const limiterKey = `comment:${tenantId ?? `nacional:${afiliacaoId}`}:${viewerId}`
  if (excedeuLimiteEngajamento(limiterKey)) {
    throw new Error('Você está comentando rápido demais. Aguarde um pouco.')
  }
  registrarAcaoEngajamento(limiterKey)

  const notifTenantId = tenantId ?? post.tenantId
  const link = linkPostComunidade(post.id)

  const comentario: { id: string; conteudo: string; criadoEm: Date } = await db.comentario.create({
    data: { postId: post.id, autorId: viewerId, conteudo: parsed.data.conteudo },
    select: { id: true, conteudo: true, criadoEm: true },
  })

  // Audit + notificações fora do caminho crítico (UI já é otimista).
  const corpoNotif = parsed.data.conteudo.slice(0, 140)
  const autorNome = session.user.name ?? null
  const conteudoMencoes = parsed.data.conteudo
  after(() => {
    if (tenantId) {
      void db.auditLog
        .create({
          data: {
            tenantId,
            atorId: viewerId,
            acao: 'POST_COMENTARIO_CRIADO',
            entidade: 'Comentario',
            entidadeId: comentario.id,
            detalhes: { postId: post.id },
          },
        })
        .catch(() => undefined)
    }
    if (post.autorId !== viewerId) {
      void notificarSafe({
        userId: post.autorId,
        tenantId: notifTenantId,
        tipo: 'NOVO_COMENTARIO',
        titulo: 'Novo comentário no seu post',
        corpo: corpoNotif,
        link,
        atorId: viewerId,
      })
    }
    void notificarMencoesDoPost({
      conteudo: conteudoMencoes,
      autorId: viewerId,
      autorNome,
      tenantId: notifTenantId,
      postId: post.id,
      link,
    })
  })

  // Sem revalidatePath: lista no cliente é otimista (feed e página do post).
  return {
    id: comentario.id,
    conteudo: comentario.conteudo,
    criadoEm: comentario.criadoEm.toISOString(),
    autor: {
      id: viewerId,
      nome: session.user.name ?? null,
      avatarUrl: session.user.image ?? null,
    },
  }
}

export async function publicarEnquete(
  _prevState: PublicarPostState,
  formData: FormData,
): Promise<PublicarPostState> {
  let session: Awaited<ReturnType<typeof assertPodePublicarNoFeed>>['session']
  let tenant: Awaited<ReturnType<typeof assertPodePublicarNoFeed>>['tenant']
  try {
    ;({ session, tenant } = await assertPodePublicarNoFeed())
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Não autorizado.' }
  }

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

  await publicarNaTimelineRede({
    postId: post.id,
    autorId: session.user.id,
    tenantId: tenant.id,
    criadoEm: post.criadoEm,
  })

  agendarPosPublicacaoFeed({
    postId: post.id,
    tenantId: tenant.id,
    autorId: session.user.id,
    autorNome: session.user.name ?? null,
    conteudo: parsed.data.conteudo,
    ensurePerfil: true,
  })

  invalidarLeituraComunidade(tenant.id)
  return {
    success: true,
    token: post.id,
    preview: previewDoPost({
      post,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      autorAvatar: session.user.image ?? null,
      tenantNome: tenant.nome,
    }),
  }
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
      atorId: session.user.id,
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

  await publicarNaTimelineRede({
    postId: repost.id,
    autorId: session.user.id,
    tenantId: tenant.id,
    criadoEm: repost.criadoEm,
  })

  revalidatePath('/portal/comunidade')
  invalidarLeituraComunidade(tenant.id)
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

  await publicarNaTimelineRede({
    postId: repost.id,
    autorId: session.user.id,
    tenantId: tenant.id,
    criadoEm: repost.criadoEm,
  })

  revalidatePath('/portal/comunidade')
  invalidarLeituraComunidade(tenant.id)
}

export async function publicarPostEvento(
  _prevState: PublicarPostState,
  formData: FormData,
): Promise<PublicarPostState> {
  let session: Awaited<ReturnType<typeof assertPodePublicarNoFeed>>['session']
  let tenant: Awaited<ReturnType<typeof assertPodePublicarNoFeed>>['tenant']
  try {
    ;({ session, tenant } = await assertPodePublicarNoFeed())
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Não autorizado.' }
  }

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

  await publicarNaTimelineRede({
    postId: post.id,
    autorId: session.user.id,
    tenantId: tenant.id,
    criadoEm: post.criadoEm,
  })

  agendarPosPublicacaoFeed({
    postId: post.id,
    tenantId: tenant.id,
    autorId: session.user.id,
    autorNome: session.user.name ?? null,
    conteudo: parsed.data.conteudo,
    ensurePerfil: true,
    audit: { acao: 'POST_EVENTO_PUBLICADO', detalhes: { eventoId: evento.id } },
  })

  invalidarLeituraComunidade(tenant.id)
  return {
    success: true,
    token: post.id,
    preview: previewDoPost({
      post,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      autorAvatar: session.user.image ?? null,
      tenantNome: tenant.nome,
    }),
  }
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
  invalidarLeituraComunidade(tenant.id)
  return { success: true }
}

async function permissoesEfetivas(userId: string, tenantId: string): Promise<string[]> {
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  return calculateEffectivePermissions(rolePermissions, overrides)
}

export async function entrarCanal(conversaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const canal = await getCanalPorId(conversaId, tenant.id, session.user.id)
  if (!canal) throw new Error('Canal não encontrado ou indisponível.')
  if (!canal.publica) throw new Error('Este canal não aceita novos inscritos.')

  await inscreverCanal(conversaId, session.user.id)

  revalidatePath('/portal/comunidade/canais')
  revalidatePath(linkCanalComunidade(conversaId))
  revalidatePath('/portal/mensagens')
}

export async function criarCanalTematico(
  nome: string,
  descricao?: string,
  visibilidadeCanal: 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO' = 'HIERARQUIA',
): Promise<{ id: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const efetivas = await permissoesEfetivas(session.user.id, tenant.id)
  if (
    !hasPermission(efetivas, PERMISSIONS.CHANNELS_MANAGE) &&
    !hasPermission(efetivas, PERMISSIONS.COMMUNITY_MANAGE)
  ) {
    throw new Error('Sem permissão para criar canais.')
  }

  const parsed = criarCanalTematicoSchema.safeParse({ nome, descricao, visibilidadeCanal })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Canal inválido')

  const canal: { id: string } = await db.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId: tenant.id,
      nome: parsed.data.nome,
      descricao: parsed.data.descricao?.trim() || null,
      institucional: true,
      canalOficial: false,
      visibilidadeCanal: parsed.data.visibilidadeCanal,
      somenteAdminPublica: true,
      publica: true,
      criadoPorId: session.user.id,
      membros: {
        create: { userId: session.user.id, papel: 'ADMIN' },
      },
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'CANAL_TEMATICO_CRIADO',
      entidade: 'Conversa',
      entidadeId: canal.id,
      detalhes: { visibilidadeCanal: parsed.data.visibilidadeCanal },
    },
  })

  revalidatePath('/portal/comunidade/canais')
  return canal
}

export async function publicarPostCanal(
  conversaId: string,
  conteudo: string,
): Promise<{ success: boolean; message?: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = publicarPostCanalSchema.safeParse({ conversaId, conteudo })
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const efetivas = await permissoesEfetivas(session.user.id, tenant.id)
  const canal = await getCanalPorId(parsed.data.conversaId, tenant.id, session.user.id)
  if (!canal) return { success: false, message: 'Canal não encontrado.' }

  if (!canal.souMembro) {
    await inscreverCanal(parsed.data.conversaId, session.user.id)
  }

  const podePublicar = await podePublicarNoCanal(canal, tenant.id, efetivas)
  if (canal.somenteAdminPublica && !podePublicar) {
    return { success: false, message: 'Somente administradores podem publicar neste canal.' }
  }

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) return { success: false, message: erroMencoes }

  await getOrCreatePerfilMembro(session.user.id, tenant.id)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: parsed.data.conteudo,
      tipo: canal.institucional ? 'INSTITUCIONAL' : 'MEMBRO',
      visibilidade: 'TENANT',
      conversaId: parsed.data.conversaId,
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
      link: linkCanalComunidade(parsed.data.conversaId),
    }),
  ])

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'POST_CANAL_PUBLICADO',
      entidade: 'Post',
      entidadeId: post.id,
      detalhes: { conversaId: parsed.data.conversaId, canalOficial: canal.canalOficial },
    },
  })

  revalidatePath(linkCanalComunidade(parsed.data.conversaId))
  if (canal.canalOficial) {
    revalidatePath(linkUnidadeComunidade(tenant.id))
  }
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

export async function reagirPost(
  postId: string,
  tipo: 'CURTIR' | 'FORCA' | 'VAMOS' | 'PRESENTE',
): Promise<{ minhaReacao: 'CURTIR' | 'FORCA' | 'VAMOS' | 'PRESENTE' | null }> {
  const parsed = reacaoSchema.safeParse({ postId, tipo })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Reação inválida')

  // Authz + post em paralelo — evita serializar hierarquia antes de saber se o post existe.
  const [ctx, post] = await Promise.all([
    resolverContextoEngajamento(),
    db.post.findUnique({
      where: { id: parsed.data.postId },
      select: {
        id: true,
        autorId: true,
        tenantId: true,
        oculto: true,
        visibilidade: true,
        tenant: { select: { afiliacaoId: true, sintetico: true } },
      },
    }) as Promise<PostEngajavelLite | null>,
  ])

  if (!post || !(await podeEngajarPostVisivel(ctx, post))) {
    throw new Error('Post não encontrado')
  }

  const { viewerId, tenantId, afiliacaoId } = ctx
  const limiterKey = `reaction:${tenantId ?? `nacional:${afiliacaoId}`}:${viewerId}`
  if (excedeuLimiteEngajamento(limiterKey)) {
    throw new Error('Você está reagindo rápido demais. Aguarde um pouco.')
  }
  registrarAcaoEngajamento(limiterKey)

  // 1 RTT no descurtir (deleteMany); add/troca = deleteMany(0) + upsert.
  // Evita o findUnique prévio que sempre somava um round-trip.
  const removidos: { count: number } = await db.reacao.deleteMany({
    where: { postId: post.id, userId: viewerId, tipo: parsed.data.tipo },
  })
  const removendo = removidos.count > 0

  if (!removendo) {
    await db.reacao.upsert({
      where: { postId_userId: { postId: post.id, userId: viewerId } },
      create: { postId: post.id, userId: viewerId, tipo: parsed.data.tipo },
      update: { tipo: parsed.data.tipo },
    })
  }

  // Notificação fora do caminho crítico — UI já é otimista.
  if (!removendo && post.autorId !== viewerId) {
    const notifTenantId = tenantId ?? post.tenantId
    const corpo =
      parsed.data.tipo === 'FORCA'
        ? 'Recebeu uma reação de Força.'
        : parsed.data.tipo === 'VAMOS'
          ? 'Recebeu um Vamos!'
          : parsed.data.tipo === 'PRESENTE'
            ? 'Marcou presença no seu post.'
            : 'Recebeu uma curtida.'
    after(() => {
      void notificarSafe({
        userId: post.autorId,
        tenantId: notifTenantId,
        tipo: 'NOVA_REACAO',
        titulo: 'Nova reação no seu post',
        corpo,
        link: linkPostComunidade(post.id),
        atorId: viewerId,
      })
    })
  }

  // Sem revalidatePath: overlay de reação é estado do cliente (otimista).
  return { minhaReacao: removendo ? null : parsed.data.tipo }
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

  await notificarDenunciaPost({
    tenantId: tenant.id,
    motivo: parsed.data.motivo,
    denuncianteUserId: session.user.id,
  })

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

/** Marca como lidas apenas notificações sociais (central da Comunidade). */
export async function marcarTodasNotificacoesLidas(): Promise<void> {
  const { session, tenant } = await getSessionAndPortalTenant()
  if (!session?.user?.id || !tenant) throw new Error('Não autenticado')

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
