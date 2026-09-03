'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import {
  PERMISSIONS,
  calculateEffectivePermissions,
  hasPermission,
  criarTopicoSchema,
  criarTopicoComposerSchema,
  editarTopicoSchema,
  tituloDeConteudoForum,
  responderTopicoSchema,
  votarPracaSchema,
  comentarPracaSchema,
  editarComentarioPracaSchema,
  editarRespostaForumSchema,
  publicarArtigoSchema,
  publicarArtigoComposerSchema,
  publicarArtigoHistoriaSchema,
  flattenArtigoBlocos,
  parseArtigoBlocos,
  podeVerArtigoNoEscopo,
  podeVerTopicoNoEscopo,
  wherePracaNoEscopo,
  canalElegivelParaNoticia,
  resumoDeCorpoForum,
  ARTIGO_RESUMO_MAX,
  moderarTopicoSchema,
  moderarRespostaSchema,
  denunciarPracaSchema,
  escalaParaPlataforma,
  gravidadeDaCategoria,
  prazoSlaDe,
} from '@torcida/types'
import { assertComunidadeNacional, assertNaoOperador } from '@/lib/authz'
import { ExpectedError } from '@/lib/expected-error'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolverContextoComunidade, resolverEscopoComunidade } from '@/lib/comunidade-contexto'
import {
  ancoraPraca,
  aplicarDeltaVotoTopico,
  aplicarDeltaVotoArtigo,
  aplicarDeltaVotoComentario,
  registrarScorePraca,
  PESOS_PRACA,
  assertTetoSinaisPraca,
  podeModerarPraca,
  podeAprovarPracaNaHora,
  tenantModeracaoPraca,
  listarRespostasTopico,
  listarComentariosPraca,
  resolverCanalElegivelNoticia,
} from '@/lib/praca'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import {
  excedeuLimiteEngajamento,
  registrarAcaoEngajamento,
} from '@/lib/engagement-rate-limit'
import { notificarDenunciaModeracao } from '@/lib/notificacoes-routing'

async function contextoEscopo(escopoParam: string | undefined) {
  const session = await auth()
  if (!session?.user?.id) throw new ExpectedError('Não autenticado.')
  await assertNaoOperador()
  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) throw new ExpectedError('Sem contexto de comunidade.')
  const escopo = resolverEscopoComunidade(ctx, escopoParam)
  const ancora = ancoraPraca(escopo, ctx)
  return { session, ctx, escopo, ancora }
}

async function assertPostNoTenant(userId: string, tenantId: string): Promise<void> {
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
  if (!hasPermission(efetivas, PERMISSIONS.COMMUNITY_POST)) {
    throw new ExpectedError('Sem permissão para publicar neste canal.')
  }
}

async function assertArtigoNoTenant(userId: string, tenantId: string): Promise<boolean> {
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
  if (hasPermission(efetivas, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)) return true
  const membro: { fonteVerificadaEm: Date | null } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { fonteVerificadaEm: true },
  })
  if (membro?.fonteVerificadaEm) return false
  throw new ExpectedError('Só Comunicação/liderança publica artigo oficial.')
}

function parseMidiasForum(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export type ArtigoComposerState = {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
  token?: string
  artigoId?: string
}

async function persistirArtigo(opts: {
  userId: string
  tenantId: string
  titulo: string
  corpo: string
  resumo?: string
  midiaUrls: string[]
  blocos?: ReturnType<typeof parseArtigoBlocos>
}): Promise<{ id: string } | { error: string }> {
  const canal = await resolverCanalElegivelNoticia(opts.tenantId)
  if (!canal || !canalElegivelParaNoticia({ ...canal, tipo: 'CANAL' })) {
    return {
      error:
        'Para publicar notícia o canal precisa ser o oficial da torcida/unidade ou um portal verificado.',
    }
  }
  const ehOficial = await assertArtigoNoTenant(opts.userId, opts.tenantId)
  const capaUrl = opts.midiaUrls.find((u) => !u.includes('/video/')) ?? opts.midiaUrls[0] ?? null
  const resumo =
    opts.resumo ?? resumoDeCorpoForum(opts.titulo, opts.corpo, ARTIGO_RESUMO_MAX) ?? undefined
  const artigo = await db.artigoPortal.create({
    data: {
      tenantId: opts.tenantId,
      autorId: opts.userId,
      conversaId: canal.id,
      titulo: opts.titulo,
      resumo,
      corpo: opts.corpo,
      ...(capaUrl ? { capaUrl } : {}),
      midiaUrls: opts.midiaUrls,
      ...(opts.blocos && opts.blocos.length > 0 ? { blocos: opts.blocos } : {}),
      origem: ehOficial ? 'OFICIAL' : 'VERIFICADA',
      status: 'PUBLICADO',
      publicadoEm: new Date(),
    },
  })
  await db.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      atorId: opts.userId,
      acao: 'ARTIGO_PUBLICADO',
      entidade: 'ArtigoPortal',
      entidadeId: artigo.id,
      detalhes: { origem: artigo.origem, conversaId: canal.id },
    },
  })
  revalidatePath('/portal/comunidade/noticias')
  revalidatePath('/portal/comunidade')
  return { id: artigo.id }
}

