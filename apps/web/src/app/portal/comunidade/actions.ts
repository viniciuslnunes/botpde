'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'
import { invalidarCachesComunidadeFeed, invalidarFeedNacional } from '@/lib/comunidade-cache'
import { emitFeedNacionalPing } from '@/lib/feed-bus'
import { assertAutorPublicacaoPost, assertComunidadeNacional, assertMembroAtivo, assertNaoOperador, assertPermission, assertPodePublicarNoFeed, ehOperadorPlataforma, ERRO_MODO_OPERADOR } from '@/lib/authz'
import { ExpectedError } from '@/lib/expected-error'
import { getActiveTenant, getUserPermissionsInTenant } from '@/lib/tenant'
import { marcarComunicadosLidos } from '@/lib/comunidade'
import { db } from '@torcida/db'
import { PERMISSIONS, editarPostSchema, visibilidadePostSchema, reacaoTipoSchema, publicarEnqueteSchema, votarEnqueteSchema, repostarSchema, repostarComunicadoSchema, publicarPostEventoSchema, criarGrupoSchema, atualizarGrupoSchema, alterarPapelGrupoSchema, removerMembroGrupoSchema, conversaGrupoIdSchema, entrarPorConviteGrupoSchema, ocultarPostGrupoSchema, criarDestaqueSchema, publicarPostGrupoSchema, publicarMomentoStorySchema, publicarPostCanalSchema, criarCanalTematicoSchema, atualizarCanalTematicoSchema, alterarAdminCanalSchema, pedirEntradaCanalSchema, sairCanalSchema, alternarSilencioCanalSchema, decidirPedidoCanalSchema, removerMembroCanalSchema, adicionarMembroCanalSchema, pedirEntradaGrupoSchema, decidirPedidoGrupoSchema, sairGrupoSchema, alternarSilencioGrupoSchema, MAX_MENCOES_POR_CONTEUDO, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { notificarMencoesDoPost, sincronizarHashtagsDoPost } from '@/lib/comunidade-publish'
import { linkPostComunidade } from '@/lib/comunidade-social'
import { extrairMencoes } from '@/lib/comunidade-social'
import {
  canFollowUser,
  getOrCreatePerfilMembro,
  getPerfilMembroForPortal,
  getPerfilPrivadoEfetivoDoAlvo,
  getSeguimentoStatus,
} from '@/lib/social'
import { resolveTenantIdPortalComunidade } from '@/lib/comunidade-contexto'
import { getAvatarAtualDoUsuario, resolverPerfilPrivadoEfetivo } from '@/lib/perfil-social'
import {
  criarNotificacao,
  notificarSafe,
  reconciliarNotificacoesDoEvento,
} from '@/lib/notificacoes'
import { emitNotificacaoPing } from '@/lib/notificacoes-bus'
import { notificarDenunciaPost } from '@/lib/notificacoes-routing'
import { excedeuLimiteEngajamento, registrarAcaoEngajamento } from '@/lib/engagement-rate-limit'
import type { PostPublicadoPreview } from '@/lib/feed-live-refresh'
import { chave, getBadgesPorAutorTenant, getTorcidaRealDoAutor } from '@/lib/autor-badges'
import { formatNomeTorcida, designFromPrimary, isCorPadraoPlataforma, nomeExibicaoAfiliacao } from '@torcida/types'
import { getEscopoEventosVisiveis } from '@/lib/eventos'
import {
  podeVerFeedSocios,
  resolveTenantIdsSomenteComunicado,
  resolveVisibleTenantIdsForFeed,
} from '@/lib/feed'
import { getTenantsRestritos } from '@/lib/isolamento'
import { isSuperAdminEmail, resolverTorcidaDoTorcedor } from '@/lib/tenant-context'
import { calcularExpiraStory } from '@/lib/stories'
import {
  getCanalPorId,
  getCanalDaUnidadeDoVinculo,
  isConversaCanalDepartamento,
  getCanalSeMembroAtivo,
  assertElegibilidadeMembroCanal,
  inscreverCanal,
  podePublicarNoCanal,
  podeGerenciarPedidosCanal,
  podeVerCanal,
  linkCanalComunidade,
  linkUnidadeComunidade,
  listMembrosCanal,
  listCandidatosMembroCanal,
  listPedidosCanal,
} from '@/lib/canais'
import type {
  CandidatoMembroCanalItem,
  MembroCanalItem,
  PedidoCanalItem,
} from '@/lib/canais-shared'
import { TIPOS_NOTIFICACAO_SOCIAL } from '@/lib/notificacoes-comunidade'
import { listarDestinatariosPorPermissoes } from '@/lib/notificacoes-routing'
import {
  isCloudinaryUrl,
  isSocialUrl,
  isStickerPath,
  midiasAposEditarConteudo,
  midiasComEmbedDoTexto,
} from '@/lib/social-embed'
import {
  backfillTimelineDoAutorParaViewer,
  backfillTimelineDoGrupoParaViewer,
  fanoutPostParaMembrosGrupo,
  materializarTimelineAutor,
  removerTimelineDoAutorParaViewer,
} from '@/lib/feed-timeline'
import { scheduleFanoutPostParaRede } from '@/lib/feed-timeline-queue'
import { MAX_MEMBROS_GRUPO } from '@/lib/mensageria'
import { generateInviteSlug } from '@/lib/invite-slug'

const MAX_MIDIAS = 10

function invalidarLeituraComunidade(tenantId: string, afiliacaoId?: string | null): void {
  invalidarCachesComunidadeFeed(tenantId)
  if (afiliacaoId) {
    invalidarFeedNacional(afiliacaoId)
    emitFeedNacionalPing(afiliacaoId)
  }
}

function alcanceNacionalDaPublicacao(
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO',
  permissoesEfetivas?: ReturnType<typeof calculateEffectivePermissions>,
): boolean {
  if (visibilidade !== 'PUBLICO') return false
  if (!permissoesEfetivas) return true
  return hasPermission(permissoesEfetivas, PERMISSIONS.COMMUNITY_POST_NACIONAL)
}

function avatarPreviewDaSessao(session: Session): string | null {
  const img = session.user.image
  return typeof img === 'string' && img.length > 0 ? img : null
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

async function previewDoPost(opts: {
  post: { id: string; tenantId: string; conteudo: string; midiaUrls: string[]; visibilidade: string; criadoEm: Date }
  autorId: string
  autorNome: string | null
  autorAvatar: string | null
  tenantNome: string
  /** Tenant sintético da CN — badge padrão "Torcedor" quando não há cargo na torcida. */
  tenantSintetico?: boolean
  /** Tenant ativo do autor — prioriza badge da unidade em que está publicando. */
  torcidaPreferidaId?: string
}): Promise<PostPublicadoPreview> {
  let badgeTenantId = opts.post.tenantId
  let tenantNomeExibicao = opts.tenantNome
  let torcidaReal: Awaited<ReturnType<typeof getTorcidaRealDoAutor>> = null

  if (opts.tenantSintetico) {
    const container: { afiliacaoId: string | null } | null = await db.tenant.findUnique({
      where: { id: opts.post.tenantId },
      select: { afiliacaoId: true },
    })
    if (container?.afiliacaoId) {
      torcidaReal = await getTorcidaRealDoAutor(opts.autorId, container.afiliacaoId, {
        tenantPreferidoId: opts.torcidaPreferidaId,
      })
      if (torcidaReal) {
        badgeTenantId = torcidaReal.tenantId
        tenantNomeExibicao = torcidaReal.tenantNome
      }
    }
  }

  const [badges, user] = await Promise.all([
    getBadgesPorAutorTenant([{ autorId: opts.autorId, tenantId: badgeTenantId }]),
    db.user.findUnique({
      where: { id: opts.autorId },
      select: { nickname: true },
    }),
  ])
  const badge = badges.get(chave(opts.autorId, badgeTenantId))
  let cargoNome = badge?.cargoNome ?? null
  const departamentoNome = badge?.departamentoNome ?? null
  if (!cargoNome && opts.tenantSintetico && !torcidaReal) {
    cargoNome = 'Torcedor'
  }

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
      nickname: user?.nickname ?? null,
      sedeNome: badge?.sedeNome ?? null,
      cargoNome,
      departamentoNome,
    },
    tenantNome: formatNomeTorcida(tenantNomeExibicao),
  }
}

/** Vínculo APROVADO no tenant (sócio ou torcedor convidado) — engaja no mural. */
async function vinculoAprovadoNoTenant(userId: string, tenantId: string): Promise<boolean> {
  const membro: { status: string } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { status: true },
  })
  return membro?.status === 'APROVADO'
}

/**
 * Contexto de engajamento (reação/comentário/salvar):
 * - sócio APROVADO com tenant ativo + `COMMUNITY_POST`;
 * - torcedor APROVADO na unidade (convite) — `tenantId` do vínculo, sem abrir
 *   `getActiveTenant` (portal permanece em modo CN; publicar/compartilhar
 *   continuam bloqueados — sócio via `assertPermission`);
 * - torcedor global da Comunidade Nacional (`tenantId` null).
 */
