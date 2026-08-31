'use server'

import { revalidatePath } from 'next/cache'
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
  publicarArtigoSchema,
  podeVerArtigoNoEscopo,
  podeVerTopicoNoEscopo,
  wherePracaNoEscopo,
  moderarTopicoSchema,
} from '@torcida/types'
import { assertComunidadeNacional, assertNaoOperador } from '@/lib/authz'
import { ExpectedError } from '@/lib/expected-error'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { resolverContextoComunidade, resolverEscopoComunidade } from '@/lib/comunidade-contexto'
import {
  ancoraPraca,
  aplicarDeltaVotoTopico,
  registrarScorePraca,
  PESOS_PRACA,
  assertTetoSinaisPraca,
  podeModerarPraca,
  listarRespostasTopico,
} from '@/lib/praca'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'

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

type ComposerTopicoState = {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
  token?: string
  topicoId?: string
}

async function persistirTopico(opts: {
  userId: string
  escopo: 'nacional' | 'torcida' | 'unidade'
  ancora: { tenantId: string | null; afiliacaoId: string | null }
  titulo: string
  corpo: string
  midiaUrls: string[]
}): Promise<{ id: string } | { error: string }> {
  const { userId, escopo, ancora, titulo, corpo, midiaUrls } = opts

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
      },
    })
    await registrarScorePraca({
      userId,
      ancora: { tenantId: null, afiliacaoId: cn.afiliacaoId },
      sinal: 'topico',
      peso: PESOS_PRACA.topico,
      origemTipo: 'ForumTopico',
      origemId: topico.id,
      campo: 'topicos',
    })
    revalidatePath('/portal/comunidade/forum')
    return { id: topico.id }
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
    },
  })
  await registrarScorePraca({
    userId,
    ancora,
    sinal: 'topico',
    peso: PESOS_PRACA.topico,
    origemTipo: 'ForumTopico',
    origemId: topico.id,
    campo: 'topicos',
  })
  revalidatePath('/portal/comunidade/forum')
  return { id: topico.id }
}

export async function criarTopicoAction(formData: FormData): Promise<{ ok: true; id: string } | { error: string }> {
  const parsed = criarTopicoSchema.safeParse({
    titulo: formData.get('titulo'),
    corpo: formData.get('corpo'),
  })
  if (!parsed.success) return { error: 'Título e texto são obrigatórios.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    const r = await persistirTopico({
      userId: session.user.id,
      escopo,
      ancora,
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
    const { session, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    const r = await persistirTopico({
      userId: session.user.id,
      escopo,
      ancora,
      titulo,
      corpo: parsed.data.conteudo,
      midiaUrls: parsed.data.midias ?? [],
    })
    if ('error' in r) return { message: r.error }
    return { success: true, token: crypto.randomUUID(), topicoId: r.id }
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
  if (!topico || topico.status !== 'VISIVEL') throw new ExpectedError('Tópico não encontrado.')
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
  if (!topico || topico.status !== 'VISIVEL') throw new ExpectedError('Tópico não encontrado.')
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
    autor: {
      id: r.autor.id,
      nome: r.autor.nome,
      avatarUrl: r.autor.avatarUrl,
    },
  }))
}

export async function comentarTopicoFeed(
  topicoId: string,
  conteudo: string,
  escopoParam: string,
): Promise<ForumRespostaFeedDto | { error: string }> {
  const parsed = responderTopicoSchema.safeParse({ topicoId, conteudo })
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

    const resposta: { id: string; conteudo: string; criadoEm: Date } = await db.forumResposta.create({
      data: {
        topicoId: topico.id,
        autorId: session.user.id,
        conteudo: parsed.data.conteudo,
      },
      select: { id: true, conteudo: true, criadoEm: true },
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
  valor: 1 | 0,
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
        valor: 1,
      },
      update: { valor: 1 },
    })
    await aplicarDeltaVotoTopico(topicoId, 1, anterior?.valor ?? null)

    if (topico.autorId !== session.user.id && (!anterior || anterior.valor !== 1)) {
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
    revalidatePath(`/portal/comunidade/forum/${parsed.data.alvoId}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível votar.' }
  }
}

export async function comentarPracaAction(formData: FormData): Promise<{ ok: true } | { error: string }> {
  const parsed = comentarPracaSchema.safeParse({
    alvoTipo: formData.get('alvoTipo'),
    alvoId: formData.get('alvoId'),
    conteudo: formData.get('conteudo'),
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

    await db.pracaComentario.create({
      data: {
        autorId: session.user.id,
        alvoTipo: parsed.data.alvoTipo,
        alvoId: parsed.data.alvoId,
        conteudo: parsed.data.conteudo,
      },
    })
    revalidatePath('/portal/comunidade/noticias')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível comentar.' }
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

    const ehOficial = await assertArtigoNoTenant(session.user.id, ancora.tenantId)
    const artigo = await db.artigoPortal.create({
      data: {
        tenantId: ancora.tenantId,
        autorId: session.user.id,
        titulo: parsed.data.titulo,
        resumo: parsed.data.resumo,
        corpo: parsed.data.corpo,
        capaUrl: parsed.data.capaUrl,
        origem: ehOficial ? 'OFICIAL' : 'VERIFICADA',
        status: 'PUBLICADO',
        publicadoEm: new Date(),
      },
    })
    await db.auditLog.create({
      data: {
        tenantId: ancora.tenantId,
        atorId: session.user.id,
        acao: 'ARTIGO_PUBLICADO',
        entidade: 'ArtigoPortal',
        entidadeId: artigo.id,
        detalhes: { origem: artigo.origem },
      },
    })
    revalidatePath('/portal/comunidade/noticias')
    return { ok: true, id: artigo.id }
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
  })
  if (!parsed.success) return { error: 'Pedido inválido.' }

  try {
    const { session, escopo, ancora } = await contextoEscopo(String(formData.get('escopo') ?? ''))
    if (!(await podeModerarPraca(session.user.id, ancora.tenantId))) {
      return { error: 'Sem permissão para moderar neste canal.' }
    }
    const topico = await db.forumTopico.findUnique({
      where: { id: parsed.data.topicoId },
      select: { id: true, escopo: true, tenantId: true, afiliacaoId: true, status: true, fixado: true },
    })
    if (!topico || !podeVerTopicoNoEscopo(escopo, ancora, topico)) {
      return { error: 'Tópico fora deste canal.' }
    }

    if (parsed.data.acao === 'ocultar') {
      await db.forumTopico.update({
        where: { id: topico.id },
        data: { status: 'OCULTO' },
      })
    } else {
      await db.forumTopico.update({
        where: { id: topico.id },
        data: { fixado: !topico.fixado },
      })
    }

    await db.auditLog.create({
      data: {
        tenantId: ancora.tenantId,
        atorId: session.user.id,
        acao: parsed.data.acao === 'ocultar' ? 'TOPICO_OCULTO' : 'TOPICO_FIXADO',
        entidade: 'ForumTopico',
        entidadeId: topico.id,
        detalhes: { acao: parsed.data.acao, fixado: parsed.data.acao === 'fixar' ? !topico.fixado : undefined },
      },
    })
    revalidatePath('/portal/comunidade/forum')
    revalidatePath(`/portal/comunidade/forum/${topico.id}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível moderar.' }
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

export { wherePracaNoEscopo }