export async function publicarArtigoComposerAction(
  _prev: ArtigoComposerState,
  formData: FormData,
): Promise<ArtigoComposerState> {
  const parsed = publicarArtigoComposerSchema.safeParse({
    titulo: formData.get('titulo'),
    corpo: formData.get('conteudo'),
    midias: parseMidiasForum(formData.get('midias')),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const { session, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    if (escopo === 'nacional') {
      return { message: 'Artigo oficial é da torcida/unidade, não do clube.' }
    }
    if (!ancora.tenantId) return { message: 'Canal sem tenant.' }

    const r = await persistirArtigo({
      userId: session.user.id,
      tenantId: ancora.tenantId,
      titulo: parsed.data.titulo,
      corpo: parsed.data.corpo,
      midiaUrls: parsed.data.midias ?? [],
    })
    if ('error' in r) return { message: r.error }
    return { success: true, token: crypto.randomUUID(), artigoId: r.id }
  } catch (e) {
    return { message: e instanceof Error ? e.message : 'Não foi possível publicar a notícia.' }
  }
}

export async function publicarArtigoHistoriaAction(
  _prev: ArtigoComposerState,
  formData: FormData,
): Promise<ArtigoComposerState> {
  let blocosRaw: unknown = []
  const raw = formData.get('blocos')
  if (typeof raw === 'string' && raw.trim()) {
    try {
      blocosRaw = JSON.parse(raw)
    } catch {
      return { message: 'Blocos da notícia inválidos.' }
    }
  }
  const parsed = publicarArtigoHistoriaSchema.safeParse({
    titulo: formData.get('titulo'),
    resumo: formData.get('resumo') || undefined,
    blocos: parseArtigoBlocos(blocosRaw),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const { session, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    if (escopo === 'nacional') {
      return { message: 'Artigo oficial é da torcida/unidade, não do clube.' }
    }
    if (!ancora.tenantId) return { message: 'Canal sem tenant.' }

    const flat = flattenArtigoBlocos(parsed.data.blocos)
    const r = await persistirArtigo({
      userId: session.user.id,
      tenantId: ancora.tenantId,
      titulo: parsed.data.titulo,
      corpo: flat.corpo,
      resumo: parsed.data.resumo || flat.resumo || undefined,
      midiaUrls: flat.midiaUrls,
      blocos: parsed.data.blocos,
    })
    if ('error' in r) return { message: r.error }
    return { success: true, token: crypto.randomUUID(), artigoId: r.id }
  } catch (e) {
    return { message: e instanceof Error ? e.message : 'Não foi possível publicar a notícia.' }
  }
}

type ComposerTopicoState = {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
  token?: string
  topicoId?: string
  pendente?: boolean
}

async function persistirTopico(opts: {
  userId: string
  escopo: 'nacional' | 'torcida' | 'unidade'
  ancora: { tenantId: string | null; afiliacaoId: string | null }
  tenantModeracao: string | null
  titulo: string
  corpo: string
  midiaUrls: string[]
}): Promise<{ id: string; pendente: boolean } | { error: string }> {
  const { userId, escopo, ancora, tenantModeracao, titulo, corpo, midiaUrls } = opts
  const naHora =
    escopo === 'nacional' || (await podeAprovarPracaNaHora(userId, tenantModeracao))
  const status = naHora ? 'VISIVEL' : 'PENDENTE'

  if (escopo === 'nacional') {
    const cn = await assertComunidadeNacional()
    await assertTetoSinaisPraca(userId, { tenantId: null, afiliacaoId: cn.afiliacaoId })
    const topico = await db.forumTopico.create({
      data: {
        escopo: 'CLUBE',
        afiliacaoId: cn.afiliacaoId,
        autorId: userId,
        titulo,
        corpo,
        midiaUrls,
        status,
      },
    })
    if (status === 'VISIVEL') {
      await registrarScorePraca({
        userId,
        ancora: { tenantId: null, afiliacaoId: cn.afiliacaoId },
        sinal: 'topico',
        peso: PESOS_PRACA.topico,
        origemTipo: 'ForumTopico',
        origemId: topico.id,
        campo: 'topicos',
      })
    }
    revalidatePath('/portal/comunidade/forum')
    return { id: topico.id, pendente: status === 'PENDENTE' }
  }

  if (!ancora.tenantId) return { error: 'Canal sem tenant.' }
  await assertPostNoTenant(userId, ancora.tenantId)
  await assertTetoSinaisPraca(userId, ancora)
  const topico = await db.forumTopico.create({
    data: {
      escopo: 'TORCIDA',
      tenantId: ancora.tenantId,
      autorId: userId,
      titulo,
      corpo,
      midiaUrls,
      status,
    },
  })
  if (status === 'VISIVEL') {
    await registrarScorePraca({
      userId,
      ancora,
      sinal: 'topico',
      peso: PESOS_PRACA.topico,
      origemTipo: 'ForumTopico',
      origemId: topico.id,
      campo: 'topicos',
    })
  }
  revalidatePath('/portal/comunidade/forum')
  return { id: topico.id, pendente: status === 'PENDENTE' }
}

export async function criarTopicoAction(formData: FormData): Promise<{ ok: true; id: string } | { error: string }> {
  const parsed = criarTopicoSchema.safeParse({
    titulo: formData.get('titulo'),
    corpo: formData.get('corpo'),
  })
  if (!parsed.success) return { error: 'Título e texto são obrigatórios.' }

  try {
    const { session, ctx, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    const r = await persistirTopico({
      userId: session.user.id,
      escopo,
      ancora,
      tenantModeracao: tenantModeracaoPraca(ancora, ctx),
      titulo: parsed.data.titulo,
      corpo: parsed.data.corpo,
      midiaUrls: [],
    })
    if ('error' in r) return r
    return { ok: true, id: r.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível criar o tópico.' }
  }
}

/** Mesmo FormData do FeedComposer (`conteudo` + `midias` + `escopo`). */
export async function criarTopicoComposerAction(
  _prev: ComposerTopicoState,
  formData: FormData,
): Promise<ComposerTopicoState> {
  const parsed = criarTopicoComposerSchema.safeParse({
    conteudo: formData.get('conteudo'),
    midias: parseMidiasForum(formData.get('midias')),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }
  const titulo = tituloDeConteudoForum(parsed.data.conteudo)
  if (!titulo) return { message: 'Escreva pelo menos 3 caracteres.' }

  try {
    const { session, ctx, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    const r = await persistirTopico({
      userId: session.user.id,
      escopo,
      ancora,
      tenantModeracao: tenantModeracaoPraca(ancora, ctx),
      titulo,
      corpo: parsed.data.conteudo,
      midiaUrls: parsed.data.midias ?? [],
    })
    if ('error' in r) return { message: r.error }
    return { success: true, token: crypto.randomUUID(), topicoId: r.id, pendente: r.pendente }
  } catch (e) {
    return { message: e instanceof Error ? e.message : 'Não foi possível criar o tópico.' }
  }
}

export async function editarTopico(
  topicoId: string,
  conteudo: string,
  midias: string[],
  escopoParam: string,
): Promise<void> {
  const parsed = editarTopicoSchema.safeParse({ topicoId, conteudo, midias })
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Tópico inválido.')
  }
  const titulo = tituloDeConteudoForum(parsed.data.conteudo)
  if (!titulo) throw new ExpectedError('Escreva pelo menos 3 caracteres.')

  const { session, escopo, ancora } = await contextoEscopo(escopoParam)
  const topico = await db.forumTopico.findUnique({
    where: { id: parsed.data.topicoId },
    select: {
      id: true,
      autorId: true,
      escopo: true,
      tenantId: true,
      afiliacaoId: true,
      status: true,
    },
  })
  if (!topico || (topico.status !== 'VISIVEL' && topico.status !== 'PENDENTE')) {
    throw new ExpectedError('Tópico não encontrado.')
  }
  if (!podeVerTopicoNoEscopo(escopo, ancora, topico)) throw new ExpectedError('Tópico fora deste canal.')
  if (topico.autorId !== session.user.id) throw new ExpectedError('Só o autor edita o tópico.')

  await db.forumTopico.update({
    where: { id: topico.id },
    data: {
      titulo,
      corpo: parsed.data.conteudo,
      midiaUrls: parsed.data.midias ?? [],
    },
  })
  await db.auditLog.create({
    data: {
      tenantId: topico.tenantId,
      atorId: session.user.id,
      acao: 'TOPICO_EDITADO',
      entidade: 'ForumTopico',
      entidadeId: topico.id,
    },
  })
  revalidatePath('/portal/comunidade/forum')
  revalidatePath(`/portal/comunidade/forum/${topico.id}`)
}

export async function excluirTopico(topicoId: string, escopoParam: string): Promise<void> {
  const { session, escopo, ancora } = await contextoEscopo(escopoParam)
  const topico = await db.forumTopico.findUnique({
    where: { id: topicoId },
    select: {
      id: true,
      autorId: true,
      escopo: true,
      tenantId: true,
      afiliacaoId: true,
      status: true,
    },
  })
  if (!topico || (topico.status !== 'VISIVEL' && topico.status !== 'PENDENTE')) {
    throw new ExpectedError('Tópico não encontrado.')
  }
  if (!podeVerTopicoNoEscopo(escopo, ancora, topico)) throw new ExpectedError('Tópico fora deste canal.')
  if (topico.autorId !== session.user.id) throw new ExpectedError('Só o autor exclui o tópico.')

  await db.forumTopico.update({
    where: { id: topico.id },
    data: { status: 'REMOVIDO' },
  })
  await db.auditLog.create({
    data: {
      tenantId: topico.tenantId,
      atorId: session.user.id,
      acao: 'TOPICO_EXCLUIDO',
      entidade: 'ForumTopico',
      entidadeId: topico.id,
    },
  })
  revalidatePath('/portal/comunidade/forum')
  revalidatePath(`/portal/comunidade/forum/${topico.id}`)
}

export async function responderTopicoAction(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const parsed = responderTopicoSchema.safeParse({
    topicoId: formData.get('topicoId'),
    conteudo: formData.get('conteudo'),
    parentId: formData.get('parentId') || undefined,
  })
  if (!parsed.success) return { error: 'Resposta vazia.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    const topico = await db.forumTopico.findUnique({
      where: { id: parsed.data.topicoId },
      select: { id: true, escopo: true, tenantId: true, afiliacaoId: true, status: true },
    })
    if (!topico || topico.status !== 'VISIVEL') return { error: 'Tópico não encontrado.' }
    if (!podeVerTopicoNoEscopo(escopo, ancora, topico)) return { error: 'Tópico fora deste canal.' }

    if (escopo === 'nacional') await assertComunidadeNacional()
    else if (ancora.tenantId) await assertPostNoTenant(session.user.id, ancora.tenantId)
    else return { error: 'Canal sem tenant.' }

    await assertTetoSinaisPraca(session.user.id, ancora)

    if (parsed.data.parentId) {
      const pai: { topicoId: string; oculto: boolean } | null = await db.forumResposta.findUnique({
        where: { id: parsed.data.parentId },
        select: { topicoId: true, oculto: true },
      })
      if (!pai || pai.oculto || pai.topicoId !== topico.id) {
        return { error: 'Resposta não encontrada.' }
      }
    }

    await db.forumResposta.create({
      data: {
        topicoId: topico.id,
        autorId: session.user.id,
        conteudo: parsed.data.conteudo,
        parentId: parsed.data.parentId,
      },
    })
    await db.forumTopico.update({
      where: { id: topico.id },
      data: { respostasCount: { increment: 1 } },
    })
    await registrarScorePraca({
      userId: session.user.id,
      ancora,
      sinal: 'resposta',
      peso: PESOS_PRACA.resposta,
      origemTipo: 'ForumResposta',
      origemId: topico.id,
      campo: 'respostas',
    })
    revalidatePath(`/portal/comunidade/forum/${topico.id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível responder.' }
  }
}

export type ForumRespostaFeedDto = {
  id: string
  conteudo: string
  criadoEm: string
  parentId: string | null
  autor: { id: string; nome: string | null; avatarUrl: string | null }
}

export async function listarRespostasTopicoFeed(
  topicoId: string,
  escopoParam: string,
): Promise<ForumRespostaFeedDto[]> {
  const { escopo, ancora } = await contextoEscopo(escopoParam)
  const rows = await listarRespostasTopico(topicoId, escopo, ancora)
  return rows.map((r) => ({
    id: r.id,
    conteudo: r.conteudo,
    criadoEm: r.criadoEm.toISOString(),
    parentId: r.parentId,
    autor: {
      id: r.autor.id,
      nome: r.autor.nome,
      avatarUrl: r.autor.avatarUrl,
    },
  }))
}

export async function listarComentariosNoticiaFeed(
  alvoTipo: 'NOTICIA' | 'ARTIGO',
  alvoId: string,
  escopoParam: string,
): Promise<ForumRespostaFeedDto[]> {
  const { session } = await contextoEscopo(escopoParam)
  const rows = await listarComentariosPraca(alvoTipo, alvoId, session.user.id)
  return rows.map((c) => ({
    id: c.id,
    conteudo: c.conteudo,
    criadoEm: c.criadoEm.toISOString(),
    parentId: c.parentId,
    autor: {
      id: c.autorId,
      nome: c.autorNome,
      avatarUrl: c.autorAvatarUrl,
    },
  }))
}

export async function comentarNoticiaFeed(
  alvoTipo: 'NOTICIA' | 'ARTIGO',
  alvoId: string,
  conteudo: string,
  escopoParam: string,
  parentId?: string,
): Promise<ForumRespostaFeedDto | { error: string }> {
  const fd = new FormData()
  fd.set('escopo', escopoParam)
  fd.set('alvoTipo', alvoTipo)
  fd.set('alvoId', alvoId)
  fd.set('conteudo', conteudo)
  if (parentId) fd.set('parentId', parentId)
  const r = await comentarPracaAction(fd)
  if ('error' in r) return r

  try {
    const { session } = await contextoEscopo(escopoParam)
    return {
      id: `tmp-${Date.now()}`,
      conteudo: conteudo.trim(),
      criadoEm: new Date().toISOString(),
      parentId: parentId ?? null,
      autor: {
        id: session.user.id,
        nome: session.user.name ?? null,
        avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível comentar.' }
  }
}

export async function votarNoticiaFeed(
  alvoTipo: 'NOTICIA' | 'ARTIGO',
  alvoId: string,
  valor: 1 | -1 | 0,
  escopoParam: string,
): Promise<{ ok: true } | { error: string }> {
  const fd = new FormData()
  fd.set('escopo', escopoParam)
  fd.set('alvoTipo', alvoTipo)
  fd.set('alvoId', alvoId)
  fd.set('valor', String(valor))
  const r = await votarPracaAction(fd)
  if ('error' in r) return r
  return { ok: true }
}

export async function comentarTopicoFeed(
  topicoId: string,
  conteudo: string,
  escopoParam: string,
  parentId?: string,
): Promise<ForumRespostaFeedDto | { error: string }> {
  const parsed = responderTopicoSchema.safeParse({
    topicoId,
    conteudo,
    parentId: parentId || undefined,
  })
  if (!parsed.success) return { error: 'Resposta vazia.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(escopoParam)
    const topico = await db.forumTopico.findUnique({
      where: { id: parsed.data.topicoId },
      select: { id: true, escopo: true, tenantId: true, afiliacaoId: true, status: true },
    })
    if (!topico || topico.status !== 'VISIVEL') return { error: 'Tópico não encontrado.' }
    if (!podeVerTopicoNoEscopo(escopo, ancora, topico)) return { error: 'Tópico fora deste canal.' }

    if (escopo === 'nacional') await assertComunidadeNacional()
    else if (ancora.tenantId) await assertPostNoTenant(session.user.id, ancora.tenantId)
    else return { error: 'Canal sem tenant.' }

    await assertTetoSinaisPraca(session.user.id, ancora)

    if (parsed.data.parentId) {
      const pai: { topicoId: string; oculto: boolean } | null = await db.forumResposta.findUnique({
        where: { id: parsed.data.parentId },
        select: { topicoId: true, oculto: true },
      })
      if (!pai || pai.oculto || pai.topicoId !== topico.id) {
        return { error: 'Resposta não encontrada.' }
      }
    }

    const resposta: { id: string; conteudo: string; criadoEm: Date; parentId: string | null } =
      await db.forumResposta.create({
        data: {
          topicoId: topico.id,
          autorId: session.user.id,
          conteudo: parsed.data.conteudo,
          parentId: parsed.data.parentId ?? null,
        },
        select: { id: true, conteudo: true, criadoEm: true, parentId: true },
      })
    await db.forumTopico.update({
      where: { id: topico.id },
      data: { respostasCount: { increment: 1 } },
    })
    await registrarScorePraca({
      userId: session.user.id,
      ancora,
      sinal: 'resposta',
      peso: PESOS_PRACA.resposta,
      origemTipo: 'ForumResposta',
      origemId: topico.id,
      campo: 'respostas',
    })
    return {
      id: resposta.id,
      conteudo: resposta.conteudo,
      criadoEm: resposta.criadoEm.toISOString(),
      parentId: resposta.parentId,
      autor: {
        id: session.user.id,
        nome: session.user.name ?? null,
        avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível responder.' }
  }
}

export async function votarTopicoFeed(
  topicoId: string,
  valor: 1 | -1 | 0,
  escopoParam: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const { session, escopo, ancora } = await contextoEscopo(escopoParam)
    const topico = await db.forumTopico.findUnique({
      where: { id: topicoId },
      select: { id: true, escopo: true, tenantId: true, afiliacaoId: true, autorId: true },
    })
    if (!topico || !podeVerTopicoNoEscopo(escopo, ancora, topico)) {
      return { error: 'Tópico fora deste canal.' }
    }

    const anterior: { valor: number } | null = await db.pracaVoto.findUnique({
      where: {
        userId_alvoTipo_alvoId: {
          userId: session.user.id,
          alvoTipo: 'TOPICO',
          alvoId: topicoId,
        },
      },
      select: { valor: true },
    })

    if (valor === 0) {
      if (!anterior) return { ok: true }
      await db.pracaVoto.delete({
        where: {
          userId_alvoTipo_alvoId: {
            userId: session.user.id,
            alvoTipo: 'TOPICO',
            alvoId: topicoId,
          },
        },
      })
      await aplicarDeltaVotoTopico(topicoId, 0, anterior.valor)
      return { ok: true }
    }

    if (!anterior) await assertTetoSinaisPraca(session.user.id, ancora)

    await db.pracaVoto.upsert({
      where: {
        userId_alvoTipo_alvoId: {
          userId: session.user.id,
          alvoTipo: 'TOPICO',
          alvoId: topicoId,
        },
      },
      create: {
        userId: session.user.id,
        alvoTipo: 'TOPICO',
        alvoId: topicoId,
        valor,
      },
      update: { valor },
    })
    await aplicarDeltaVotoTopico(topicoId, valor, anterior?.valor ?? null)

    if (topico.autorId !== session.user.id) {
      if (valor === 1 && anterior?.valor !== 1) {
        await registrarScorePraca({
          userId: topico.autorId,
          ancora,
          sinal: 'gostei_recebido',
          peso: PESOS_PRACA.gostei,
          origemTipo: 'ForumTopico',
          origemId: topicoId,
          campo: 'gosteiRecebidos',
        })
      }
      if (valor === -1 && anterior?.valor !== -1) {
        await registrarScorePraca({
          userId: topico.autorId,
          ancora,
          sinal: 'nao_gostei_recebido',
          peso: PESOS_PRACA.naoGostei,
          origemTipo: 'ForumTopico',
          origemId: topicoId,
          campo: 'naoGosteiRecebidos',
        })
      }
    }
    if (!anterior) {
      await registrarScorePraca({
        userId: session.user.id,
        ancora,
        sinal: 'voto_emitido',
        peso: 0,
        origemTipo: 'TOPICO',
        origemId: topicoId,
      })
    }
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível votar.' }
  }
}

export async function votarPracaAction(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const parsed = votarPracaSchema.safeParse({
    alvoTipo: formData.get('alvoTipo'),
    alvoId: formData.get('alvoId'),
    valor: Number(formData.get('valor')),
  })
  if (!parsed.success) return { error: 'Voto inválido.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    if (parsed.data.alvoTipo === 'TOPICO') {
      const topico = await db.forumTopico.findUnique({
        where: { id: parsed.data.alvoId },
        select: { id: true, escopo: true, tenantId: true, afiliacaoId: true, autorId: true },
      })
      if (!topico || !podeVerTopicoNoEscopo(escopo, ancora, topico)) {
        return { error: 'Tópico fora deste canal.' }
      }
    }
    if (parsed.data.alvoTipo === 'ARTIGO') {
      const artigo = await db.artigoPortal.findUnique({
        where: { id: parsed.data.alvoId },
        select: { tenantId: true, status: true },
      })
      if (!artigo || artigo.status !== 'PUBLICADO') return { error: 'Artigo não encontrado.' }
      if (!podeVerArtigoNoEscopo(escopo, ancora, artigo.tenantId)) {
        return { error: 'Artigo fora deste canal.' }
      }
    }
    if (parsed.data.alvoTipo === 'NOTICIA' && escopo !== 'nacional') {
      return { error: 'Notícia de imprensa só no portal do clube.' }
    }
    if (parsed.data.alvoTipo === 'COMENTARIO') {
      const comentario = await db.pracaComentario.findUnique({
        where: { id: parsed.data.alvoId },
        select: { id: true, alvoTipo: true, alvoId: true, oculto: true },
      })
      if (!comentario || comentario.oculto) return { error: 'Comentário não encontrado.' }
      if (comentario.alvoTipo === 'ARTIGO') {
        const artigo = await db.artigoPortal.findUnique({
          where: { id: comentario.alvoId },
          select: { tenantId: true, status: true },
        })
        if (!artigo || artigo.status !== 'PUBLICADO') return { error: 'Artigo não encontrado.' }
        if (!podeVerArtigoNoEscopo(escopo, ancora, artigo.tenantId)) {
          return { error: 'Comentário fora deste canal.' }
        }
      }
      if (comentario.alvoTipo === 'NOTICIA' && escopo !== 'nacional') {
        return { error: 'Comentário fora deste canal.' }
      }
    }

    const anterior: { valor: number } | null = await db.pracaVoto.findUnique({
      where: {
        userId_alvoTipo_alvoId: {
          userId: session.user.id,
          alvoTipo: parsed.data.alvoTipo,
          alvoId: parsed.data.alvoId,
        },
      },
      select: { valor: true },
    })

    if (parsed.data.valor === 0) {
      if (!anterior) return { ok: true }
      await db.pracaVoto.delete({
        where: {
          userId_alvoTipo_alvoId: {
            userId: session.user.id,
            alvoTipo: parsed.data.alvoTipo,
            alvoId: parsed.data.alvoId,
          },
        },
      })
      if (parsed.data.alvoTipo === 'TOPICO') {
        await aplicarDeltaVotoTopico(parsed.data.alvoId, 0, anterior.valor)
      }
      if (parsed.data.alvoTipo === 'ARTIGO') {
        await aplicarDeltaVotoArtigo(parsed.data.alvoId, 0, anterior.valor)
      }
      if (parsed.data.alvoTipo === 'COMENTARIO') {
        await aplicarDeltaVotoComentario(parsed.data.alvoId, 0, anterior.valor)
      }
      revalidatePath('/portal/comunidade')
      revalidatePath('/portal/comunidade/noticias')
      revalidatePath(`/portal/comunidade/forum/${parsed.data.alvoId}`)
      return { ok: true }
    }

    if (!anterior) await assertTetoSinaisPraca(session.user.id, ancora)

    await db.pracaVoto.upsert({
      where: {
        userId_alvoTipo_alvoId: {
          userId: session.user.id,
          alvoTipo: parsed.data.alvoTipo,
          alvoId: parsed.data.alvoId,
        },
      },
      create: {
        userId: session.user.id,
        alvoTipo: parsed.data.alvoTipo,
        alvoId: parsed.data.alvoId,
        valor: parsed.data.valor,
      },
      update: { valor: parsed.data.valor },
    })

    if (parsed.data.alvoTipo === 'ARTIGO') {
      await aplicarDeltaVotoArtigo(parsed.data.alvoId, parsed.data.valor, anterior?.valor ?? null)
    }

    if (parsed.data.alvoTipo === 'COMENTARIO') {
      await aplicarDeltaVotoComentario(parsed.data.alvoId, parsed.data.valor, anterior?.valor ?? null)
    }

    if (parsed.data.alvoTipo === 'TOPICO') {
      await aplicarDeltaVotoTopico(parsed.data.alvoId, parsed.data.valor, anterior?.valor ?? null)
      const topicoAutor = await db.forumTopico.findUnique({
        where: { id: parsed.data.alvoId },
        select: { autorId: true },
      })
      if (topicoAutor && topicoAutor.autorId !== session.user.id) {
        if (parsed.data.valor === 1 && anterior?.valor !== 1) {
          await registrarScorePraca({
            userId: topicoAutor.autorId,
            ancora,
            sinal: 'gostei_recebido',
            peso: PESOS_PRACA.gostei,
            origemTipo: 'ForumTopico',
            origemId: parsed.data.alvoId,
            campo: 'gosteiRecebidos',
          })
        }
        if (parsed.data.valor === -1 && anterior?.valor !== -1) {
          await registrarScorePraca({
            userId: topicoAutor.autorId,
            ancora,
            sinal: 'nao_gostei_recebido',
            peso: PESOS_PRACA.naoGostei,
            origemTipo: 'ForumTopico',
            origemId: parsed.data.alvoId,
            campo: 'naoGosteiRecebidos',
          })
        }
      }
    }

    if (!anterior) {
      await registrarScorePraca({
        userId: session.user.id,
        ancora,
        sinal: 'voto_emitido',
        peso: 0,
        origemTipo: parsed.data.alvoTipo,
        origemId: parsed.data.alvoId,
      })
    }

    revalidatePath('/portal/comunidade')
    revalidatePath('/portal/comunidade/noticias')
    revalidatePath(`/portal/comunidade/forum/${parsed.data.alvoId}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível votar.' }
  }
}

export async function comentarPracaAction(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const parentRaw = formData.get('parentId')
  const parsed = comentarPracaSchema.safeParse({
    alvoTipo: formData.get('alvoTipo'),
    alvoId: formData.get('alvoId'),
    conteudo: formData.get('conteudo'),
    parentId: typeof parentRaw === 'string' && parentRaw.trim() ? parentRaw : undefined,
  })
  if (!parsed.success) return { error: 'Comentário vazio.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    if (parsed.data.alvoTipo === 'ARTIGO') {
      const artigo = await db.artigoPortal.findUnique({
        where: { id: parsed.data.alvoId },
        select: { tenantId: true, status: true },
      })
      if (!artigo || !podeVerArtigoNoEscopo(escopo, ancora, artigo.tenantId)) {
        return { error: 'Artigo fora deste canal.' }
      }
    }
    if (parsed.data.alvoTipo === 'NOTICIA' && escopo !== 'nacional') {
      return { error: 'Comentário de imprensa só no portal do clube.' }
    }

    if (parsed.data.parentId) {
      const pai = await db.pracaComentario.findUnique({
        where: { id: parsed.data.parentId },
        select: { alvoTipo: true, alvoId: true, oculto: true },
      })
      if (!pai || pai.oculto) return { error: 'Comentário não encontrado.' }
      if (pai.alvoTipo !== parsed.data.alvoTipo || pai.alvoId !== parsed.data.alvoId) {
        return { error: 'Resposta fora deste card.' }
      }
    }

    await db.pracaComentario.create({
      data: {
        autorId: session.user.id,
        alvoTipo: parsed.data.alvoTipo,
        alvoId: parsed.data.alvoId,
        parentId: parsed.data.parentId ?? null,
        conteudo: parsed.data.conteudo,
      },
    })
    revalidatePath('/portal/comunidade/noticias')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível comentar.' }
  }
}

export async function editarComentarioPraca(
  comentarioId: string,
  conteudo: string,
  escopoParam: string,
): Promise<ForumRespostaFeedDto | { error: string }> {
  const parsed = editarComentarioPracaSchema.safeParse({ comentarioId, conteudo })
  if (!parsed.success) return { error: 'Comentário inválido.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(escopoParam)
    const existente: {
      id: string
      alvoTipo: 'ARTIGO' | 'NOTICIA' | 'TOPICO' | 'RESPOSTA' | 'COMENTARIO'
      alvoId: string
      parentId: string | null
      oculto: boolean
      criadoEm: Date
    } | null = await db.pracaComentario.findFirst({
      where: { id: parsed.data.comentarioId, autorId: session.user.id },
      select: {
        id: true,
        alvoTipo: true,
        alvoId: true,
        parentId: true,
        oculto: true,
        criadoEm: true,
      },
    })
    if (!existente || existente.oculto) return { error: 'Comentário não encontrado.' }
    if (existente.alvoTipo !== 'ARTIGO' && existente.alvoTipo !== 'NOTICIA') {
      return { error: 'Comentário inválido.' }
    }
    if (existente.alvoTipo === 'ARTIGO') {
      const artigo = await db.artigoPortal.findUnique({
        where: { id: existente.alvoId },
        select: { tenantId: true },
      })
      if (!artigo || !podeVerArtigoNoEscopo(escopo, ancora, artigo.tenantId)) {
        return { error: 'Artigo fora deste canal.' }
      }
    }
    if (existente.alvoTipo === 'NOTICIA' && escopo !== 'nacional') {
      return { error: 'Comentário de imprensa só no portal do clube.' }
    }

    const atualizado: { id: string; conteudo: string; criadoEm: Date; parentId: string | null } =
      await db.pracaComentario.update({
        where: { id: existente.id },
        data: { conteudo: parsed.data.conteudo },
        select: { id: true, conteudo: true, criadoEm: true, parentId: true },
      })

    await db.auditLog.create({
      data: {
        tenantId: ancora.tenantId,
        atorId: session.user.id,
        acao: 'PRACA_COMENTARIO_EDITADO',
        entidade: 'PracaComentario',
        entidadeId: atualizado.id,
        detalhes: { alvoTipo: existente.alvoTipo, alvoId: existente.alvoId },
      },
    })

    revalidatePath('/portal/comunidade/noticias')
    revalidatePath(`/portal/comunidade/noticias/${existente.alvoId}`)

    return {
      id: atualizado.id,
      conteudo: atualizado.conteudo,
      criadoEm: atualizado.criadoEm.toISOString(),
      parentId: atualizado.parentId,
      autor: {
        id: session.user.id,
        nome: session.user.name ?? null,
        avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível editar.' }
  }
}

export async function excluirComentarioPraca(
  comentarioId: string,
  escopoParam: string,
): Promise<{ ok: true } | { error: string }> {
  const id = z.string().min(1).safeParse(comentarioId)
  if (!id.success) return { error: 'Comentário inválido.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(escopoParam)
    const existente: {
      id: string
      alvoTipo: 'ARTIGO' | 'NOTICIA' | 'TOPICO' | 'RESPOSTA' | 'COMENTARIO'
      alvoId: string
    } | null = await db.pracaComentario.findFirst({
      where: { id: id.data, autorId: session.user.id },
      select: { id: true, alvoTipo: true, alvoId: true },
    })
    if (!existente) return { error: 'Comentário não encontrado.' }
    if (existente.alvoTipo !== 'ARTIGO' && existente.alvoTipo !== 'NOTICIA') {
      return { error: 'Comentário inválido.' }
    }
    if (existente.alvoTipo === 'ARTIGO') {
      const artigo = await db.artigoPortal.findUnique({
        where: { id: existente.alvoId },
        select: { tenantId: true },
      })
      if (!artigo || !podeVerArtigoNoEscopo(escopo, ancora, artigo.tenantId)) {
        return { error: 'Artigo fora deste canal.' }
      }
    }
    if (existente.alvoTipo === 'NOTICIA' && escopo !== 'nacional') {
      return { error: 'Comentário de imprensa só no portal do clube.' }
    }

    await db.pracaComentario.delete({ where: { id: existente.id } })

    await db.auditLog.create({
      data: {
        tenantId: ancora.tenantId,
        atorId: session.user.id,
        acao: 'PRACA_COMENTARIO_EXCLUIDO',
        entidade: 'PracaComentario',
        entidadeId: existente.id,
        detalhes: { alvoTipo: existente.alvoTipo, alvoId: existente.alvoId },
      },
    })

    revalidatePath('/portal/comunidade/noticias')
    revalidatePath(`/portal/comunidade/noticias/${existente.alvoId}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível excluir.' }
  }
}

export async function editarRespostaForum(
  respostaId: string,
  conteudo: string,
  escopoParam: string,
): Promise<ForumRespostaFeedDto | { error: string }> {
  const parsed = editarRespostaForumSchema.safeParse({ respostaId, conteudo })
  if (!parsed.success) return { error: 'Resposta inválida.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(escopoParam)
    const existente: {
      id: string
      topicoId: string
      parentId: string | null
      oculto: boolean
      criadoEm: Date
      topico: {
        escopo: 'CLUBE' | 'TORCIDA'
        tenantId: string | null
        afiliacaoId: string | null
        status: string
      }
    } | null = await db.forumResposta.findFirst({
      where: { id: parsed.data.respostaId, autorId: session.user.id },
      select: {
        id: true,
        topicoId: true,
        parentId: true,
        oculto: true,
        criadoEm: true,
        topico: { select: { escopo: true, tenantId: true, afiliacaoId: true, status: true } },
      },
    })
    if (!existente || existente.oculto || existente.topico.status !== 'VISIVEL') {
      return { error: 'Resposta não encontrada.' }
    }
    if (!podeVerTopicoNoEscopo(escopo, ancora, existente.topico)) {
      return { error: 'Tópico fora deste canal.' }
    }

    const atualizado: { id: string; conteudo: string; criadoEm: Date; parentId: string | null } =
      await db.forumResposta.update({
        where: { id: existente.id },
        data: { conteudo: parsed.data.conteudo },
        select: { id: true, conteudo: true, criadoEm: true, parentId: true },
      })

    await db.auditLog.create({
      data: {
        tenantId: ancora.tenantId,
        atorId: session.user.id,
        acao: 'FORUM_RESPOSTA_EDITADA',
        entidade: 'ForumResposta',
        entidadeId: atualizado.id,
        detalhes: { topicoId: existente.topicoId },
      },
    })

    revalidatePath(`/portal/comunidade/forum/${existente.topicoId}`)
    revalidatePath('/portal/comunidade')

    return {
      id: atualizado.id,
      conteudo: atualizado.conteudo,
      criadoEm: atualizado.criadoEm.toISOString(),
      parentId: atualizado.parentId,
      autor: {
        id: session.user.id,
        nome: session.user.name ?? null,
        avatarUrl: await getAvatarAtualDoUsuario(session.user.id),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível editar.' }
  }
}

export async function excluirRespostaForum(
  respostaId: string,
  escopoParam: string,
): Promise<{ ok: true } | { error: string }> {
  const id = z.string().min(1).safeParse(respostaId)
  if (!id.success) return { error: 'Resposta inválida.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(escopoParam)
    const existente: {
      id: string
      topicoId: string
      oculto: boolean
      topico: {
        escopo: 'CLUBE' | 'TORCIDA'
        tenantId: string | null
        afiliacaoId: string | null
        status: string
      }
    } | null = await db.forumResposta.findFirst({
      where: { id: id.data, autorId: session.user.id },
      select: {
        id: true,
        topicoId: true,
        oculto: true,
        topico: { select: { escopo: true, tenantId: true, afiliacaoId: true, status: true } },
      },
    })
    if (!existente) return { error: 'Resposta não encontrada.' }
    if (!podeVerTopicoNoEscopo(escopo, ancora, existente.topico)) {
      return { error: 'Tópico fora deste canal.' }
    }

    await db.forumResposta.delete({ where: { id: existente.id } })
    if (!existente.oculto) {
      await db.forumTopico.update({
        where: { id: existente.topicoId },
        data: { respostasCount: { decrement: 1 } },
      })
    }

    await db.auditLog.create({
      data: {
        tenantId: ancora.tenantId,
        atorId: session.user.id,
        acao: 'FORUM_RESPOSTA_EXCLUIDA',
        entidade: 'ForumResposta',
        entidadeId: existente.id,
        detalhes: { topicoId: existente.topicoId },
      },
    })

    revalidatePath(`/portal/comunidade/forum/${existente.topicoId}`)
    revalidatePath('/portal/comunidade')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível excluir.' }
  }
}

export async function publicarArtigoAction(formData: FormData): Promise<{ ok: true; id: string } | { error: string }> {
  const parsed = publicarArtigoSchema.safeParse({
    titulo: formData.get('titulo'),
    resumo: formData.get('resumo') || undefined,
    corpo: formData.get('corpo'),
    capaUrl: formData.get('capaUrl') || undefined,
  })
  if (!parsed.success) return { error: 'Título e texto são obrigatórios.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    if (escopo === 'nacional') return { error: 'Artigo oficial é da torcida/unidade, não do clube.' }
    if (!ancora.tenantId) return { error: 'Canal sem tenant.' }

    const r = await persistirArtigo({
      userId: session.user.id,
      tenantId: ancora.tenantId,
      titulo: parsed.data.titulo,
      corpo: parsed.data.corpo,
      resumo: parsed.data.resumo,
      midiaUrls: parsed.data.capaUrl ? [parsed.data.capaUrl] : [],
    })
    if ('error' in r) return { error: r.error }
    return { ok: true, id: r.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível publicar.' }
  }
}

export async function moderarTopicoAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const parsed = moderarTopicoSchema.safeParse({
    topicoId: formData.get('topicoId'),
    acao: formData.get('acao'),
    motivo: formData.get('motivo') || undefined,
  })
  if (!parsed.success) return { error: 'Pedido inválido.' }
  if (parsed.data.acao === 'rejeitar' && !parsed.data.motivo) {
    return { error: 'Diga o motivo da recusa.' }
  }

  try {
    const { session, ctx, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    const tenantMod = tenantModeracaoPraca(ancora, ctx)
    if (!(await podeModerarPraca(session.user.id, tenantMod))) {
      return { error: 'Sem permissão para moderar neste canal.' }
    }
    const topico = await db.forumTopico.findUnique({
      where: { id: parsed.data.topicoId },
      select: {
        id: true,
        escopo: true,
        tenantId: true,
        afiliacaoId: true,
        status: true,
        fixado: true,
        autorId: true,
      },
    })
    if (!topico || !podeVerTopicoNoEscopo(escopo, ancora, topico)) {
      return { error: 'Tópico fora deste canal.' }
    }

    if (parsed.data.acao === 'ocultar') {
      await db.forumTopico.update({
        where: { id: topico.id },
        data: { status: 'OCULTO' },
      })
    } else if (parsed.data.acao === 'aprovar') {
      if (topico.status !== 'PENDENTE' && topico.status !== 'REJEITADO') {
        return { error: 'Este tópico não está na fila.' }
      }
      await db.forumTopico.update({
        where: { id: topico.id },
        data: { status: 'VISIVEL', rejeitadoMotivo: null },
      })
      await registrarScorePraca({
        userId: topico.autorId,
        ancora,
        sinal: 'topico',
        peso: PESOS_PRACA.topico,
        origemTipo: 'ForumTopico',
        origemId: topico.id,
        campo: 'topicos',
      })
    } else if (parsed.data.acao === 'rejeitar') {
      await db.forumTopico.update({
        where: { id: topico.id },
        data: { status: 'REJEITADO', rejeitadoMotivo: parsed.data.motivo, fixado: false },
      })
    } else {
      await db.forumTopico.update({
        where: { id: topico.id },
        data: { fixado: !topico.fixado },
      })
    }

    const acaoAudit =
      parsed.data.acao === 'ocultar'
        ? 'TOPICO_OCULTO'
        : parsed.data.acao === 'aprovar'
          ? 'TOPICO_APROVADO'
          : parsed.data.acao === 'rejeitar'
            ? 'TOPICO_REJEITADO'
            : 'TOPICO_FIXADO'

    await db.auditLog.create({
      data: {
        tenantId: ancora.tenantId,
        atorId: session.user.id,
        acao: acaoAudit,
        entidade: 'ForumTopico',
        entidadeId: topico.id,
        detalhes: {
          acao: parsed.data.acao,
          fixado: parsed.data.acao === 'fixar' ? !topico.fixado : undefined,
          motivo: parsed.data.motivo,
        },
      },
    })
    revalidatePath('/portal/comunidade/forum')
    revalidatePath(`/portal/comunidade/forum/${topico.id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível moderar.' }
  }
}

export async function moderarRespostaAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const parsed = moderarRespostaSchema.safeParse({
    respostaId: formData.get('respostaId'),
    acao: formData.get('acao'),
    motivo: formData.get('motivo') || undefined,
  })
  if (!parsed.success) return { error: 'Pedido inválido.' }
  if (parsed.data.acao === 'rejeitar' && !parsed.data.motivo) {
    return { error: 'Diga o motivo da recusa.' }
  }

  try {
    const { session, ctx, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    const tenantMod = tenantModeracaoPraca(ancora, ctx)
    if (!(await podeModerarPraca(session.user.id, tenantMod))) {
      return { error: 'Sem permissão para moderar neste canal.' }
    }
    const resposta: {
      id: string
      oculto: boolean
      topicoId: string
      topico: {
        escopo: 'CLUBE' | 'TORCIDA'
        tenantId: string | null
        afiliacaoId: string | null
        status: string
      }
    } | null = await db.forumResposta.findUnique({
      where: { id: parsed.data.respostaId },
      select: {
        id: true,
        oculto: true,
        topicoId: true,
        topico: { select: { escopo: true, tenantId: true, afiliacaoId: true, status: true } },
      },
    })
    if (!resposta || !podeVerTopicoNoEscopo(escopo, ancora, resposta.topico)) {
      return { error: 'Resposta fora deste canal.' }
    }

    const oculto = parsed.data.acao === 'rejeitar'
    await db.forumResposta.update({
      where: { id: resposta.id },
      data: { oculto },
    })
    if (oculto !== resposta.oculto) {
      await db.forumTopico.update({
        where: { id: resposta.topicoId },
        data: { respostasCount: { increment: oculto ? -1 : 1 } },
      })
    }

    await db.auditLog.create({
      data: {
        tenantId: ancora.tenantId,
        atorId: session.user.id,
        acao: oculto ? 'RESPOSTA_REJEITADA' : 'RESPOSTA_RESTAURADA',
        entidade: 'ForumResposta',
        entidadeId: resposta.id,
        detalhes: { motivo: parsed.data.motivo, topicoId: resposta.topicoId },
      },
    })
    revalidatePath(`/portal/comunidade/forum/${resposta.topicoId}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível moderar a resposta.' }
  }
}

type AlvoDenunciaResolvido = {
  autorId: string
  /** Trecho curto que a fila mostra — nunca o conteúdo inteiro. */
  trecho: string
}

/**
 * Denúncia na praça (tópico, resposta e comentário) — a única superfície
 * cross-tenant, e até aqui a única sem caminho de denúncia.
 *
 * Nunca lança: em produção, throw de Server Action vira HTTP 500 sem corpo.
 * Gravidade, SLA e escalonamento saem das regras puras de `@torcida/types` —
 * o cliente só escolhe a categoria.
 */
export async function denunciarPracaAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const parsed = denunciarPracaSchema.safeParse({
    alvoTipo: formData.get('alvoTipo'),
    alvoId: formData.get('alvoId'),
    categoria: formData.get('categoria'),
    motivo: formData.get('motivo') || undefined,
  })
  if (!parsed.success) return { error: 'Escolha um motivo para a denúncia.' }

  try {
    const { session, ctx, escopo, ancora } = await contextoEscopo(
      String(formData.get('escopo') ?? ''),
    )
    const viewerId = session.user.id

    let alvo: AlvoDenunciaResolvido | null = null

    if (parsed.data.alvoTipo === 'FORUM_TOPICO') {
      const topico: {
        escopo: 'CLUBE' | 'TORCIDA'
        tenantId: string | null
        afiliacaoId: string | null
        status: string
        autorId: string
        titulo: string
        corpo: string
      } | null = await db.forumTopico.findUnique({
        where: { id: parsed.data.alvoId },
        select: {
          escopo: true,
          tenantId: true,
          afiliacaoId: true,
          status: true,
          autorId: true,
          titulo: true,
          corpo: true,
        },
      })
      if (!topico || !podeVerTopicoNoEscopo(escopo, ancora, topico)) {
        return { error: 'Tópico fora deste canal.' }
      }
      alvo = { autorId: topico.autorId, trecho: topico.titulo || topico.corpo }
    } else if (parsed.data.alvoTipo === 'FORUM_RESPOSTA') {
      const resposta: {
        autorId: string
        conteudo: string
        topico: {
          escopo: 'CLUBE' | 'TORCIDA'
          tenantId: string | null
          afiliacaoId: string | null
          status: string
        }
      } | null = await db.forumResposta.findUnique({
        where: { id: parsed.data.alvoId },
        select: {
          autorId: true,
          conteudo: true,
          topico: { select: { escopo: true, tenantId: true, afiliacaoId: true, status: true } },
        },
      })
      if (!resposta || !podeVerTopicoNoEscopo(escopo, ancora, resposta.topico)) {
        return { error: 'Resposta fora deste canal.' }
      }
      alvo = { autorId: resposta.autorId, trecho: resposta.conteudo }
    } else {
      const comentario: {
        autorId: string
        conteudo: string
        alvoTipo: 'ARTIGO' | 'NOTICIA' | 'TOPICO' | 'RESPOSTA'
        alvoId: string
      } | null = await db.pracaComentario.findUnique({
        where: { id: parsed.data.alvoId },
        select: { autorId: true, conteudo: true, alvoTipo: true, alvoId: true },
      })
      if (!comentario) return { error: 'Comentário não encontrado.' }

      if (comentario.alvoTipo === 'ARTIGO') {
        const artigo: { tenantId: string; status: string } | null =
          await db.artigoPortal.findUnique({
            where: { id: comentario.alvoId },
            select: { tenantId: true, status: true },
          })
        if (!artigo || !podeVerArtigoNoEscopo(escopo, ancora, artigo.tenantId)) {
          return { error: 'Comentário fora deste canal.' }
        }
      } else if (comentario.alvoTipo === 'NOTICIA') {
        if (escopo !== 'nacional') return { error: 'Comentário fora deste canal.' }
      } else {
        return { error: 'Comentário fora deste canal.' }
      }
      alvo = { autorId: comentario.autorId, trecho: comentario.conteudo }
    }

    if (alvo.autorId === viewerId) {
      return { error: 'Não é possível denunciar o próprio conteúdo.' }
    }

    const limiterKey = `report:praca:${escopo}:${viewerId}`
    if (excedeuLimiteEngajamento(limiterKey)) {
      return { error: 'Você atingiu o limite de denúncias por minuto.' }
    }
    registrarAcaoEngajamento(limiterKey)

    const gravidade = gravidadeDaCategoria(parsed.data.categoria)
    const escalado = escalaParaPlataforma(gravidade)
    const prazoSla = prazoSlaDe(gravidade)
    const tenantModeracao = tenantModeracaoPraca(ancora, ctx)
    const motivo = parsed.data.motivo?.trim() || null

    const denuncia: { id: string } = await db.moderacaoDenuncia.create({
      data: {
        alvoTipo: parsed.data.alvoTipo,
        alvoId: parsed.data.alvoId,
        tenantId: tenantModeracao,
        afiliacaoId: ancora.afiliacaoId,
        denuncianteId: viewerId,
        categoria: parsed.data.categoria,
        gravidade,
        motivo,
        prazoSla,
        escalado,
      },
      select: { id: true },
    })

    await notificarDenunciaModeracao({
      tenantId: tenantModeracao,
      categoria: parsed.data.categoria,
      motivo,
      denuncianteUserId: viewerId,
      escalado,
    })

    await db.auditLog.create({
      data: {
        tenantId: tenantModeracao,
        atorId: viewerId,
        acao: 'FORUM_DENUNCIADO',
        entidade: 'ModeracaoDenuncia',
        entidadeId: denuncia.id,
        detalhes: {
          alvoTipo: parsed.data.alvoTipo,
          alvoId: parsed.data.alvoId,
          categoria: parsed.data.categoria,
          gravidade,
          escalado,
          escopo,
          trecho: alvo.trecho.slice(0, 140),
        },
      },
    })

    revalidatePath('/admin/comunidade/moderacao')
    // S4 (e escopo sem tenant) nasce na fila da plataforma — não espera o
    // moderador local abrir o caso.
    if (escalado || !tenantModeracao) revalidatePath('/super-admin/moderacao')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível denunciar.' }
  }
}

export async function registrarVisitaTopicoAction(
  formData: FormData,
): Promise<void> {
  const topicoId = String(formData.get('topicoId') ?? '')
  if (!topicoId) return
  try {
    const { escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    const topico = await db.forumTopico.findUnique({
      where: { id: topicoId },
      select: { escopo: true, tenantId: true, afiliacaoId: true, status: true },
    })
    if (!topico || topico.status !== 'VISIVEL') return
    if (!podeVerTopicoNoEscopo(escopo, ancora, topico)) return
    await db.forumTopico.update({
      where: { id: topicoId },
      data: { visitas: { increment: 1 } },
    })
  } catch {
    /* visita é best-effort */
  }
}

export async function registrarVisitaNoticiaAction(formData: FormData): Promise<void> {
  const alvoTipo = String(formData.get('alvoTipo') ?? '')
  const alvoId = String(formData.get('alvoId') ?? '')
  if (!alvoId || (alvoTipo !== 'ARTIGO' && alvoTipo !== 'NOTICIA')) return
  try {
    const { escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    if (alvoTipo === 'NOTICIA') {
      if (escopo !== 'nacional' || !ancora.afiliacaoId) return
      const n: { id: string; afiliacaoId: string; status: string } | null = await db.noticia.findUnique({
        where: { id: alvoId },
        select: { id: true, afiliacaoId: true, status: true },
      })
      if (!n || n.status !== 'APROVADA' || n.afiliacaoId !== ancora.afiliacaoId) return
      await db.noticia.update({ where: { id: n.id }, data: { visitas: { increment: 1 } } })
      return
    }
    const a: { id: string; tenantId: string; status: string } | null = await db.artigoPortal.findUnique({
      where: { id: alvoId },
      select: { id: true, tenantId: true, status: true },
    })
    if (!a || a.status !== 'PUBLICADO') return
    if (!podeVerArtigoNoEscopo(escopo, ancora, a.tenantId)) return
    await db.artigoPortal.update({ where: { id: a.id }, data: { visitas: { increment: 1 } } })
  } catch {
    /* visita é best-effort */
  }
}

async function assertGerirArtigo(
  userId: string,
  artigo: { autorId: string; tenantId: string },
): Promise<void> {
  if (artigo.autorId === userId) return
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, artigo.tenantId)
  const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
  if (!hasPermission(efetivas, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)) {
    throw new ExpectedError('Sem permissão para gerir esta notícia.')
  }
}

export async function alternarFixadoArtigo(artigoId: string, escopoParam: string): Promise<void> {
  const { session, escopo, ancora } = await contextoEscopo(escopoParam)
  const artigo: { id: string; autorId: string; tenantId: string; fixado: boolean; status: string } | null =
    await db.artigoPortal.findUnique({
      where: { id: artigoId },
      select: { id: true, autorId: true, tenantId: true, fixado: true, status: true },
    })
  if (!artigo || artigo.status !== 'PUBLICADO') throw new ExpectedError('Notícia não encontrada.')
  if (!podeVerArtigoNoEscopo(escopo, ancora, artigo.tenantId)) {
    throw new ExpectedError('Notícia fora deste canal.')
  }
  await assertGerirArtigo(session.user.id, artigo)
  await db.artigoPortal.update({
    where: { id: artigo.id },
    data: { fixado: !artigo.fixado },
  })
  await db.auditLog.create({
    data: {
      tenantId: artigo.tenantId,
      atorId: session.user.id,
      acao: artigo.fixado ? 'ARTIGO_DESAFIXADO' : 'ARTIGO_FIXADO',
      entidade: 'ArtigoPortal',
      entidadeId: artigo.id,
    },
  })
  revalidatePath('/portal/comunidade/noticias')
}

export async function excluirArtigo(artigoId: string, escopoParam: string): Promise<void> {
  const { session, escopo, ancora } = await contextoEscopo(escopoParam)
  const artigo: { id: string; autorId: string; tenantId: string; status: string } | null =
    await db.artigoPortal.findUnique({
      where: { id: artigoId },
      select: { id: true, autorId: true, tenantId: true, status: true },
    })
  if (!artigo || artigo.status !== 'PUBLICADO') throw new ExpectedError('Notícia não encontrada.')
  if (!podeVerArtigoNoEscopo(escopo, ancora, artigo.tenantId)) {
    throw new ExpectedError('Notícia fora deste canal.')
  }
  await assertGerirArtigo(session.user.id, artigo)
  await db.artigoPortal.update({
    where: { id: artigo.id },
    data: { status: 'OCULTO' },
  })
  await db.auditLog.create({
    data: {
      tenantId: artigo.tenantId,
      atorId: session.user.id,
      acao: 'ARTIGO_OCULTO',
      entidade: 'ArtigoPortal',
      entidadeId: artigo.id,
    },
  })
  revalidatePath('/portal/comunidade/noticias')
}

export { wherePracaNoEscopo }