async function resolverContextoEngajamento(): Promise<{
  session: Session
  viewerId: string
  /** Tenant do viewer (sócio / torcedor da unidade) ou null (CN pura). */
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

    // Modo operador: super-admin sem vínculo APROVADO neste tenant lê tudo e
    // não engaja — nem por aqui, nem caindo no fallback da CN abaixo.
    if (await ehOperadorPlataforma(viewerId, session.user.email, tenant.id)) {
      throw new Error(ERRO_MODO_OPERADOR)
    }

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

  // Torcedor APROVADO na unidade (getActiveTenant é null de propósito): engaja
  // no tenant do convite — mural TENANT + R5 self — sem exigir community:post.
  const unidadeTorcedor = await resolverTorcidaDoTorcedor(viewerId)
  if (unidadeTorcedor) {
    return {
      session,
      viewerId,
      tenantId: unidadeTorcedor.id,
      afiliacaoId: unidadeTorcedor.afiliacaoId,
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
  /** R5 — distingue o comunicado oficial das demais publicações. */
  tipo?: string
  comunicadoOrigemId?: string | null
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

  // R5 — canal restrito ANTES dos atalhos. O fast-path "mesmo clube + PÚBLICO"
  // não consulta hierarquia; sem esta trava, qualquer torcedor do clube com o
  // id do post reagiria/comentaria em publicação de uma unidade isolada — e a
  // própria unidade isolada engajaria na praça de fora. Vale nos dois sentidos.
  // Exceção: vínculo APROVADO na própria unidade (torcedor do convite) — self.
  if (post.tenantId !== ctx.tenantId) {
    const restritos = await getTenantsRestritos()
    if (restritos.has(post.tenantId)) {
      if (!(await vinculoAprovadoNoTenant(ctx.viewerId, post.tenantId))) return false
      return true
    }
    if (ctx.tenantId && restritos.has(ctx.tenantId)) {
      // Única exceção: o comunicado oficial do ancestral, a só publicação
      // externa que a unidade isolada enxerga.
      if (!ehComunicadoOficialEngajavel(post)) return false
      const ancestrais = await resolveTenantIdsSomenteComunicado(ctx.tenantId)
      return ancestrais.includes(post.tenantId)
    }
  }

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

function ehComunicadoOficialEngajavel(post: PostEngajavelLite): boolean {
  return post.tipo === 'INSTITUCIONAL' && post.comunicadoOrigemId != null
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
})

/** PUBLICO + COMMUNITY_POST_NACIONAL → entra no feed nacional sem follow. */
async function resolverAlcanceNacional(
  userId: string,
  tenantId: string,
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO',
): Promise<boolean> {
  if (visibilidade !== 'PUBLICO') return false
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  return hasPermission(effective, PERMISSIONS.COMMUNITY_POST_NACIONAL)
}

/** Perfil privado não publica como PUBLICO (composer esconde a opção; servidor reforça). */
async function erroPublicoComPerfilPrivado(
  userId: string,
  tenantId: string,
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO',
): Promise<string | null> {
  if (visibilidade !== 'PUBLICO') return null
  const { perfilPrivado } = await getPerfilMembroForPortal(userId, tenantId)
  if (!perfilPrivado) return null
  return 'Perfil privado não permite publicação pública. Use Só torcida ou Só seguidores.'
}

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

const paletaExtraidaSchema = z.object({
  afiliacaoId: z.string().min(1),
  hexes: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .min(1)
    .max(6),
})

const comentarioSchema = z.object({
  postId: z.string().min(1),
  conteudo: z.string().trim().min(1, 'Comentário é obrigatório').max(500),
})

const editarComentarioSchema = z.object({
  comentarioId: z.string().min(1),
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
    })

    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    const { conteudo, midias, visibilidade } = parsed.data
    const midiasFinais = midiasComEmbedDoTexto(conteudo, midias, MAX_MIDIAS)

    let session: Awaited<ReturnType<typeof assertAutorPublicacaoPost>>['session']
    let tenant: Awaited<ReturnType<typeof assertAutorPublicacaoPost>>['tenant']
    let permissoesEfetivas: Awaited<
      ReturnType<typeof assertAutorPublicacaoPost>
    >['permissoesEfetivas']
    try {
      ;({ session, tenant, permissoesEfetivas } = await assertAutorPublicacaoPost(visibilidade))
    } catch (error) {
      return { message: error instanceof Error ? error.message : 'Não autorizado.' }
    }

    const erroMencoes = erroMencoesExcessivas(conteudo)
    if (erroMencoes) return { message: erroMencoes }

    const [erroPerfil, alcanceNacional] = await Promise.all([
      erroPublicoComPerfilPrivado(session.user.id, tenant.id, visibilidade),
      Promise.resolve(alcanceNacionalDaPublicacao(visibilidade, permissoesEfetivas)),
    ])
    if (erroPerfil) return { message: erroPerfil }

    const post = await db.post.create({
      data: {
        tenantId: tenant.id,
        autorId: session.user.id,
        conteudo,
        midiaUrls: midiasFinais,
        tipo: 'MEMBRO',
        visibilidade,
        alcanceNacional,
      },
    })

    // Timeline do autor + fan-out de seguidores fora do caminho crítico da resposta.
    after(() => {
      void publicarNaTimelineRede({
        postId: post.id,
        autorId: session.user.id,
        tenantId: tenant.id,
        criadoEm: post.criadoEm,
      })
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

    after(() => {
      invalidarLeituraComunidade(
        tenant.id,
        visibilidade === 'PUBLICO' ? tenant.afiliacaoId : null,
      )
    })
    return {
      success: true,
      token: post.id,
      preview: await previewDoPost({
        post,
        autorId: session.user.id,
        autorNome: session.user.name ?? null,
        autorAvatar: avatarPreviewDaSessao(session),
        tenantNome: tenant.nome,
      }),
    }
  } catch (error) {
    console.error('[publicarPost]', error)
    return { message: 'Não foi possível publicar. Tente novamente.' }
  }
}

/**
 * Publica um post na Comunidade Nacional do clube — torcedor global (sem
 * vínculo com torcida na plataforma) OU sócio publicando pela aba Nacional
 * sem a permissão `community:post_nacional` no próprio tenant. Post vai
 * sempre para o tenant sintético do clube, sempre PUBLICO. Sem AuditLog
 * (decisão registrada: o tenant sintético não tem admin para consultar
 * auditoria; moderação fica no mecanismo de denúncia/oculto).
 *
 * Autorização via `assertComunidadeNacional` (cobre torcedor global E sócio
 * aprovado) — usar só `PerfilTorcedor` aqui quebrava a publicação de sócios
 * sem onboarding de torcedor com um 500 mascarado em produção.
 *
 * Mesmo `PublicarPostState`/`useActionState` do `FeedComposer` (modo
 * `nacional`), espelhando `publicarPostCanal`.
 */
export async function publicarPostNacional(
  _prevState: PublicarPostState,
  formData: FormData,
): Promise<PublicarPostState> {
  try {
    // CN não tem RBAC por tenant — a trava de voz do operador entra aqui.
    await assertNaoOperador()

    const parsed = postSchema.safeParse({
      conteudo: formData.get('conteudo'),
      midias: parseMidias(formData.get('midias')),
      visibilidade: 'PUBLICO',
    })
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    const { session, afiliacaoId, tenantSintetico: tenant } = await assertComunidadeNacional()

    const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
    if (erroMencoes) return { message: erroMencoes }

    const limiterKey = `post:${tenant.id}:${session.user.id}`
    if (excedeuLimiteEngajamento(limiterKey)) {
      return { message: 'Você está postando rápido demais. Aguarde um pouco.' }
    }
    registrarAcaoEngajamento(limiterKey)

    const midiasFinais = midiasComEmbedDoTexto(parsed.data.conteudo, parsed.data.midias, MAX_MIDIAS)

    const post = await db.post.create({
      data: {
        tenantId: tenant.id,
        autorId: session.user.id,
        tipo: 'MEMBRO',
        visibilidade: 'PUBLICO',
        conteudo: parsed.data.conteudo,
        midiaUrls: midiasFinais,
      },
    })

    after(() => {
      void publicarNaTimelineRede({
        postId: post.id,
        autorId: session.user.id,
        tenantId: tenant.id,
        criadoEm: post.criadoEm,
      })
    })

    agendarPosPublicacaoFeed({
      postId: post.id,
      tenantId: tenant.id,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      conteudo: parsed.data.conteudo,
    })

    after(() => {
      invalidarLeituraComunidade(tenant.id, afiliacaoId)
    })

    const afiliacao: { nome: string; apelido: string | null } | null = await db.afiliacao.findUnique({
      where: { id: afiliacaoId },
      select: { nome: true, apelido: true },
    })

    const ativo = await getActiveTenant(session.user.id, session.user.email)

    return {
      success: true,
      token: `${Date.now()}`,
      preview: await previewDoPost({
        post,
        autorId: session.user.id,
        autorNome: session.user.name ?? null,
        autorAvatar: avatarPreviewDaSessao(session),
        tenantNome: nomeExibicaoAfiliacao(afiliacao) || 'Comunidade',
        tenantSintetico: true,
        torcidaPreferidaId: ativo && !ativo.sintetico ? ativo.id : undefined,
      }),
    }
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Não foi possível publicar.' }
  }
}

export type SeguimentoResultado = 'APROVADO' | 'PENDENTE'

export type SolicitarSeguirResultado =
  | { ok: true; status: SeguimentoResultado }
  | { ok: false; message: string }

export async function solicitarSeguir(userId: string): Promise<SolicitarSeguirResultado> {
  const { session, tenant } = await getSessionAndPortalTenant()
  if (!session?.user?.id) return { ok: false, message: 'Não autenticado' }

  // Operador vê qualquer perfil sem seguir — seguir é vínculo social, não
  // leitura. Retorno tratado (não throw): Server Action com throw vira 500.
  if (tenant && (await ehOperadorPlataforma(session.user.id, session.user.email, tenant.id))) {
    return { ok: false, message: ERRO_MODO_OPERADOR }
  }

  // canFollowUser é o ponto único do funil (mesma torcida/worktree, aliadas ou
  // mesmo clube para torcedor global) — sem exigir SaasMembro do ator.
  const podeSeguir = await canFollowUser(session.user.id, userId, tenant?.id ?? null)
  if (!podeSeguir) {
    // Não throw: em produção, throw de Server Action vira HTTP 500 sem corpo.
    return {
      ok: false,
      message:
        'Você só pode seguir torcedores do seu clube, da sua torcida ou de torcidas aliadas.',
    }
  }

  const statusAtual = await getSeguimentoStatus(session.user.id, userId)
  if (statusAtual === 'APROVADO' || statusAtual === 'PENDENTE') {
    return { ok: true, status: statusAtual }
  }

  // Seguimento.tenantContextoId é FK obrigatória: sem tenant real do ator
  // (torcedor global), tenta a Comunidade Nacional dele (afiliação com
  // onboarding concluído); depois o tenant do alvo; por fim a CN do alvo.
  // Cobre também torcedor global seguindo torcedor global.
  let tenantContextoId = tenant?.id ?? null
  if (!tenantContextoId) {
    tenantContextoId = await resolveTenantIdPortalComunidade(session.user.id, session.user.email)
  }
  if (!tenantContextoId) {
    const vinculoAlvo: { tenant: { id: string } } | null = await db.saasMembro.findFirst({
      where: { userId, status: 'APROVADO' },
      orderBy: { criadoEm: 'desc' },
      select: { tenant: { select: { id: true } } },
    })
    tenantContextoId = vinculoAlvo?.tenant.id ?? null
  }
  if (!tenantContextoId) {
    tenantContextoId = await resolveTenantIdPortalComunidade(userId, undefined)
  }
  if (!tenantContextoId) {
    return {
      ok: false,
      message:
        'Não é possível seguir outro torcedor sem torcida ainda — funcionalidade em desenvolvimento.',
    }
  }

  // Privacidade do ALVO no tenant do perfil dele — não no contexto do
  // seguidor. Torcedor global (CN) lia o sócio no tenant errado e tratava
  // perfil privado como público → APROVADO sem aprovação.
  const { perfilPrivado, tenantIdAlvo } = await getPerfilPrivadoEfetivoDoAlvo(
    userId,
    session.user.id,
  )
  const statusInicial = perfilPrivado ? 'PENDENTE' : 'APROVADO'

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
      // Inbox do seguido: tenant do perfil dele (não a CN do seguidor).
      tenantId: tenantIdAlvo ?? tenantContextoId,
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

  return { ok: true, status: statusInicial }
}

async function marcarNotificacoesSeguimentoPendentesLidas(
  userId: string,
  tenantId: string,
  atorId: string,
): Promise<void> {
  const { count } = await db.notificacao.updateMany({
    where: {
      userId,
      tenantId,
      atorId,
      tipo: 'SEGUIMENTO_PENDENTE',
      lida: false,
    },
    data: { lida: true },
  })
  if (count > 0) emitNotificacaoPing(tenantId, userId)
}

export async function aprovarSeguimento(seguimentoId: string): Promise<void> {
  const { session, tenant } = await getSessionAndPortalTenant()
  if (!session?.user?.id) throw new Error('Não autenticado')

  // Ownership por seguidoId basta: tenantContextoId é o contexto do SEGUIDOR
  // (pode ser CN / TO aliada) e não bate com o tenant ativo do destinatário.
  const seguimento = await db.seguimento.findFirst({
    where: { id: seguimentoId, seguidoId: session.user.id, status: 'PENDENTE' },
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
    where: { id: seguimentoId, seguidoId: session.user.id, status: 'PENDENTE' },
    select: { id: true, seguidorId: true, tenantContextoId: true },
  })
  if (!seguimento) throw new Error('Solicitação não encontrada')

  await db.seguimento.update({
    where: { id: seguimento.id },
    data: { status: 'REJEITADO' },
  })

  const tenantNotif = tenant?.id ?? seguimento.tenantContextoId
  await marcarNotificacoesSeguimentoPendentesLidas(
    session.user.id,
    tenantNotif,
    seguimento.seguidorId,
  )

  await criarNotificacao({
    userId: seguimento.seguidorId,
    tenantId: tenantNotif,
    tipo: 'SEGUIMENTO_REJEITADO',
    titulo: 'Pedido para seguir não aceito',
    corpo: `${session.user.name ?? 'Um membro'} não aceitou seu pedido para seguir.`,
    atorId: session.user.id,
  })

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
  exibirNumeroSocioNoFeed?: boolean
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

/**
 * Sincroniza (best-effort) a cor do tenant sintético da Comunidade Nacional
 * com a paleta extraída do escudo do clube no client, para clubes fora do
 * catálogo curado (`CLUBE_PALETAS`). Silenciosa e idempotente: só aplica se
 * o tenant sintético ainda estiver no roxo de fábrica (nenhum torcedor já
 * sincronizou nem há paleta curada aplicada).
 */
export async function sincronizarPaletaComunidadeNacional(
  afiliacaoId: string,
  hexes: string[],
): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return

  const parsed = paletaExtraidaSchema.safeParse({ afiliacaoId, hexes })
  if (!parsed.success) return

  const afiliacao: { slug: string | null } | null = await db.afiliacao.findUnique({
    where: { id: parsed.data.afiliacaoId },
    select: { slug: true },
  })
  if (!afiliacao) return

  const slugReservado = `${afiliacao.slug ?? parsed.data.afiliacaoId}-nacional`
  const tenant: { id: string; corPrimaria: string } | null = await db.tenant.findFirst({
    where: { slug: slugReservado, sintetico: true },
    select: { id: true, corPrimaria: true },
  })
  if (!tenant || !isCorPadraoPlataforma(tenant.corPrimaria)) return

  const [primary, secondary] = parsed.data.hexes
  await db.tenant.update({
    where: { id: tenant.id },
    data: { corPrimaria: primary, design: designFromPrimary(primary, secondary ?? null) },
  })
}

/** @deprecated Use atualizarPerfilSocial */
export async function atualizarPerfil(bio: string, perfilPrivado: boolean): Promise<void> {
  const { session, tenant } = await getSessionAndPortalTenant()
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')
  await assertMembroAtivo(tenant.id, session.user.id)
  const parsed = perfilSchema.safeParse({ bio, perfilPrivado })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Perfil inválido')
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

/**
 * Autor do próprio post — cobre torcida real e tenant sintético da CN
 * (`publicarPostNacional`). Não filtrar por `tenantId` do cookie ativo: o post
 * da CN vive no sintético e o sócio opera com a unidade real ativa.
 */
async function assertMutacaoProprioPost(
  postId: string,
  opts?: { exigirVisivel?: boolean },
): Promise<{
  session: Session
  post: {
    id: string
    tenantId: string
    midiaUrls: string[]
    fixado: boolean
    tipo: string
  }
  afiliacaoId: string | null
}> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const post: {
    id: string
    tenantId: string
    midiaUrls: string[]
    fixado: boolean
    oculto: boolean
    tipo: string
    tenant: { sintetico: boolean; afiliacaoId: string | null }
  } | null = await db.post.findFirst({
    where: { id: postId, autorId: session.user.id },
    select: {
      id: true,
      tenantId: true,
      midiaUrls: true,
      fixado: true,
      oculto: true,
      tipo: true,
      tenant: { select: { sintetico: true, afiliacaoId: true } },
    },
  })
  if (!post || (opts?.exigirVisivel && post.oculto)) {
    throw new ExpectedError('Post não encontrado')
  }

  if (post.tenant.sintetico) {
    const { afiliacaoId } = await assertComunidadeNacional()
    if (post.tenant.afiliacaoId !== afiliacaoId) {
      throw new ExpectedError('Post não encontrado')
    }
    return {
      session,
      post: {
        id: post.id,
        tenantId: post.tenantId,
        midiaUrls: post.midiaUrls,
        fixado: post.fixado,
        tipo: post.tipo,
      },
      afiliacaoId,
    }
  }

  const { tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)
  if (post.tenantId !== tenant.id) {
    throw new ExpectedError('Post não encontrado')
  }
  return {
    session,
    post: {
      id: post.id,
      tenantId: post.tenantId,
      midiaUrls: post.midiaUrls,
      fixado: post.fixado,
      tipo: post.tipo,
    },
    afiliacaoId: tenant.afiliacaoId,
  }
}

/**
 * Edita a publicação própria. `midias` é a lista final de anexos não sociais
 * (imagem/vídeo/sticker) da edição inline — omitir mantém os anexos atuais.
 * O embed social continua derivado do texto.
 */
export async function editarPost(
  postId: string,
  conteudo: string,
  midias?: string[],
): Promise<void> {
  const parsed = editarPostSchema.safeParse({ postId, conteudo })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Post inválido')

  const parsedMidias = z
    .array(midiaUrlSchema)
    .max(MAX_MIDIAS, 'Máximo de 10 anexos')
    .optional()
    .safeParse(midias)
  if (!parsedMidias.success) {
    throw new ExpectedError(parsedMidias.error.issues[0]?.message ?? 'Anexo inválido')
  }

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) throw new Error(erroMencoes)

  const { session, post, afiliacaoId } = await assertMutacaoProprioPost(parsed.data.postId, {
    exigirVisivel: true,
  })

  const midiasFinais = parsedMidias.data
    ? midiasComEmbedDoTexto(
        parsed.data.conteudo,
        parsedMidias.data.filter((url) => !isSocialUrl(url)),
        MAX_MIDIAS,
      )
    : midiasAposEditarConteudo(parsed.data.conteudo, post.midiaUrls)

  await db.post.update({
    where: { id: post.id },
    data: { conteudo: parsed.data.conteudo, midiaUrls: midiasFinais },
  })

  await db.auditLog.create({
    data: {
      tenantId: post.tenantId,
      atorId: session.user.id,
      acao: 'POST_SOCIAL_EDITADO',
      entidade: 'Post',
      entidadeId: post.id,
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
  invalidarLeituraComunidade(post.tenantId, afiliacaoId)
}

export async function excluirPost(postId: string): Promise<void> {
  const { session, post, afiliacaoId } = await assertMutacaoProprioPost(postId)

  await db.post.update({
    where: { id: post.id },
    data: { oculto: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: post.tenantId,
      atorId: session.user.id,
      acao: 'POST_SOCIAL_EXCLUIDO',
      entidade: 'Post',
      entidadeId: post.id,
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
  invalidarLeituraComunidade(post.tenantId, afiliacaoId)
}

export interface ComentarioPostItem {
  id: string
  conteudo: string
  criadoEm: string
  autor: { id: string; nome: string | null; avatarUrl: string | null }
}

export async function listarComentariosPost(postId: string): Promise<ComentarioPostItem[]> {
  // Aplica primeiro o mesmo alcance de tenant do feed/permalink. Dentro desse
  // alcance vale a escada do post; privacidade de perfil não participa do gate.
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')
  const parsed = z.string().uuid().safeParse(postId)
  if (!parsed.success) throw new ExpectedError('Post não encontrado')

  const post: {
    id: string
    autorId: string
    tenantId: string
    visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
    oculto: boolean
  } | null = await db.post.findUnique({
    where: { id: parsed.data },
    select: { id: true, autorId: true, tenantId: true, visibilidade: true, oculto: true },
  })
  if (!post || post.oculto) throw new Error('Post não encontrado')

  const viewerId = session.user.id
  const ehAutor = viewerId === post.autorId
  let tenantNoAlcance = ehAutor
  if (!tenantNoAlcance) {
    // Torcedor/sócio APROVADO no tenant do post (mural da unidade via convite).
    if (await vinculoAprovadoNoTenant(viewerId, post.tenantId)) {
      tenantNoAlcance = true
    } else {
      const viewerTenantId = await resolveTenantIdPortalComunidade(viewerId, session.user.email)
      if (viewerTenantId === post.tenantId) {
        tenantNoAlcance = true
      } else if (viewerTenantId) {
        const tenantIdsVisiveis = await resolveVisibleTenantIdsForFeed(viewerTenantId, viewerId)
        tenantNoAlcance = tenantIdsVisiveis.includes(post.tenantId)
      }
    }
  }
  if (!tenantNoAlcance) throw new Error('Post não encontrado')

  let podeVer = ehAutor || post.visibilidade === 'PUBLICO'
  if (!podeVer && post.visibilidade === 'TENANT') {
    // Sócio (feed sócios) OU qualquer vínculo APROVADO — o mural da unidade
    // já mostra TENANT ao torcedor inscrito no canal; comentários seguem.
    podeVer =
      (await podeVerFeedSocios(viewerId, post.tenantId)) ||
      (await vinculoAprovadoNoTenant(viewerId, post.tenantId))
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
    where: { postId: parsed.data },
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
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Comentário inválido')

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
        tipo: true,
        comunicadoOrigemId: true,
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
      avatarUrl: await getAvatarAtualDoUsuario(viewerId),
    },
  }
}

export async function editarComentario(
  comentarioId: string,
  conteudo: string,
): Promise<ComentarioPostItem> {
  const parsed = editarComentarioSchema.safeParse({ comentarioId, conteudo })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Comentário inválido')

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) throw new Error(erroMencoes)

  const { session, viewerId, tenantId } = await resolverContextoEngajamento()

  const existente: {
    id: string
    postId: string
    conteudo: string
    criadoEm: Date
  } | null = await db.comentario.findFirst({
    where: { id: parsed.data.comentarioId, autorId: viewerId },
    select: { id: true, postId: true, conteudo: true, criadoEm: true },
  })
  if (!existente) throw new Error('Comentário não encontrado')

  const atualizado: { id: string; conteudo: string; criadoEm: Date } = await db.comentario.update({
    where: { id: existente.id },
    data: { conteudo: parsed.data.conteudo },
    select: { id: true, conteudo: true, criadoEm: true },
  })

  if (tenantId) {
    after(() => {
      void db.auditLog
        .create({
          data: {
            tenantId,
            atorId: viewerId,
            acao: 'POST_COMENTARIO_EDITADO',
            entidade: 'Comentario',
            entidadeId: atualizado.id,
            detalhes: { postId: existente.postId },
          },
        })
        .catch(() => undefined)
    })
  }

  return {
    id: atualizado.id,
    conteudo: atualizado.conteudo,
    criadoEm: atualizado.criadoEm.toISOString(),
    autor: {
      id: viewerId,
      nome: session.user.name ?? null,
      avatarUrl: await getAvatarAtualDoUsuario(viewerId),
    },
  }
}

export async function excluirComentario(comentarioId: string): Promise<void> {
  const id = z.string().min(1).safeParse(comentarioId)
  if (!id.success) throw new Error('Comentário inválido')

  const { viewerId, tenantId } = await resolverContextoEngajamento()

  const existente: { id: string; postId: string } | null = await db.comentario.findFirst({
    where: { id: id.data, autorId: viewerId },
    select: { id: true, postId: true },
  })
  if (!existente) throw new Error('Comentário não encontrado')

  await db.comentario.delete({ where: { id: existente.id } })

  if (tenantId) {
    after(() => {
      void db.auditLog
        .create({
          data: {
            tenantId,
            atorId: viewerId,
            acao: 'POST_COMENTARIO_EXCLUIDO',
            entidade: 'Comentario',
            entidadeId: existente.id,
            detalhes: { postId: existente.postId },
          },
        })
        .catch(() => undefined)
    })
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

  const erroPerfil = await erroPublicoComPerfilPrivado(
    session.user.id,
    tenant.id,
    parsed.data.visibilidade,
  )
  if (erroPerfil) return { message: erroPerfil }

  const alcanceNacional = await resolverAlcanceNacional(
    session.user.id,
    tenant.id,
    parsed.data.visibilidade,
  )

  const midiasFinais = midiasComEmbedDoTexto(parsed.data.conteudo, [], MAX_MIDIAS)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: parsed.data.conteudo,
      midiaUrls: midiasFinais,
      tipo: 'MEMBRO',
      visibilidade: parsed.data.visibilidade,
      alcanceNacional,
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
    preview: await previewDoPost({
      post,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      autorAvatar: await getAvatarAtualDoUsuario(session.user.id),
      tenantNome: tenant.nome,
    }),
  }
}

export async function votarEnquetePost(enqueteId: string, opcaoId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = votarEnqueteSchema.safeParse({ enqueteId, opcaoId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Voto inválido')

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

  const visibleIds = await resolveVisibleTenantIdsForFeed(tenant.id, session.user.id)
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
  const { session, post, afiliacaoId } = await assertMutacaoProprioPost(postId, {
    exigirVisivel: true,
  })
  if (post.tipo !== 'MEMBRO') throw new ExpectedError('Post não encontrado')

  if (!post.fixado) {
    const fixados = await db.post.count({
      where: {
        autorId: session.user.id,
        tenantId: post.tenantId,
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
      tenantId: post.tenantId,
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
  invalidarLeituraComunidade(post.tenantId, afiliacaoId)
}

export async function salvarPost(postId: string): Promise<void> {
  const parsed = z.string().uuid().safeParse(postId)
  if (!parsed.success) throw new ExpectedError('Post não encontrado')

  const [ctx, post] = await Promise.all([
    resolverContextoEngajamento(),
    db.post.findUnique({
      where: { id: parsed.data },
      select: {
        id: true,
        autorId: true,
        tenantId: true,
        oculto: true,
        visibilidade: true,
        tipo: true,
        comunicadoOrigemId: true,
        tenant: { select: { afiliacaoId: true, sintetico: true } },
      },
    }) as Promise<PostEngajavelLite | null>,
  ])

  if (!post || !(await podeEngajarPostVisivel(ctx, post))) {
    throw new Error('Post não encontrado')
  }

  const tenantIdSalvo = ctx.tenantId ?? post.tenantId
  await db.postSalvo.upsert({
    where: { userId_postId: { userId: ctx.viewerId, postId: post.id } },
    create: { userId: ctx.viewerId, postId: post.id, tenantId: tenantIdSalvo },
    update: {},
  })

  revalidatePath('/portal/comunidade/salvos')
}

export async function removerPostSalvo(postId: string): Promise<void> {
  const ctx = await resolverContextoEngajamento()
  const parsed = z.string().uuid().safeParse(postId)
  if (!parsed.success) throw new ExpectedError('Post não encontrado')

  await db.postSalvo.deleteMany({
    where: { userId: ctx.viewerId, postId: parsed.data },
  })

  revalidatePath('/portal/comunidade/salvos')
}

export async function repostarPost(postId: string, comentario?: string): Promise<void> {
  // Compartilhar = republicar: só sócio com community:post. Torcedor curte,
  // comenta e salva — não abre o próprio feed com repost.
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = repostarSchema.safeParse({ postId, comentario })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Repost inválido')

  const visibleIds = await resolveVisibleTenantIdsForFeed(tenant.id, session.user.id)
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
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Repost inválido')

  const visibleIds = await resolveVisibleTenantIdsForFeed(tenant.id, session.user.id)
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

  const erroPerfil = await erroPublicoComPerfilPrivado(
    session.user.id,
    tenant.id,
    parsed.data.visibilidade,
  )
  if (erroPerfil) return { message: erroPerfil }

  const alcanceNacional = await resolverAlcanceNacional(
    session.user.id,
    tenant.id,
    parsed.data.visibilidade,
  )

  const midiasFinais = midiasComEmbedDoTexto(parsed.data.conteudo, [], MAX_MIDIAS)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: parsed.data.conteudo,
      midiaUrls: midiasFinais,
      tipo: 'MEMBRO',
      visibilidade: parsed.data.visibilidade,
      alcanceNacional,
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
    preview: await previewDoPost({
      post,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      autorAvatar: await getAvatarAtualDoUsuario(session.user.id),
      tenantNome: tenant.nome,
    }),
  }
}

/**
 * Sócio com tenant real usa `GROUPS_CREATE` no tenant ativo. Sem tenant (ou
 * sem permissão) — fallback para a Comunidade Nacional do clube
 * (`tenantId = tenantSintetico.id`), mesmo critério de acesso de
 * `assertComunidadeNacional`.
 */
export async function criarGrupo(
  nome: string,
  descricao?: string,
  publica = true,
): Promise<{ id: string }> {
  const parsed = criarGrupoSchema.safeParse({ nome, descricao, publica })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Grupo inválido')

  // O fallback para a CN é um `catch` do gate de permissão — sem esta trava, a
  // recusa do modo operador cairia justamente nele e a ação passaria.
  await assertNaoOperador()

  let session: Session
  let tenantId: string

  try {
    const ctx = await assertPermission(PERMISSIONS.GROUPS_CREATE)
    await assertMembroAtivo(ctx.tenant.id, ctx.session.user.id)
    session = ctx.session
    tenantId = ctx.tenant.id
  } catch {
    const nacional = await assertComunidadeNacional()
    session = nacional.session
    tenantId = nacional.tenantSintetico.id
  }

  const conversa: { id: string } = await db.conversa.create({
    data: {
      tipo: 'GRUPO',
      tenantId,
      nome: parsed.data.nome,
      descricao: parsed.data.descricao?.trim() || null,
      publica: parsed.data.publica,
      comunidade: true,
      somenteAdminPublica: false,
      criadoPorId: session.user.id,
      membros: {
        create: { userId: session.user.id, papel: 'ADMIN', status: 'ATIVO' },
      },
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId,
      atorId: session.user.id,
      acao: 'GRUPO_CRIADO',
      entidade: 'Conversa',
      entidadeId: conversa.id,
      detalhes: { publica: parsed.data.publica, nome: parsed.data.nome },
    },
  })

  revalidatePath('/portal/comunidade/grupos')
  return conversa
}

/** @deprecated Use criarGrupo */
export async function criarGrupoPublico(nome: string, descricao?: string): Promise<{ id: string }> {
  return criarGrupo(nome, descricao, true)
}

export async function atualizarGrupo(input: {
  conversaId: string
  nome: string
  descricao?: string | null
  publica: boolean
  avatarUrl?: string | null
  somenteAdminPublica?: boolean
}): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = atualizarGrupoSchema.safeParse(input)
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  if (parsed.data.avatarUrl != null && !isCloudinaryUrl(parsed.data.avatarUrl)) {
    throw new Error('Foto do grupo inválida.')
  }

  const admin: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: parsed.data.conversaId,
      userId: session.user.id,
      papel: 'ADMIN',
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (!admin) throw new Error('Só administradores podem editar o grupo.')

  const grupo: { id: string } | null = await db.conversa.findFirst({
    where: {
      id: parsed.data.conversaId,
      tenantId: tenant.id,
      tipo: 'GRUPO',
      comunidade: true,
    },
    select: { id: true },
  })
  if (!grupo) throw new Error('Grupo não encontrado')

  const descricao =
    parsed.data.descricao == null || parsed.data.descricao.trim() === ''
      ? null
      : parsed.data.descricao.trim()

  await db.conversa.update({
    where: { id: grupo.id },
    data: {
      nome: parsed.data.nome,
      descricao,
      publica: parsed.data.publica,
      ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl } : {}),
      ...(parsed.data.somenteAdminPublica !== undefined
        ? { somenteAdminPublica: parsed.data.somenteAdminPublica }
        : {}),
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'GRUPO_ATUALIZADO',
      entidade: 'Conversa',
      entidadeId: grupo.id,
      detalhes: {
        nome: parsed.data.nome,
        publica: parsed.data.publica,
        avatar: parsed.data.avatarUrl !== undefined,
        somenteAdminPublica: parsed.data.somenteAdminPublica,
      },
    },
  })

  revalidatePath('/portal/comunidade/grupos')
  revalidatePath(`/portal/comunidade/grupos/${grupo.id}`)
  revalidatePath('/portal/comunidade')
}

export async function alterarPapelGrupo(
  conversaId: string,
  userId: string,
  papel: 'ADMIN' | 'MEMBRO',
): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = alterarPapelGrupoSchema.safeParse({ conversaId, userId, papel })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const admin: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: parsed.data.conversaId,
      userId: session.user.id,
      papel: 'ADMIN',
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (!admin) throw new Error('Só administradores podem alterar papéis.')

  const grupo: { id: string; nome: string | null } | null = await db.conversa.findFirst({
    where: {
      id: parsed.data.conversaId,
      tenantId: tenant.id,
      tipo: 'GRUPO',
      comunidade: true,
    },
    select: { id: true, nome: true },
  })
  if (!grupo) throw new Error('Grupo não encontrado')

  const alvo: { id: string; papel: 'ADMIN' | 'MEMBRO' } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: grupo.id,
      userId: parsed.data.userId,
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true, papel: true },
  })
  if (!alvo) throw new Error('Membro não encontrado neste grupo.')
  if (alvo.papel === parsed.data.papel) return

  if (parsed.data.papel === 'MEMBRO' && alvo.papel === 'ADMIN') {
    const outrosAdmins: number = await db.membroConversa.count({
      where: {
        conversaId: grupo.id,
        papel: 'ADMIN',
        status: 'ATIVO',
        saiuEm: null,
        userId: { not: parsed.data.userId },
      },
    })
    if (outrosAdmins === 0) {
      throw new Error('O grupo precisa de pelo menos um administrador.')
    }
  }

  await db.membroConversa.update({
    where: { id: alvo.id },
    data: { papel: parsed.data.papel },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: parsed.data.papel === 'ADMIN' ? 'GRUPO_ADMIN_PROMOVIDO' : 'GRUPO_ADMIN_REBAIXADO',
      entidade: 'MembroConversa',
      entidadeId: alvo.id,
      detalhes: {
        conversaId: grupo.id,
        userId: parsed.data.userId,
        papel: parsed.data.papel,
      },
    },
  })

  if (parsed.data.papel === 'ADMIN' && parsed.data.userId !== session.user.id) {
    await notificarSafe({
      userId: parsed.data.userId,
      tenantId: tenant.id,
      tipo: 'GRUPO_ADMIN',
      titulo: `Você agora é admin de ${grupo.nome ?? 'um grupo'}`,
      corpo: 'Pode gerenciar membros, pedidos e configurações.',
      link: `/portal/comunidade/grupos/${grupo.id}?tab=config`,
      atorId: session.user.id,
    })
  }

  revalidatePath(`/portal/comunidade/grupos/${grupo.id}`)
  revalidatePath('/portal/comunidade/grupos')
}

export async function removerMembroGrupo(conversaId: string, userId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = removerMembroGrupoSchema.safeParse({ conversaId, userId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')
  if (parsed.data.userId === session.user.id) {
    throw new Error('Use Sair para deixar o grupo.')
  }

  const admin: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: parsed.data.conversaId,
      userId: session.user.id,
      papel: 'ADMIN',
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (!admin) throw new Error('Só administradores podem remover membros.')

  const grupo: { id: string; nome: string | null } | null = await db.conversa.findFirst({
    where: {
      id: parsed.data.conversaId,
      tenantId: tenant.id,
      tipo: 'GRUPO',
      comunidade: true,
    },
    select: { id: true, nome: true },
  })
  if (!grupo) throw new Error('Grupo não encontrado')

  const alvo: { id: string; papel: 'ADMIN' | 'MEMBRO' } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: grupo.id,
      userId: parsed.data.userId,
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true, papel: true },
  })
  if (!alvo) throw new Error('Membro não encontrado neste grupo.')

  if (alvo.papel === 'ADMIN') {
    const outrosAdmins: number = await db.membroConversa.count({
      where: {
        conversaId: grupo.id,
        papel: 'ADMIN',
        status: 'ATIVO',
        saiuEm: null,
        userId: { not: parsed.data.userId },
      },
    })
    if (outrosAdmins === 0) {
      throw new Error('Não é possível remover o único administrador.')
    }
  }

  await db.membroConversa.update({
    where: { id: alvo.id },
    data: { saiuEm: new Date(), papel: 'MEMBRO' },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'GRUPO_MEMBRO_REMOVIDO',
      entidade: 'MembroConversa',
      entidadeId: alvo.id,
      detalhes: { conversaId: grupo.id, userId: parsed.data.userId },
    },
  })

  await notificarSafe({
    userId: parsed.data.userId,
    tenantId: tenant.id,
    tipo: 'GRUPO_REMOVIDO',
    titulo: `Você foi removido de ${grupo.nome ?? 'um grupo'}`,
    corpo: 'Um administrador removeu sua participação.',
    link: '/portal/comunidade/grupos',
    atorId: session.user.id,
  })

  revalidatePath(`/portal/comunidade/grupos/${grupo.id}`)
  revalidatePath('/portal/comunidade/grupos')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/mensagens')
}

export async function gerarCodigoConviteGrupo(conversaId: string): Promise<{ codigo: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = conversaGrupoIdSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const admin: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: parsed.data.conversaId,
      userId: session.user.id,
      papel: 'ADMIN',
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (!admin) throw new Error('Só administradores podem gerar convite.')

  const grupo: { id: string } | null = await db.conversa.findFirst({
    where: {
      id: parsed.data.conversaId,
      tenantId: tenant.id,
      tipo: 'GRUPO',
      comunidade: true,
    },
    select: { id: true },
  })
  if (!grupo) throw new Error('Grupo não encontrado')

  let codigo: string | null = null
  for (let i = 0; i < 5; i++) {
    const candidate = generateInviteSlug()
    const existing: { id: string } | null = await db.conversa.findFirst({
      where: { codigoConvite: candidate },
      select: { id: true },
    })
    if (!existing) {
      codigo = candidate
      break
    }
  }
  if (!codigo) throw new Error('Não foi possível gerar o convite.')

  await db.conversa.update({
    where: { id: grupo.id },
    data: { codigoConvite: codigo },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'GRUPO_CONVITE_GERADO',
      entidade: 'Conversa',
      entidadeId: grupo.id,
      detalhes: { codigo },
    },
  })

  revalidatePath(`/portal/comunidade/grupos/${grupo.id}`)
  return { codigo }
}

export async function revogarCodigoConviteGrupo(conversaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = conversaGrupoIdSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const admin: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: parsed.data.conversaId,
      userId: session.user.id,
      papel: 'ADMIN',
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (!admin) throw new Error('Só administradores podem revogar o convite.')

  const grupo: { id: string } | null = await db.conversa.findFirst({
    where: {
      id: parsed.data.conversaId,
      tenantId: tenant.id,
      tipo: 'GRUPO',
      comunidade: true,
    },
    select: { id: true },
  })
  if (!grupo) throw new Error('Grupo não encontrado')

  await db.conversa.update({
    where: { id: grupo.id },
    data: { codigoConvite: null },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'GRUPO_CONVITE_REVOGADO',
      entidade: 'Conversa',
      entidadeId: grupo.id,
    },
  })

  revalidatePath(`/portal/comunidade/grupos/${grupo.id}`)
}

export async function entrarPorConviteGrupo(codigo: string): Promise<{ id: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = entrarPorConviteGrupoSchema.safeParse({ codigo })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Convite inválido')

  const conversa: { id: string; nome: string | null } | null = await db.conversa.findFirst({
    where: {
      codigoConvite: parsed.data.codigo,
      tenantId: tenant.id,
      tipo: 'GRUPO',
      comunidade: true,
    },
    select: { id: true, nome: true },
  })
  if (!conversa) throw new Error('Convite inválido ou expirado.')

  const ativoExistente: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: conversa.id,
      userId: session.user.id,
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (ativoExistente) return { id: conversa.id }

  const ativos: number = await db.membroConversa.count({
    where: { conversaId: conversa.id, status: 'ATIVO', saiuEm: null },
  })
  if (ativos >= MAX_MEMBROS_GRUPO) {
    throw new Error(`Grupo cheio (máximo ${MAX_MEMBROS_GRUPO} membros).`)
  }

  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId: conversa.id, userId: session.user.id } },
    create: {
      conversaId: conversa.id,
      userId: session.user.id,
      papel: 'MEMBRO',
      status: 'ATIVO',
    },
    update: { saiuEm: null, status: 'ATIVO', papel: 'MEMBRO' },
  })

  await backfillTimelineDoGrupoParaViewer(session.user.id, conversa.id)

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'GRUPO_ENTRADA_CONVITE',
      entidade: 'Conversa',
      entidadeId: conversa.id,
      detalhes: { codigo: parsed.data.codigo },
    },
  })

  revalidatePath('/portal/comunidade/grupos')
  revalidatePath(`/portal/comunidade/grupos/${conversa.id}`)
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/mensagens')
  return { id: conversa.id }
}

export async function ocultarPostGrupo(postId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = ocultarPostGrupoSchema.safeParse({ postId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Post inválido')

  const post: {
    id: string
    conversaId: string | null
    oculto: boolean
  } | null = await db.post.findFirst({
    where: { id: parsed.data.postId, tenantId: tenant.id },
    select: { id: true, conversaId: true, oculto: true },
  })
  if (!post || post.oculto) throw new Error('Post não encontrado')
  if (!post.conversaId) throw new Error('Este post não pertence a um grupo.')

  const admin: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: post.conversaId,
      userId: session.user.id,
      papel: 'ADMIN',
      status: 'ATIVO',
      saiuEm: null,
      conversa: { tipo: 'GRUPO', comunidade: true, tenantId: tenant.id },
    },
    select: { id: true },
  })
  if (!admin) throw new Error('Só administradores do grupo podem moderar o mural.')

  await db.post.update({
    where: { id: post.id },
    data: { oculto: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'GRUPO_POST_OCULTO',
      entidade: 'Post',
      entidadeId: post.id,
      detalhes: { conversaId: post.conversaId },
    },
  })

  revalidatePath(`/portal/comunidade/grupos/${post.conversaId}`)
  revalidatePath('/portal/comunidade')
  invalidarLeituraComunidade(tenant.id)
}

export async function entrarGrupoPublico(conversaId: string): Promise<void> {
  await assertNaoOperador()

  let session: Session
  let tenantId: string

  try {
    const ctx = await assertPermission(PERMISSIONS.MESSAGES_SEND)
    await assertMembroAtivo(ctx.tenant.id, ctx.session.user.id)
    session = ctx.session
    tenantId = ctx.tenant.id
  } catch {
    const nacional = await assertComunidadeNacional()
    session = nacional.session
    tenantId = nacional.tenantSintetico.id
  }

  const conversa: { id: string } | null = await db.conversa.findFirst({
    where: {
      id: conversaId,
      tenantId,
      tipo: 'GRUPO',
      publica: true,
      comunidade: true,
    },
    select: { id: true },
  })
  if (!conversa) throw new Error('Grupo não encontrado')

  const ativos: number = await db.membroConversa.count({
    where: { conversaId, status: 'ATIVO', saiuEm: null },
  })
  if (ativos >= MAX_MEMBROS_GRUPO) {
    throw new Error(`Grupo cheio (máximo ${MAX_MEMBROS_GRUPO} membros).`)
  }

  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId, userId: session.user.id } },
    create: {
      conversaId,
      userId: session.user.id,
      papel: 'MEMBRO',
      status: 'ATIVO',
    },
    update: { saiuEm: null, status: 'ATIVO' },
  })

  await backfillTimelineDoGrupoParaViewer(session.user.id, conversaId)

  revalidatePath('/portal/comunidade/grupos')
  revalidatePath(`/portal/comunidade/grupos/${conversaId}`)
  revalidatePath('/portal/mensagens')
  revalidatePath('/portal/comunidade')
}

export async function pedirEntradaGrupo(conversaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = pedirEntradaGrupoSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Pedido inválido')

  const conversa: { id: string; nome: string | null; publica: boolean } | null =
    await db.conversa.findFirst({
      where: {
        id: parsed.data.conversaId,
        tenantId: tenant.id,
        tipo: 'GRUPO',
        comunidade: true,
      },
      select: { id: true, nome: true, publica: true },
    })
  if (!conversa) throw new Error('Grupo não encontrado')
  if (conversa.publica) throw new Error('Este grupo é público — use Entrar.')

  const existente: {
    status: string
    saiuEm: Date | null
  } | null = await db.membroConversa.findUnique({
    where: {
      conversaId_userId: { conversaId: conversa.id, userId: session.user.id },
    },
    select: { status: true, saiuEm: true },
  })
  if (existente?.status === 'ATIVO' && !existente.saiuEm) {
    throw new Error('Você já é membro deste grupo.')
  }
  if (existente?.status === 'PENDENTE' && !existente.saiuEm) {
    throw new Error('Pedido já enviado — aguarde a aprovação.')
  }

  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId: conversa.id, userId: session.user.id } },
    create: {
      conversaId: conversa.id,
      userId: session.user.id,
      papel: 'MEMBRO',
      status: 'PENDENTE',
    },
    update: { status: 'PENDENTE', saiuEm: null, papel: 'MEMBRO' },
  })

  const admins: Array<{ userId: string }> = await db.membroConversa.findMany({
    where: {
      conversaId: conversa.id,
      papel: 'ADMIN',
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { userId: true },
  })

  const nomeGrupo = conversa.nome ?? 'grupo'
  await Promise.all(
    admins
      .filter((a) => a.userId !== session.user.id)
      .map((a) =>
        notificarSafe({
          userId: a.userId,
          tenantId: tenant.id,
          tipo: 'GRUPO_PEDIDO',
          titulo: 'Pedido para entrar no grupo',
          corpo: `${session.user.name ?? 'Um membro'} pediu para entrar em ${nomeGrupo}.`,
          link: `/portal/comunidade/grupos/${conversa.id}?tab=membros`,
          atorId: session.user.id,
        }),
      ),
  )

  revalidatePath('/portal/comunidade/grupos')
  revalidatePath(`/portal/comunidade/grupos/${conversa.id}`)
}

export async function decidirPedidoGrupo(
  conversaId: string,
  userId: string,
  aprovar: boolean,
): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = decidirPedidoGrupoSchema.safeParse({ conversaId, userId, aprovar })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Decisão inválida')

  const admin: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: parsed.data.conversaId,
      userId: session.user.id,
      papel: 'ADMIN',
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (!admin) throw new Error('Só administradores do grupo podem decidir pedidos.')

  const conversa: { id: string; nome: string | null } | null = await db.conversa.findFirst({
    where: {
      id: parsed.data.conversaId,
      tenantId: tenant.id,
      tipo: 'GRUPO',
      comunidade: true,
    },
    select: { id: true, nome: true },
  })
  if (!conversa) throw new Error('Grupo não encontrado')

  const pedido: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: conversa.id,
      userId: parsed.data.userId,
      status: 'PENDENTE',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (!pedido) throw new Error('Pedido não encontrado.')

  // O pedido foi decidido — o badge cai para TODOS os administradores do grupo
  // que o receberam, não só para quem decidiu (Achado 10).
  await reconciliarNotificacoesDoEvento(tenant.id, {
    tipo: 'GRUPO_PEDIDO',
    atorId: parsed.data.userId,
  })

  if (parsed.data.aprovar) {
    const ativos: number = await db.membroConversa.count({
      where: { conversaId: conversa.id, status: 'ATIVO', saiuEm: null },
    })
    if (ativos >= MAX_MEMBROS_GRUPO) {
      throw new Error(`Grupo cheio (máximo ${MAX_MEMBROS_GRUPO} membros).`)
    }

    await db.membroConversa.update({
      where: { id: pedido.id },
      data: { status: 'ATIVO', entrouEm: new Date() },
    })
    await backfillTimelineDoGrupoParaViewer(parsed.data.userId, conversa.id)

    await notificarSafe({
      userId: parsed.data.userId,
      tenantId: tenant.id,
      tipo: 'GRUPO_APROVADO',
      titulo: 'Entrada no grupo aprovada',
      corpo: `Você foi aceito em ${conversa.nome ?? 'um grupo'}.`,
      link: `/portal/comunidade/grupos/${conversa.id}`,
      atorId: session.user.id,
    })
  } else {
    await db.membroConversa.update({
      where: { id: pedido.id },
      data: { status: 'REJEITADO' },
    })
    await notificarSafe({
      userId: parsed.data.userId,
      tenantId: tenant.id,
      tipo: 'GRUPO_REJEITADO',
      titulo: 'Entrada no grupo recusada',
      corpo: `Seu pedido para ${conversa.nome ?? 'um grupo'} foi recusado.`,
      link: '/portal/comunidade/grupos',
      atorId: session.user.id,
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: parsed.data.aprovar ? 'GRUPO_PEDIDO_APROVADO' : 'GRUPO_PEDIDO_REJEITADO',
      entidade: 'MembroConversa',
      entidadeId: pedido.id,
      detalhes: { conversaId: conversa.id, userId: parsed.data.userId },
    },
  })

  revalidatePath(`/portal/comunidade/grupos/${conversa.id}`)
  revalidatePath('/portal/comunidade/grupos')
  revalidatePath('/portal/comunidade')
}

export async function sairGrupo(conversaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = sairGrupoSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const conversa: { id: string } | null = await db.conversa.findFirst({
    where: {
      id: parsed.data.conversaId,
      tenantId: tenant.id,
      tipo: 'GRUPO',
      comunidade: true,
    },
    select: { id: true },
  })
  if (!conversa) throw new Error('Grupo não encontrado')

  const membro: { id: string; papel: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: conversa.id,
      userId: session.user.id,
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true, papel: true },
  })
  if (!membro) throw new Error('Você não é membro deste grupo.')

  if (membro.papel === 'ADMIN') {
    const outrosAdmins: number = await db.membroConversa.count({
      where: {
        conversaId: conversa.id,
        papel: 'ADMIN',
        status: 'ATIVO',
        saiuEm: null,
        userId: { not: session.user.id },
      },
    })
    if (outrosAdmins === 0) {
      throw new Error('Transfira a administração antes de sair do grupo.')
    }
  }

  await db.membroConversa.update({
    where: { id: membro.id },
    data: { saiuEm: new Date() },
  })

  revalidatePath(`/portal/comunidade/grupos/${conversa.id}`)
  revalidatePath('/portal/comunidade/grupos')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/mensagens')
}

export async function alternarSilencioGrupo(conversaId: string): Promise<{ silenciada: boolean }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = alternarSilencioGrupoSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const membro: { id: string; silenciada: boolean } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: parsed.data.conversaId,
      userId: session.user.id,
      status: 'ATIVO',
      saiuEm: null,
      conversa: { tenantId: tenant.id, tipo: 'GRUPO', comunidade: true },
    },
    select: { id: true, silenciada: true },
  })
  if (!membro) throw new Error('Você não é membro deste grupo.')

  const silenciada = !membro.silenciada
  await db.membroConversa.update({
    where: { id: membro.id },
    data: { silenciada },
  })

  revalidatePath(`/portal/comunidade/grupos/${parsed.data.conversaId}`)
  revalidatePath('/portal/comunidade')
  return { silenciada }
}

export async function publicarPostGrupo(
  conversaId: string,
  conteudo: string,
): Promise<{ success: boolean; message?: string; preview?: PostPublicadoPreview }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = publicarPostGrupoSchema.safeParse({ conversaId, conteudo })
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const membro: { id: string; papel: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: parsed.data.conversaId,
      userId: session.user.id,
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true, papel: true },
  })
  if (!membro) return { success: false, message: 'Você precisa ser membro do grupo.' }

  const conversa: {
    id: string
    tipo: string
    somenteAdminPublica: boolean
  } | null = await db.conversa.findFirst({
    where: {
      id: parsed.data.conversaId,
      tenantId: tenant.id,
      tipo: 'GRUPO',
      comunidade: true,
    },
    select: { id: true, tipo: true, somenteAdminPublica: true },
  })
  if (!conversa) return { success: false, message: 'Grupo não encontrado.' }

  if (conversa.somenteAdminPublica && membro.papel !== 'ADMIN') {
    return { success: false, message: 'Só administradores podem publicar neste grupo.' }
  }

  const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
  if (erroMencoes) return { success: false, message: erroMencoes }

  await getOrCreatePerfilMembro(session.user.id, tenant.id)

  const midiasFinais = midiasComEmbedDoTexto(parsed.data.conteudo, [], MAX_MIDIAS)

  const post = await db.post.create({
    data: {
      tenantId: tenant.id,
      autorId: session.user.id,
      conteudo: parsed.data.conteudo,
      midiaUrls: midiasFinais,
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
    materializarTimelineAutor({
      postId: post.id,
      autorId: session.user.id,
      criadoEm: post.criadoEm,
    }),
    fanoutPostParaMembrosGrupo(conversa.id, {
      postId: post.id,
      autorId: session.user.id,
      criadoEm: post.criadoEm,
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
  revalidatePath('/portal/comunidade')

  return {
    success: true,
    preview: await previewDoPost({
      post: {
        id: post.id,
        tenantId: post.tenantId,
        conteudo: post.conteudo,
        midiaUrls: post.midiaUrls,
        visibilidade: post.visibilidade,
        criadoEm: post.criadoEm,
      },
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      autorAvatar: await getAvatarAtualDoUsuario(session.user.id),
      tenantNome: tenant.nome,
    }),
  }
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

/**
 * Painel "Gerenciar membros" — lazy no client ao abrir o modal (fora do SSR
 * do mural do canal).
 */
export async function carregarPainelMembrosCanal(conversaId: string): Promise<{
  membros: MembroCanalItem[]
  candidatos: CandidatoMembroCanalItem[]
}> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = pedirEntradaCanalSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Canal inválido')

  const canal = await getCanalPorId(parsed.data.conversaId, tenant.id, session.user.id)
  if (!canal) throw new ExpectedError('Canal não encontrado.')

  const efetivas = await permissoesEfetivas(session.user.id, canal.tenantId)
  const podeGerenciarMembros = await podeGerenciarPedidosCanal(canal, tenant.id, efetivas)
  const podeGerenciarAdmins = canal.souAdmin && !canal.canalOficial
  if (!podeGerenciarMembros && !podeGerenciarAdmins) {
    throw new ExpectedError('Sem permissão para gerenciar membros deste canal.')
  }

  const [membros, candidatos]: [MembroCanalItem[], CandidatoMembroCanalItem[]] = await Promise.all([
    listMembrosCanal(canal.id),
    podeGerenciarMembros
      ? listCandidatosMembroCanal(canal.tenantId, canal.id)
      : Promise.resolve([] as CandidatoMembroCanalItem[]),
  ])
  return { membros, candidatos }
}

/**
 * Painel "Pedidos pendentes" — lazy no client ao abrir o modal.
 */
export async function carregarPainelPedidosCanal(conversaId: string): Promise<{
  pedidos: PedidoCanalItem[]
  recusados: PedidoCanalItem[]
}> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = pedirEntradaCanalSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Canal inválido')

  const canal = await getCanalPorId(parsed.data.conversaId, tenant.id, session.user.id)
  if (!canal) throw new ExpectedError('Canal não encontrado.')
  if (canal.publica) throw new ExpectedError('Canal aberto não tem fila de pedidos.')

  const efetivas = await permissoesEfetivas(session.user.id, canal.tenantId)
  const pode = await podeGerenciarPedidosCanal(canal, tenant.id, efetivas)
  if (!pode) throw new ExpectedError('Sem permissão para decidir pedidos deste canal.')

  const [pedidos, recusados]: [PedidoCanalItem[], PedidoCanalItem[]] = await Promise.all([
    listPedidosCanal(canal.id, 'PENDENTE'),
    listPedidosCanal(canal.id, 'REJEITADO'),
  ])
  return { pedidos, recusados }
}

/**
 * Sócio/torcedor com tenant real: caminho normal (visibilidade cross-tenant
 * via `podeVerCanal`). Cai para a Comunidade Nacional quando o usuário não
 * tem tenant ativo, ou quando o canal é `PUBLICO` de uma unidade do mesmo
 * clube fora da relação de hierarquia/aliança do tenant do viewer (ex.: duas
 * torcidas do mesmo time sem vínculo entre si).
 */
export async function entrarCanal(conversaId: string): Promise<void> {
  const parsed = pedirEntradaCanalSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Canal inválido')

  // Operador navega canais sem entrar — virar membro é participação.
  await assertNaoOperador()

  if (await isConversaCanalDepartamento(parsed.data.conversaId)) {
    throw new ExpectedError(
      'Canal de departamento: a entrada é automática pelo cargo na equipe — não há inscrição.',
    )
  }

  let contexto: { session: Session; tenantId: string } | null = null
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
    await assertMembroAtivo(tenant.id, session.user.id)
    contexto = { session, tenantId: tenant.id }
  } catch {
    // Sem tenant ativo/membro ativo: tenta o contexto da Comunidade Nacional.
  }

  if (contexto) {
    const canal = await getCanalPorId(parsed.data.conversaId, contexto.tenantId, contexto.session.user.id)
    if (canal) {
      if (!canal.publica) throw new Error('Este canal não aceita novos inscritos.')
      await inscreverCanal(parsed.data.conversaId, contexto.session.user.id)
      revalidatePath('/portal/comunidade/canais')
      revalidatePath(linkCanalComunidade(parsed.data.conversaId))
      revalidatePath('/portal/mensagens')
      return
    }
  }

  const { session, afiliacaoId } = await assertComunidadeNacional()

  const canalNacional: {
    id: string
    visibilidadeCanal: string
    publica: boolean
    tenant: { afiliacaoId: string | null; sintetico: boolean }
  } | null = await db.conversa.findFirst({
    where: { id: parsed.data.conversaId, tipo: 'CANAL' },
    select: {
      id: true,
      visibilidadeCanal: true,
      publica: true,
      tenant: { select: { afiliacaoId: true, sintetico: true } },
    },
  })

  if (
    !canalNacional ||
    canalNacional.visibilidadeCanal !== 'PUBLICO' ||
    canalNacional.tenant.sintetico ||
    canalNacional.tenant.afiliacaoId !== afiliacaoId
  ) {
    throw new Error('Canal não encontrado ou indisponível.')
  }
  if (!canalNacional.publica) throw new Error('Este canal não aceita novos inscritos.')

  await inscreverCanal(parsed.data.conversaId, session.user.id)

  revalidatePath('/portal/comunidade/canais')
  revalidatePath(linkCanalComunidade(parsed.data.conversaId))
}

/**
 * Sai do canal (marca `saiuEm`). Cross-tenant: basta ser membro ativo e
 * ainda poder ver o canal. Em temático, o último ADMIN precisa transferir
 * antes — oficiais são governados pelo RBAC do tenant, então a saída é livre.
 */
export async function sairCanal(conversaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = sairCanalSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  if (await isConversaCanalDepartamento(parsed.data.conversaId)) {
    throw new ExpectedError(
      'Canal de departamento: a saída acompanha o cargo na equipe — remova a pessoa do departamento.',
    )
  }

  const canalRow: {
    id: string
    tenantId: string
    canalOficial: boolean
    visibilidadeCanal: 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO'
  } | null = await db.conversa.findFirst({
    where: { id: parsed.data.conversaId, tipo: 'CANAL' },
    select: { id: true, tenantId: true, canalOficial: true, visibilidadeCanal: true },
  })
  if (!canalRow) throw new Error('Canal não encontrado.')

  const podeVer = await podeVerCanal(
    tenant.id,
    canalRow.tenantId,
    canalRow.visibilidadeCanal,
    session.user.id,
  )
  if (!podeVer) throw new Error('Canal não encontrado ou indisponível.')

  const membro: { id: string; papel: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: canalRow.id,
      userId: session.user.id,
      status: 'ATIVO',
      saiuEm: null,
    },
    select: { id: true, papel: true },
  })
  if (!membro) throw new Error('Você não é membro deste canal.')

  if (membro.papel === 'ADMIN' && !canalRow.canalOficial) {
    const outrosAdmins: number = await db.membroConversa.count({
      where: {
        conversaId: canalRow.id,
        papel: 'ADMIN',
        status: 'ATIVO',
        saiuEm: null,
        userId: { not: session.user.id },
      },
    })
    if (outrosAdmins === 0) {
      throw new Error('Transfira a administração antes de sair do canal.')
    }
  }

  await db.membroConversa.update({
    where: { id: membro.id },
    data: { saiuEm: new Date() },
  })

  await db.auditLog.create({
    data: {
      tenantId: canalRow.tenantId,
      atorId: session.user.id,
      acao: 'CANAL_SAIU',
      entidade: 'Conversa',
      entidadeId: canalRow.id,
    },
  })

  revalidatePath(linkCanalComunidade(canalRow.id))
  revalidatePath('/portal/comunidade/canais')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/mensagens')
}

/** Alterna `MembroConversa.silenciada` — canal some do fan-out do feed (igual grupos). */
export async function alternarSilencioCanal(
  conversaId: string,
): Promise<{ silenciada: boolean }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = alternarSilencioCanalSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const membro: { id: string; silenciada: boolean } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: parsed.data.conversaId,
      userId: session.user.id,
      status: 'ATIVO',
      saiuEm: null,
      conversa: { tipo: 'CANAL' },
    },
    select: { id: true, silenciada: true },
  })
  if (!membro) throw new Error('Você não é membro deste canal.')

  const silenciada = !membro.silenciada
  await db.membroConversa.update({
    where: { id: membro.id },
    data: { silenciada },
  })

  revalidatePath(linkCanalComunidade(parsed.data.conversaId))
  revalidatePath('/portal/comunidade')
  return { silenciada }
}

export async function criarCanalTematico(
  nome: string,
  descricao?: string,
  visibilidadeCanal: 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO' = 'ALIADOS',
  avatarUrl?: string,
  /** false = canal fechado — entrada mediante pedido/aprovação. */
  publica: boolean = true,
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

  const parsed = criarCanalTematicoSchema.safeParse({
    nome,
    descricao,
    visibilidadeCanal,
    avatarUrl,
    publica,
  })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Canal inválido')

  if (parsed.data.avatarUrl != null && !isCloudinaryUrl(parsed.data.avatarUrl)) {
    throw new ExpectedError('Foto do canal inválida.')
  }

  const canal: { id: string } = await db.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId: tenant.id,
      nome: parsed.data.nome,
      descricao: parsed.data.descricao?.trim() || null,
      avatarUrl: parsed.data.avatarUrl ?? null,
      institucional: true,
      canalOficial: false,
      visibilidadeCanal: parsed.data.visibilidadeCanal,
      somenteAdminPublica: false,
      publica: parsed.data.publica,
      criadoPorId: session.user.id,
      membros: {
        create: { userId: session.user.id, papel: 'ADMIN', status: 'ATIVO' },
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
      detalhes: { visibilidadeCanal: parsed.data.visibilidadeCanal, publica: parsed.data.publica },
    },
  })

  revalidatePath('/portal/comunidade/canais')
  invalidarCachesComunidadeFeed(tenant.id)
  return canal
}

/**
 * Delegação de admin em canal temático (não oficial): quem já é ADMIN do
 * canal, ou tem CHANNELS_MANAGE/COMMUNITY_MANAGE no tenant, pode promover ou
 * rebaixar outro membro ativo. Canais oficiais são geridos pelo RBAC do
 * tenant da unidade — não por esta ação.
 */
export async function alterarAdminCanal(
  conversaId: string,
  targetUserId: string,
  papel: 'ADMIN' | 'MEMBRO',
): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = alterarAdminCanalSchema.safeParse({ conversaId, userId: targetUserId, papel })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const canal: { id: string; tenantId: string; canalOficial: boolean } | null =
    await db.conversa.findFirst({
      where: { id: parsed.data.conversaId, tipo: 'CANAL' },
      select: { id: true, tenantId: true, canalOficial: true },
    })
  if (!canal) throw new ExpectedError('Canal não encontrado.')
  if (canal.canalOficial) {
    throw new ExpectedError('Canais oficiais são geridos pelas permissões da torcida.')
  }

  const souAdminDoCanal: { id: string } | null = await db.membroConversa.findFirst({
    where: { conversaId: canal.id, userId: session.user.id, papel: 'ADMIN', saiuEm: null },
    select: { id: true },
  })

  if (!souAdminDoCanal) {
    const efetivas = await permissoesEfetivas(session.user.id, canal.tenantId)
    const podeGerenciar =
      hasPermission(efetivas, PERMISSIONS.CHANNELS_MANAGE) ||
      hasPermission(efetivas, PERMISSIONS.COMMUNITY_MANAGE)
    if (!podeGerenciar) throw new ExpectedError('Sem permissão para gerenciar este canal.')
  }

  const alvo: { id: string; papel: 'ADMIN' | 'MEMBRO' } | null = await db.membroConversa.findFirst({
    where: { conversaId: canal.id, userId: parsed.data.userId, saiuEm: null },
    select: { id: true, papel: true },
  })
  if (!alvo) throw new ExpectedError('Membro não encontrado neste canal.')
  if (alvo.papel === parsed.data.papel) return

  await db.membroConversa.update({
    where: { id: alvo.id },
    data: { papel: parsed.data.papel },
  })

  await db.auditLog.create({
    data: {
      tenantId: canal.tenantId,
      atorId: session.user.id,
      acao: 'canal.alterar_admin',
      entidade: 'Conversa',
      entidadeId: canal.id,
      detalhes: { targetUserId: parsed.data.userId, papel: parsed.data.papel },
    },
  })

  invalidarLeituraComunidade(canal.tenantId)
  revalidatePath(linkCanalComunidade(canal.id))
  revalidatePath('/portal/comunidade/canais')
}

/**
 * Edita nome/descrição/avatar/visibilidade/regras de um canal **temático**
 * (não oficial — canal oficial é gerido em `/admin/configuracoes`, RBAC da
 * unidade). Quem chama precisa ser ADMIN do canal ou ter
 * CHANNELS_MANAGE/COMMUNITY_MANAGE no tenant dono do canal.
 */
export async function atualizarCanalTematico(
  _prevState: { message?: string; success?: boolean },
  formData: FormData,
): Promise<{ message?: string; success?: boolean }> {
  try {
    const parsed = atualizarCanalTematicoSchema.safeParse({
      conversaId: formData.get('conversaId'),
      nome: formData.get('nome'),
      descricao: String(formData.get('descricao') ?? '').trim() || undefined,
      visibilidadeCanal: formData.get('visibilidadeCanal'),
      somenteAdminPublica: formData.get('somenteAdminPublica') === 'true',
      publica: formData.get('publica') === 'true',
      avatarUrl: String(formData.get('avatarUrl') ?? '').trim() || undefined,
    })
    if (!parsed.success) {
      return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }

    const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
    await assertMembroAtivo(tenant.id, session.user.id)

    const canal: { id: string; tenantId: string; canalOficial: boolean; avatarUrl: string | null } | null =
      await db.conversa.findFirst({
        where: { id: parsed.data.conversaId, tipo: 'CANAL' },
        select: { id: true, tenantId: true, canalOficial: true, avatarUrl: true },
      })
    if (!canal) return { message: 'Canal não encontrado.' }
    if (canal.tenantId !== tenant.id) return { message: 'Canal não encontrado.' }
    if (canal.canalOficial) {
      return { message: 'Canais oficiais são editados em Configurações da torcida.' }
    }

    const souAdminDoCanal: { id: string } | null = await db.membroConversa.findFirst({
      where: { conversaId: canal.id, userId: session.user.id, papel: 'ADMIN', saiuEm: null },
      select: { id: true },
    })
    if (!souAdminDoCanal) {
      const efetivas = await permissoesEfetivas(session.user.id, canal.tenantId)
      const podeGerenciar =
        hasPermission(efetivas, PERMISSIONS.CHANNELS_MANAGE) ||
        hasPermission(efetivas, PERMISSIONS.COMMUNITY_MANAGE)
      if (!podeGerenciar) return { message: 'Sem permissão para gerenciar este canal.' }
    }

    const avatarNovo = parsed.data.avatarUrl ?? null
    if (
      avatarNovo != null &&
      avatarNovo !== canal.avatarUrl &&
      !isCloudinaryUrl(avatarNovo)
    ) {
      return { message: 'Foto do canal inválida.' }
    }

    await db.conversa.update({
      where: { id: canal.id },
      data: {
        nome: parsed.data.nome,
        descricao: parsed.data.descricao ?? null,
        visibilidadeCanal: parsed.data.visibilidadeCanal,
        somenteAdminPublica: parsed.data.somenteAdminPublica,
        publica: parsed.data.publica,
        avatarUrl: avatarNovo,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: canal.tenantId,
        atorId: session.user.id,
        acao: 'CANAL_TEMATICO_ATUALIZADO',
        entidade: 'Conversa',
        entidadeId: canal.id,
        detalhes: parsed.data,
      },
    })

    invalidarLeituraComunidade(canal.tenantId)
    revalidatePath(linkCanalComunidade(canal.id))
    revalidatePath('/portal/comunidade/canais')
    return { success: true }
  } catch (error) {
    console.error('[atualizarCanalTematico]', error)
    return { message: 'Não foi possível salvar. Tente novamente.' }
  }
}

/**
 * Pedido de entrada num canal fechado (`publica: false`) — mesmo modelo de
 * `pedirEntradaGrupo`: upsert de `MembroConversa` em status `PENDENTE`,
 * decidido depois por `decidirPedidoCanal`. Notifica admins locais do canal
 * (temático) + quem tem `CHANNELS_MANAGE`/`COMMUNITY_MANAGE` no tenant.
 */
export async function pedirEntradaCanal(conversaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = pedirEntradaCanalSchema.safeParse({ conversaId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Pedido inválido')

  if (await isConversaCanalDepartamento(parsed.data.conversaId)) {
    throw new ExpectedError(
      'Canal de departamento: a entrada é automática pelo cargo na equipe — não há pedidos.',
    )
  }

  const canalRow: {
    id: string
    tenantId: string
    nome: string | null
    publica: boolean
    visibilidadeCanal: 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO'
  } | null = await db.conversa.findFirst({
    where: { id: parsed.data.conversaId, tipo: 'CANAL' },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      publica: true,
      visibilidadeCanal: true,
    },
  })
  if (!canalRow) throw new Error('Canal não encontrado.')

  const podeVer = await podeVerCanal(
    tenant.id,
    canalRow.tenantId,
    canalRow.visibilidadeCanal,
    session.user.id,
  )
  if (!podeVer) throw new Error('Canal não encontrado ou indisponível.')

  const canal = canalRow
  if (canal.publica) throw new Error('Este canal é aberto — use Entrar.')
  await assertElegibilidadeMembroCanal(canal.id, session.user.id, 'PENDENTE')

  const existente: { status: string; saiuEm: Date | null } | null =
    await db.membroConversa.findUnique({
      where: { conversaId_userId: { conversaId: canal.id, userId: session.user.id } },
      select: { status: true, saiuEm: true },
    })
  if (existente?.status === 'ATIVO' && !existente.saiuEm) {
    throw new Error('Você já é membro deste canal.')
  }
  if (existente?.status === 'PENDENTE' && !existente.saiuEm) {
    throw new Error('Pedido já enviado — aguarde a aprovação.')
  }

  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId: canal.id, userId: session.user.id } },
    create: {
      conversaId: canal.id,
      userId: session.user.id,
      papel: 'MEMBRO',
      status: 'PENDENTE',
    },
    update: { status: 'PENDENTE', saiuEm: null, papel: 'MEMBRO' },
  })

  const [adminsLocais, adminsPermissao] = await Promise.all([
    db.membroConversa.findMany({
      where: { conversaId: canal.id, papel: 'ADMIN', status: 'ATIVO', saiuEm: null },
      select: { userId: true },
    }),
    listarDestinatariosPorPermissoes(canal.tenantId, [
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.COMMUNITY_MANAGE,
    ]),
  ])
  const destinatarios = new Set<string>([
    ...adminsLocais.map((a: { userId: string }) => a.userId),
    ...adminsPermissao,
  ])
  destinatarios.delete(session.user.id)

  const nomeCanal = canal.nome ?? 'canal'
  await Promise.all(
    [...destinatarios].map((userId) =>
      notificarSafe({
        userId,
        tenantId: canal.tenantId,
        tipo: 'CANAL_PEDIDO',
        titulo: 'Pedido para entrar no canal',
        corpo: `${session.user.name ?? 'Um membro'} pediu para entrar em ${nomeCanal}.`,
        link: linkCanalComunidade(canal.id),
        atorId: session.user.id,
      }),
    ),
  )

  revalidatePath('/portal/comunidade/canais')
  revalidatePath(linkCanalComunidade(canal.id))
}

/**
 * Aprova/recusa um pedido de entrada. Autoridade: admin local do canal
 * (temático) ou `CHANNELS_MANAGE`/`COMMUNITY_MANAGE` no tenant — canal
 * oficial soma `ANNOUNCEMENTS_PUBLISH` (mesmo conjunto de
 * `podeGerenciarPedidosCanal`, checado aqui via `getCanalPorId`).
 */
export async function decidirPedidoCanal(
  conversaId: string,
  userId: string,
  aprovar: boolean,
): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = decidirPedidoCanalSchema.safeParse({ conversaId, userId, aprovar })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Decisão inválida')

  if (await isConversaCanalDepartamento(parsed.data.conversaId)) {
    throw new ExpectedError(
      'Canal de departamento: a entrada é automática pelo cargo na equipe — não há pedidos.',
    )
  }

  const canal = await getCanalPorId(parsed.data.conversaId, tenant.id, session.user.id)
  if (!canal) throw new Error('Canal não encontrado.')

  const efetivas = await permissoesEfetivas(session.user.id, canal.tenantId)
  const podeDecidir = await podeGerenciarPedidosCanal(canal, tenant.id, efetivas)
  if (!podeDecidir) throw new Error('Sem permissão para decidir pedidos deste canal.')

  const pedido: { id: string } | null = await db.membroConversa.findFirst({
    where: {
      conversaId: canal.id,
      userId: parsed.data.userId,
      status: 'PENDENTE',
      saiuEm: null,
    },
    select: { id: true },
  })
  if (!pedido) throw new Error('Pedido não encontrado.')

  if (parsed.data.aprovar) {
    await assertElegibilidadeMembroCanal(canal.id, parsed.data.userId, 'ATIVO')
  }

  // Idem ao grupo: a fila do canal foi resolvida para a equipe inteira.
  await reconciliarNotificacoesDoEvento(canal.tenantId, {
    tipo: 'CANAL_PEDIDO',
    atorId: parsed.data.userId,
  })

  if (parsed.data.aprovar) {
    await db.membroConversa.update({
      where: { id: pedido.id },
      data: { status: 'ATIVO', entrouEm: new Date() },
    })
    await notificarSafe({
      userId: parsed.data.userId,
      tenantId: canal.tenantId,
      tipo: 'CANAL_APROVADO',
      titulo: 'Entrada no canal aprovada',
      corpo: `Você foi aceito em ${canal.nome ?? 'um canal'}.`,
      link: linkCanalComunidade(canal.id),
      atorId: session.user.id,
    })
  } else {
    await db.membroConversa.update({
      where: { id: pedido.id },
      data: { status: 'REJEITADO' },
    })
    await notificarSafe({
      userId: parsed.data.userId,
      tenantId: canal.tenantId,
      tipo: 'CANAL_REJEITADO',
      titulo: 'Entrada no canal recusada',
      corpo: `Seu pedido para ${canal.nome ?? 'um canal'} foi recusado. Você pode enviar um novo pedido quando quiser.`,
      link: linkCanalComunidade(canal.id),
      atorId: session.user.id,
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: canal.tenantId,
      atorId: session.user.id,
      acao: parsed.data.aprovar ? 'CANAL_PEDIDO_APROVADO' : 'CANAL_PEDIDO_REJEITADO',
      entidade: 'MembroConversa',
      entidadeId: pedido.id,
      detalhes: { conversaId: canal.id, userId: parsed.data.userId },
    },
  })

  invalidarLeituraComunidade(canal.tenantId)
  revalidatePath(linkCanalComunidade(canal.id))
  revalidatePath('/portal/comunidade/canais')
}

/**
 * Remove um membro ativo do canal (kick). Mesma autoridade de
 * `decidirPedidoCanal` (`podeGerenciarPedidosCanal`) — quem governa pedidos
 * também governa quem fica. Marca `saiuEm` + `status: REJEITADO`: distingue
 * de um pedido recusado (`saiuEm: null`) e, se a pessoa pedir entrada de
 * novo, passa pelo mesmo fluxo de aprovação — não há bloqueio permanente.
 */
export async function removerMembroCanal(conversaId: string, userId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = removerMembroCanalSchema.safeParse({ conversaId, userId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  if (parsed.data.userId === session.user.id) {
    throw new Error('Você não pode remover a si mesmo por aqui.')
  }

  if (await isConversaCanalDepartamento(parsed.data.conversaId)) {
    throw new ExpectedError(
      'Canal de departamento: a saída acompanha o cargo na equipe — remova a pessoa do departamento.',
    )
  }

  const canal = await getCanalPorId(parsed.data.conversaId, tenant.id, session.user.id)
  if (!canal) throw new Error('Canal não encontrado.')

  const efetivas = await permissoesEfetivas(session.user.id, canal.tenantId)
  const podeRemover = await podeGerenciarPedidosCanal(canal, tenant.id, efetivas)
  if (!podeRemover) throw new Error('Sem permissão para remover membros deste canal.')

  const membro: { id: string } | null = await db.membroConversa.findFirst({
    where: { conversaId: canal.id, userId: parsed.data.userId, status: 'ATIVO', saiuEm: null },
    select: { id: true },
  })
  if (!membro) throw new Error('Membro não encontrado neste canal.')

  await db.membroConversa.update({
    where: { id: membro.id },
    data: { saiuEm: new Date(), status: 'REJEITADO' },
  })

  await db.auditLog.create({
    data: {
      tenantId: canal.tenantId,
      atorId: session.user.id,
      acao: 'CANAL_MEMBRO_REMOVIDO',
      entidade: 'MembroConversa',
      entidadeId: membro.id,
      detalhes: { conversaId: canal.id, userId: parsed.data.userId },
    },
  })

  invalidarLeituraComunidade(canal.tenantId)
  revalidatePath(linkCanalComunidade(canal.id))
  revalidatePath('/portal/comunidade/canais')
}

/**
 * Adiciona um membro direto (sem esperar pedido) — convite ativo da
 * liderança pra canal fechado. Mesma autoridade de `decidirPedidoCanal`.
 * Reaproveita o tipo de notificação `CANAL_APROVADO` (mesmo efeito prático:
 * "você foi aceito no canal").
 */
export async function adicionarMembroCanal(conversaId: string, userId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MESSAGES_SEND)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = adicionarMembroCanalSchema.safeParse({ conversaId, userId })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  if (await isConversaCanalDepartamento(parsed.data.conversaId)) {
    throw new ExpectedError(
      'Canal de departamento: a entrada é automática pelo cargo na equipe — não há convite manual.',
    )
  }

  const canal = await getCanalPorId(parsed.data.conversaId, tenant.id, session.user.id)
  if (!canal) throw new Error('Canal não encontrado.')

  const efetivas = await permissoesEfetivas(session.user.id, canal.tenantId)
  const podeAdicionar = await podeGerenciarPedidosCanal(canal, tenant.id, efetivas)
  if (!podeAdicionar) throw new Error('Sem permissão para adicionar membros a este canal.')

  await assertElegibilidadeMembroCanal(canal.id, parsed.data.userId, 'ATIVO')

  await db.membroConversa.upsert({
    where: { conversaId_userId: { conversaId: canal.id, userId: parsed.data.userId } },
    create: { conversaId: canal.id, userId: parsed.data.userId, papel: 'MEMBRO', status: 'ATIVO' },
    update: { status: 'ATIVO', saiuEm: null },
  })

  await db.auditLog.create({
    data: {
      tenantId: canal.tenantId,
      atorId: session.user.id,
      acao: 'CANAL_MEMBRO_ADICIONADO',
      entidade: 'MembroConversa',
      entidadeId: canal.id,
      detalhes: { conversaId: canal.id, userId: parsed.data.userId },
    },
  })

  await notificarSafe({
    userId: parsed.data.userId,
    tenantId: canal.tenantId,
    tipo: 'CANAL_APROVADO',
    titulo: 'Você foi adicionado a um canal',
    corpo: `Você foi adicionado ao canal ${canal.nome ?? 'um canal'}.`,
    link: linkCanalComunidade(canal.id),
    atorId: session.user.id,
  })

  invalidarLeituraComunidade(canal.tenantId)
  revalidatePath(linkCanalComunidade(canal.id))
  revalidatePath('/portal/comunidade/canais')
}

const publicarPostCanalComMidiaSchema = publicarPostCanalSchema.extend({
  midias: z.array(midiaUrlSchema).max(MAX_MIDIAS, 'Máximo de 10 anexos').default([]),
})

/**
 * Publica no mural de um canal — mesmo `PublicarPostState`/`useActionState` do
 * composer do feed principal (`FeedComposer`), para que o canal reutilize o
 * componente de postagem em vez de um form próprio. Visibilidade é sempre
 * `TENANT` (mural do canal, não escolha do autor); sem enquete/evento.
 */
export async function publicarPostCanal(
  _prevState: PublicarPostState,
  formData: FormData,
): Promise<PublicarPostState> {
  try {
    const parsed = publicarPostCanalComMidiaSchema.safeParse({
      conversaId: formData.get('conversaId'),
      conteudo: formData.get('conteudo'),
      midias: parseMidias(formData.get('midias')),
    })
    if (!parsed.success) {
      return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }

    // Mural do canal: sócio APROVADO + `somenteAdminPublica` /
    // `podePublicarNoCanal` — não exige RBAC `community:post` do feed.
    // Torcedor lê o mural mas não publica (docs/data/modulo-comunidade.md).
    const session = await auth()
    if (!session?.user?.id) return { message: 'Não autorizado.' }
    const tenant = await getActiveTenant(session.user.id, session.user.email)
    if (!tenant) return { message: 'Não autorizado.' }
    try {
      await assertNaoOperador()
      await assertMembroAtivo(tenant.id, session.user.id)
    } catch (error) {
      return { message: error instanceof Error ? error.message : 'Não autorizado.' }
    }

    if (!(await podeVerFeedSocios(session.user.id, tenant.id))) {
      return { message: 'Apenas sócios aprovados podem publicar neste canal.' }
    }

    const erroMencoes = erroMencoesExcessivas(parsed.data.conteudo)
    if (erroMencoes) return { message: erroMencoes }

    const efetivas = await permissoesEfetivas(session.user.id, tenant.id)
    // Canal emprestado Caso B: getCanalPorId (descoberta) devolve null no
    // tenant da unidade — mesmo fallback da aba "Minha unidade".
    const canal =
      (await getCanalPorId(parsed.data.conversaId, tenant.id, session.user.id)) ??
      (await getCanalDaUnidadeDoVinculo(parsed.data.conversaId, session.user.id)) ??
      (await getCanalSeMembroAtivo(parsed.data.conversaId, session.user.id))
    if (!canal) return { message: 'Canal não encontrado.' }

    if (!canal.souMembro) {
      // Canal fechado: entrada só depois de aprovação via `decidirPedidoCanal`
      // — não auto-inscreve aqui, senão contorna o pedido/aprovação.
      if (!canal.publica) {
        return { message: 'Você precisa ter seu pedido de entrada aprovado para publicar neste canal.' }
      }
      await inscreverCanal(parsed.data.conversaId, session.user.id)
    }

    const podePublicar = await podePublicarNoCanal(canal, tenant.id, efetivas)
    if (!podePublicar) {
      return { message: 'Somente administradores podem publicar neste canal.' }
    }

    await getOrCreatePerfilMembro(session.user.id, tenant.id)

    const midiasFinais = midiasComEmbedDoTexto(parsed.data.conteudo, parsed.data.midias, MAX_MIDIAS)

    const post = await db.post.create({
      data: {
        tenantId: tenant.id,
        autorId: session.user.id,
        conteudo: parsed.data.conteudo,
        midiaUrls: midiasFinais,
        tipo: canal.institucional ? 'INSTITUCIONAL' : 'MEMBRO',
        visibilidade: 'TENANT',
        conversaId: parsed.data.conversaId,
      },
    })

    agendarPosPublicacaoFeed({
      postId: post.id,
      tenantId: tenant.id,
      autorId: session.user.id,
      autorNome: session.user.name ?? null,
      conteudo: parsed.data.conteudo,
      audit: {
        acao: 'POST_CANAL_PUBLICADO',
        detalhes: { conversaId: parsed.data.conversaId, canalOficial: canal.canalOficial },
      },
    })

    invalidarLeituraComunidade(tenant.id)
    revalidatePath(linkCanalComunidade(parsed.data.conversaId))
    if (canal.canalOficial) {
      revalidatePath(linkUnidadeComunidade(tenant.id))
    }

    return {
      success: true,
      token: post.id,
      preview: await previewDoPost({
        post,
        autorId: session.user.id,
        autorNome: session.user.name ?? null,
        autorAvatar: await getAvatarAtualDoUsuario(session.user.id),
        tenantNome: tenant.nome,
      }),
    }
  } catch (error) {
    console.error('[publicarPostCanal]', error)
    return { message: 'Não foi possível publicar. Tente novamente.' }
  }
}

export async function criarDestaquePerfil(titulo: string, postIds: string[]): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_POST)
  await assertMembroAtivo(tenant.id, session.user.id)

  const parsed = criarDestaqueSchema.safeParse({ titulo, postIds })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Destaque inválido')

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
  tipo: 'CURTIR',
): Promise<{ minhaReacao: 'CURTIR' | null }> {
  const parsed = reacaoSchema.safeParse({ postId, tipo })
  if (!parsed.success) throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Reação inválida')

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
        tipo: true,
        comunicadoOrigemId: true,
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

  // Toggle: qualquer reação existente (incl. legado FORCA/VAMOS/PRESENTE) remove;
  // senão cria/atualiza como CURTIR. 1 RTT no descurtir; add = deleteMany(0) + upsert.
  const removidos: { count: number } = await db.reacao.deleteMany({
    where: { postId: post.id, userId: viewerId },
  })
  const removendo = removidos.count > 0

  if (!removendo) {
    await db.reacao.upsert({
      where: { postId_userId: { postId: post.id, userId: viewerId } },
      create: { postId: post.id, userId: viewerId, tipo: 'CURTIR' },
      update: { tipo: 'CURTIR' },
    })
  }

  // Notificação fora do caminho crítico — UI já é otimista.
  if (!removendo && post.autorId !== viewerId) {
    const notifTenantId = tenantId ?? post.tenantId
    after(() => {
      void notificarSafe({
        userId: post.autorId,
        tenantId: notifTenantId,
        tipo: 'NOVA_REACAO',
        titulo: 'Nova curtida no seu post',
        corpo: 'Recebeu uma curtida.',
        link: linkPostComunidade(post.id),
        atorId: viewerId,
      })
    })
  }

  // Sem revalidatePath: overlay de reação é estado do cliente (otimista).
  return { minhaReacao: removendo ? null : 'CURTIR' }
}

/**
 * Denúncia de post. Retorna `{ ok }` em vez de `throw` nos erros de negócio —
 * em produção, throw de Server Action vira HTTP 500 sem corpo (digest RSC).
 */
export async function denunciarPost(
  postId: string,
  motivo: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = denunciaSchema.safeParse({ postId, motivo })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Denúncia inválida' }
  }

  // Mesmo gate de reação/comentário: post visível no feed (CN / hierarquia /
  // alianças) pode ser denunciado; a fila fica no tenant dono do post.
  let ctx: Awaited<ReturnType<typeof resolverContextoEngajamento>>
  try {
    ctx = await resolverContextoEngajamento()
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Não autorizado',
    }
  }

  const post: PostEngajavelLite | null = await db.post.findUnique({
    where: { id: parsed.data.postId },
    select: {
      id: true,
      autorId: true,
      tenantId: true,
      oculto: true,
      visibilidade: true,
      tipo: true,
      comunicadoOrigemId: true,
      tenant: { select: { afiliacaoId: true, sintetico: true } },
    },
  })

  if (!post || !(await podeEngajarPostVisivel(ctx, post))) {
    return { ok: false, message: 'Post não encontrado' }
  }
  if (post.autorId === ctx.viewerId) {
    return { ok: false, message: 'Não é possível denunciar o próprio post.' }
  }

  const { viewerId, tenantId, afiliacaoId } = ctx
  const limiterKey = `report:${tenantId ?? `nacional:${afiliacaoId}`}:${viewerId}`
  if (excedeuLimiteEngajamento(limiterKey)) {
    return { ok: false, message: 'Você atingiu o limite de denúncias por minuto.' }
  }
  registrarAcaoEngajamento(limiterKey)

  const denunciaTenantId = post.tenantId

  try {
    const denuncia: { id: string } = await db.denuncia.create({
      data: {
        tenantId: denunciaTenantId,
        postId: post.id,
        denuncianteId: viewerId,
        motivo: parsed.data.motivo,
      },
      select: { id: true },
    })

    await notificarDenunciaPost({
      tenantId: denunciaTenantId,
      motivo: parsed.data.motivo,
      denuncianteUserId: viewerId,
    })

    await db.auditLog.create({
      data: {
        tenantId: denunciaTenantId,
        atorId: viewerId,
        acao: 'POST_DENUNCIADO',
        entidade: 'Denuncia',
        entidadeId: denuncia.id,
        detalhes: { postId: post.id },
      },
    })
  } catch {
    return { ok: false, message: 'Não foi possível enviar a denúncia. Tente de novo.' }
  }

  revalidatePath('/admin/comunidade/moderacao')
  return { ok: true }
}

/** Marca como lidas apenas notificações sociais (central da Comunidade). */
export async function marcarTodasNotificacoesLidas(): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  // Mesmo resolver da inbox/navbar — cobre CN sintética (torcedor global).
  const tenantId = await resolveTenantIdPortalComunidade(session.user.id, session.user.email)
  if (!tenantId) throw new Error('Tenant não encontrado')

  await db.notificacao.updateMany({
    where: {
      tenantId,
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
