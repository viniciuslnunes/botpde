import { db } from '@torcida/db'
import type {
  ArtigoPortal,
  Noticia,
  PracaAlvoTipo,
} from '@torcida/db'
import {
  PERMISSIONS,
  calculateEffectivePermissions,
  hasPermission,
  escopoChavePraca,
  wherePracaNoEscopo,
  podeVerArtigoNoEscopo,
  podeVerTopicoNoEscopo,
  PESO_TOPICO,
  PESO_RESPOSTA,
  PESO_GOSTEI_RECEBIDO,
  PESO_NAO_GOSTEI_RECEBIDO,
  ordenarCardsPraca,
  pctAprovacaoPraca,
  inicioJanelaSinaisPraca,
  SINAIS_BARATOS_PRACA,
  TETO_SINAIS_BARATOS_SEMANA,
  LIMIAR_RANKING_PRACA,
} from '@torcida/types'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { ContextoComunidadePortal } from '@/lib/comunidade-contexto'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { ExpectedError } from '@/lib/expected-error'

export type AncoraPraca = { tenantId: string | null; afiliacaoId: string | null }

export function sufixoEscopoPraca(escopo: EscopoComunidade): string {
  return `?escopo=${escopo}`
}

export function ancoraPraca(
  escopo: EscopoComunidade,
  ctx: ContextoComunidadePortal,
): AncoraPraca {
  const afiliacaoId = ctx.afiliacao?.id ?? null
  if (escopo === 'nacional') return { tenantId: null, afiliacaoId }
  if (ctx.modo !== 'torcida') return { tenantId: null, afiliacaoId }
  if (escopo === 'unidade') {
    return { tenantId: ctx.unidade?.tenantId ?? ctx.tenant.id, afiliacaoId }
  }
  return { tenantId: ctx.torcidaReal?.id ?? ctx.tenant.id, afiliacaoId }
}

export type ArtigoPortalItem = {
  id: string
  titulo: string
  resumo: string | null
  origem: 'OFICIAL' | 'VERIFICADA'
  publicadoEm: Date | null
  autorNome: string | null
}

export type ForumTopicoItem = {
  id: string
  titulo: string
  visitas: number
  respostasCount: number
  gostei: number
  naoGostei: number
  fixado: boolean
  atualizadoEm: Date
  autorNome: string | null
}

export type PracaFeedCard = {
  kind: 'noticia' | 'artigo' | 'topico'
  origem: 'imprensa' | 'oficial' | 'verificada' | 'forum'
  id: string
  titulo: string
  href: string
  meta: string
  criadoEm: Date
}

type ArtigoRow = {
  id: string
  titulo: string
  resumo: string | null
  origem: 'OFICIAL' | 'VERIFICADA'
  publicadoEm: Date | null
  autor: { nome: string | null }
}

export async function listarArtigosPortalDoTenant(tenantId: string): Promise<ArtigoPortalItem[]> {
  const rows: ArtigoRow[] = await db.artigoPortal.findMany({
    where: { tenantId, status: 'PUBLICADO' },
    orderBy: [{ origem: 'asc' }, { publicadoEm: 'desc' }, { criadoEm: 'desc' }],
    take: 40,
    select: {
      id: true,
      titulo: true,
      resumo: true,
      origem: true,
      publicadoEm: true,
      autor: { select: { nome: true } },
    },
  })
  return rows.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    resumo: a.resumo,
    origem: a.origem,
    publicadoEm: a.publicadoEm,
    autorNome: a.autor.nome,
  }))
}

type TopicoRow = {
  id: string
  titulo: string
  visitas: number
  respostasCount: number
  gostei: number
  naoGostei: number
  fixado: boolean
  atualizadoEm: Date
  autor: { nome: string | null }
}

export async function listarTopicos(
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
  ordem: 'recentes' | 'populares' | 'acessados' = 'recentes',
): Promise<ForumTopicoItem[]> {
  const where = wherePracaNoEscopo(escopo, ancora).topicos
  const orderBy =
    ordem === 'populares'
      ? ([{ fixado: 'desc' }, { gostei: 'desc' }, { respostasCount: 'desc' }] as const)
      : ordem === 'acessados'
        ? ([{ fixado: 'desc' }, { visitas: 'desc' }] as const)
        : ([{ fixado: 'desc' }, { atualizadoEm: 'desc' }] as const)
  const rows: TopicoRow[] = await db.forumTopico.findMany({
    where,
    orderBy: [...orderBy],
    take: 50,
    select: {
      id: true,
      titulo: true,
      visitas: true,
      respostasCount: true,
      gostei: true,
      naoGostei: true,
      fixado: true,
      atualizadoEm: true,
      autor: { select: { nome: true } },
    },
  })
  return rows.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    visitas: t.visitas,
    respostasCount: t.respostasCount,
    gostei: t.gostei,
    naoGostei: t.naoGostei,
    fixado: t.fixado,
    atualizadoEm: t.atualizadoEm,
    autorNome: t.autor.nome,
  }))
}

export type TopicoParaFeed = {
  id: string
  titulo: string
  corpo: string
  midiaUrls: string[]
  criadoEm: Date
  fixado: boolean
  gostei: number
  naoGostei: number
  respostasCount: number
  tenantId: string | null
  autor: {
    id: string
    nome: string | null
    nickname: string | null
    avatarUrl: string | null
  }
  meuVoto: 1 | -1 | null
}

export async function listarTopicosParaFeed(
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
  opts: {
    take: number
    cursor?: { id: string; criadoEmIso: string } | null
    userId?: string
  },
): Promise<TopicoParaFeed[]> {
  const where = wherePracaNoEscopo(escopo, ancora).topicos
  const data = opts.cursor ? new Date(opts.cursor.criadoEmIso) : null
  const cursorWhere =
    data && !Number.isNaN(data.getTime()) && opts.cursor
      ? {
          OR: [{ criadoEm: { lt: data } }, { criadoEm: data, id: { lt: opts.cursor.id } }],
        }
      : {}

  const rows: {
    id: string
    titulo: string
    corpo: string
    midiaUrls: string[]
    criadoEm: Date
    fixado: boolean
    gostei: number
    naoGostei: number
    respostasCount: number
    tenantId: string | null
    autorId: string
    autor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  }[] = await db.forumTopico.findMany({
    where: { ...where, ...cursorWhere },
    orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    take: opts.take,
    select: {
      id: true,
      titulo: true,
      corpo: true,
      midiaUrls: true,
      criadoEm: true,
      fixado: true,
      gostei: true,
      naoGostei: true,
      respostasCount: true,
      tenantId: true,
      autorId: true,
      autor: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
    },
  })

  const votos: { alvoId: string; valor: number }[] =
    opts.userId && rows.length > 0
      ? await db.pracaVoto.findMany({
          where: {
            userId: opts.userId,
            alvoTipo: 'TOPICO',
            alvoId: { in: rows.map((r) => r.id) },
          },
          select: { alvoId: true, valor: true },
        })
      : []
  const votoPorId = new Map(votos.map((v) => [v.alvoId, v.valor]))

  return rows.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    corpo: t.corpo,
    midiaUrls: t.midiaUrls,
    criadoEm: t.criadoEm,
    fixado: t.fixado,
    gostei: t.gostei,
    naoGostei: t.naoGostei,
    respostasCount: t.respostasCount,
    tenantId: t.tenantId,
    autor: t.autor,
    meuVoto: votoPorId.get(t.id) === 1 || votoPorId.get(t.id) === -1 ? (votoPorId.get(t.id) as 1 | -1) : null,
  }))
}

export type ForumRespostaFeedItem = {
  id: string
  conteudo: string
  criadoEm: Date
  autor: { id: string; nome: string | null; avatarUrl: string | null }
}

export async function listarRespostasTopico(
  topicoId: string,
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
): Promise<ForumRespostaFeedItem[]> {
  const t: {
    id: string
    escopo: 'CLUBE' | 'TORCIDA'
    tenantId: string | null
    afiliacaoId: string | null
    status: string
  } | null = await db.forumTopico.findUnique({
    where: { id: topicoId },
    select: { id: true, escopo: true, tenantId: true, afiliacaoId: true, status: true },
  })
  if (!t || t.status !== 'VISIVEL') return []
  if (!podeVerTopicoNoEscopo(escopo, ancora, t)) return []

  const rows: {
    id: string
    conteudo: string
    criadoEm: Date
    autor: { id: string; nome: string | null; avatarUrl: string | null }
  }[] = await db.forumResposta.findMany({
    where: { topicoId, oculto: false, parentId: null },
    orderBy: { criadoEm: 'asc' },
    take: 40,
    select: {
      id: true,
      conteudo: true,
      criadoEm: true,
      autor: { select: { id: true, nome: true, avatarUrl: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    conteudo: r.conteudo,
    criadoEm: r.criadoEm,
    autor: r.autor,
  }))
}

export async function getPracaFeedCards(
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
): Promise<PracaFeedCard[]> {
  const sufixo = sufixoEscopoPraca(escopo)
  const cards: PracaFeedCard[] = []

  if (escopo === 'nacional' && ancora.afiliacaoId) {
    const noticias: Pick<Noticia, 'id' | 'titulo' | 'fonte' | 'publicadoEm' | 'criadoEm'>[] =
      await db.noticia.findMany({
        where: { afiliacaoId: ancora.afiliacaoId, status: 'APROVADA' },
        orderBy: { publicadoEm: 'desc' },
        take: 6,
        select: { id: true, titulo: true, fonte: true, publicadoEm: true, criadoEm: true },
      })
    for (const n of noticias) {
      cards.push({
        kind: 'noticia',
        origem: 'imprensa',
        id: n.id,
        titulo: n.titulo,
        href: `/portal/comunidade/noticias/${n.id}${sufixo}`,
        meta: n.fonte,
        criadoEm: n.publicadoEm ?? n.criadoEm,
      })
    }
  }

  const where = wherePracaNoEscopo(escopo, ancora)

  if (escopo !== 'nacional' && ancora.tenantId) {
    const artigos: Pick<ArtigoPortal, 'id' | 'titulo' | 'origem' | 'publicadoEm' | 'criadoEm'>[] =
      await db.artigoPortal.findMany({
        where: where.artigos,
        orderBy: { publicadoEm: 'desc' },
        take: 6,
        select: { id: true, titulo: true, origem: true, publicadoEm: true, criadoEm: true },
      })
    for (const a of artigos) {
      cards.push({
        kind: 'artigo',
        origem: a.origem === 'OFICIAL' ? 'oficial' : 'verificada',
        id: a.id,
        titulo: a.titulo,
        href: `/portal/comunidade/noticias/${a.id}${sufixo}`,
        meta: a.origem === 'OFICIAL' ? 'Oficial' : 'Fonte verificada',
        criadoEm: a.publicadoEm ?? a.criadoEm,
      })
    }
  }

  return ordenarCardsPraca(cards).slice(0, 8)
}

export { podeVerArtigoNoEscopo, podeVerTopicoNoEscopo }

export async function registrarScorePraca(opts: {
  userId: string
  ancora: AncoraPraca
  sinal: string
  peso: number
  origemTipo: string
  origemId: string
  campo?: 'topicos' | 'respostas' | 'gosteiRecebidos' | 'naoGosteiRecebidos'
}): Promise<void> {
  const chave = opts.ancora.tenantId
    ? escopoChavePraca({ tenantId: opts.ancora.tenantId })
    : opts.ancora.afiliacaoId
      ? escopoChavePraca({ afiliacaoId: opts.ancora.afiliacaoId })
      : null
  if (!chave) return

  await db.forumScoreEvento.create({
    data: {
      userId: opts.userId,
      escopoChave: chave,
      sinal: opts.sinal,
      peso: opts.peso,
      origemTipo: opts.origemTipo,
      origemId: opts.origemId,
    },
  })

  if (opts.peso === 0 && !opts.campo) return

  const extra =
    opts.campo === 'topicos'
      ? { topicos: { increment: 1 } }
      : opts.campo === 'respostas'
        ? { respostas: { increment: 1 } }
        : opts.campo === 'gosteiRecebidos'
          ? { gosteiRecebidos: { increment: 1 } }
          : opts.campo === 'naoGosteiRecebidos'
            ? { naoGosteiRecebidos: { increment: 1 } }
            : {}

  await db.forumScoreSaldo.upsert({
    where: { userId_escopoChave: { userId: opts.userId, escopoChave: chave } },
    create: {
      userId: opts.userId,
      escopoChave: chave,
      tenantId: opts.ancora.tenantId,
      afiliacaoId: opts.ancora.afiliacaoId,
      score: opts.peso,
      topicos: opts.campo === 'topicos' ? 1 : 0,
      respostas: opts.campo === 'respostas' ? 1 : 0,
      gosteiRecebidos: opts.campo === 'gosteiRecebidos' ? 1 : 0,
      naoGosteiRecebidos: opts.campo === 'naoGosteiRecebidos' ? 1 : 0,
    },
    update: { score: { increment: opts.peso }, ...extra },
  })
}

export const PESOS_PRACA = {
  topico: PESO_TOPICO,
  resposta: PESO_RESPOSTA,
  gostei: PESO_GOSTEI_RECEBIDO,
  naoGostei: PESO_NAO_GOSTEI_RECEBIDO,
} as const

export type NoticiaPracaDetalhe = {
  kind: 'noticia'
  id: string
  titulo: string
  resumo: string | null
  url: string
  fonte: string
  publicadoEm: Date | null
}

export type ArtigoPracaDetalhe = {
  kind: 'artigo'
  id: string
  titulo: string
  resumo: string | null
  corpo: string
  origem: 'OFICIAL' | 'VERIFICADA'
  publicadoEm: Date | null
  autorNome: string | null
  tenantId: string
}

export async function resolverNoticiaOuArtigo(
  id: string,
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
): Promise<NoticiaPracaDetalhe | ArtigoPracaDetalhe | null> {
  if (escopo === 'nacional' && ancora.afiliacaoId) {
    const n: {
      id: string
      titulo: string
      resumo: string | null
      url: string
      fonte: string
      publicadoEm: Date | null
      afiliacaoId: string
      status: string
    } | null = await db.noticia.findUnique({
      where: { id },
      select: {
        id: true,
        titulo: true,
        resumo: true,
        url: true,
        fonte: true,
        publicadoEm: true,
        afiliacaoId: true,
        status: true,
      },
    })
    if (n && n.status === 'APROVADA' && n.afiliacaoId === ancora.afiliacaoId) {
      return {
        kind: 'noticia',
        id: n.id,
        titulo: n.titulo,
        resumo: n.resumo,
        url: n.url,
        fonte: n.fonte,
        publicadoEm: n.publicadoEm,
      }
    }
    return null
  }

  if (!ancora.tenantId) return null
  const a: {
    id: string
    titulo: string
    resumo: string | null
    corpo: string
    origem: 'OFICIAL' | 'VERIFICADA'
    publicadoEm: Date | null
    tenantId: string
    status: string
    autor: { nome: string | null }
  } | null = await db.artigoPortal.findUnique({
    where: { id },
    select: {
      id: true,
      titulo: true,
      resumo: true,
      corpo: true,
      origem: true,
      publicadoEm: true,
      tenantId: true,
      status: true,
      autor: { select: { nome: true } },
    },
  })
  if (!a || a.status !== 'PUBLICADO') return null
  if (!podeVerArtigoNoEscopo(escopo, ancora, a.tenantId)) return null
  return {
    kind: 'artigo',
    id: a.id,
    titulo: a.titulo,
    resumo: a.resumo,
    corpo: a.corpo,
    origem: a.origem,
    publicadoEm: a.publicadoEm,
    autorNome: a.autor.nome,
    tenantId: a.tenantId,
  }
}

export type ForumRespostaItem = {
  id: string
  conteudo: string
  criadoEm: Date
  autorNome: string | null
}

export type ForumTopicoDetalhe = ForumTopicoItem & {
  corpo: string
  midiaUrls: string[]
  criadoEm: Date
  autorId: string
  autorAvatarUrl: string | null
  autorNickname: string | null
  respostas: ForumRespostaItem[]
}

export async function getTopicoDetalhe(
  id: string,
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
): Promise<ForumTopicoDetalhe | null> {
  const t: {
    id: string
    titulo: string
    corpo: string
    midiaUrls: string[]
    visitas: number
    respostasCount: number
    gostei: number
    naoGostei: number
    fixado: boolean
    criadoEm: Date
    atualizadoEm: Date
    autorId: string
    escopo: 'CLUBE' | 'TORCIDA'
    tenantId: string | null
    afiliacaoId: string | null
    status: string
    autor: { nome: string | null; nickname: string | null; avatarUrl: string | null }
    respostas: { id: string; conteudo: string; criadoEm: Date; autor: { nome: string | null } }[]
  } | null = await db.forumTopico.findUnique({
    where: { id },
    select: {
      id: true,
      titulo: true,
      corpo: true,
      midiaUrls: true,
      visitas: true,
      respostasCount: true,
      gostei: true,
      naoGostei: true,
      fixado: true,
      criadoEm: true,
      atualizadoEm: true,
      autorId: true,
      escopo: true,
      tenantId: true,
      afiliacaoId: true,
      status: true,
      autor: { select: { nome: true, nickname: true, avatarUrl: true } },
      respostas: {
        where: { oculto: false, parentId: null },
        orderBy: { criadoEm: 'asc' },
        take: 80,
        select: {
          id: true,
          conteudo: true,
          criadoEm: true,
          autor: { select: { nome: true } },
        },
      },
    },
  })
  if (!t || t.status !== 'VISIVEL') return null
  if (!podeVerTopicoNoEscopo(escopo, ancora, t)) return null
  return {
    id: t.id,
    titulo: t.titulo,
    corpo: t.corpo,
    midiaUrls: t.midiaUrls,
    visitas: t.visitas,
    respostasCount: t.respostasCount,
    gostei: t.gostei,
    naoGostei: t.naoGostei,
    fixado: t.fixado,
    criadoEm: t.criadoEm,
    atualizadoEm: t.atualizadoEm,
    autorNome: t.autor.nome,
    autorAvatarUrl: t.autor.avatarUrl,
    autorNickname: t.autor.nickname,
    autorId: t.autorId,
    respostas: t.respostas.map((r) => ({
      id: r.id,
      conteudo: r.conteudo,
      criadoEm: r.criadoEm,
      autorNome: r.autor.nome,
    })),
  }
}

export type PracaComentarioItem = {
  id: string
  conteudo: string
  criadoEm: Date
  autorNome: string | null
}

export async function listarComentariosPraca(
  alvoTipo: 'ARTIGO' | 'NOTICIA',
  alvoId: string,
): Promise<PracaComentarioItem[]> {
  const rows: { id: string; conteudo: string; criadoEm: Date; autor: { nome: string | null } }[] =
    await db.pracaComentario.findMany({
      where: { alvoTipo, alvoId, oculto: false },
      orderBy: { criadoEm: 'asc' },
      take: 40,
      select: { id: true, conteudo: true, criadoEm: true, autor: { select: { nome: true } } },
    })
  return rows.map((c) => ({
    id: c.id,
    conteudo: c.conteudo,
    criadoEm: c.criadoEm,
    autorNome: c.autor.nome,
  }))
}

export type RankingPracaItem = {
  userId: string
  nome: string | null
  avatarUrl: string | null
  score: number
  topicos: number
  respostas: number
  pctAprovacao: number | null
}

export async function listarRankingPraca(
  ancora: AncoraPraca,
  janela: 'geral' | 'semana' = 'geral',
): Promise<RankingPracaItem[]> {
  const chave = ancora.tenantId
    ? escopoChavePraca({ tenantId: ancora.tenantId })
    : ancora.afiliacaoId
      ? escopoChavePraca({ afiliacaoId: ancora.afiliacaoId })
      : null
  if (!chave) return []

  if (janela === 'semana') {
    const agrupado: { userId: string; _sum: { peso: number | null } }[] =
      await db.forumScoreEvento.groupBy({
        by: ['userId'],
        where: { escopoChave: chave, criadoEm: { gte: inicioJanelaSinaisPraca() } },
        _sum: { peso: true },
        orderBy: { _sum: { peso: 'desc' } },
        take: 10,
      })
    const ids = agrupado.map((r) => r.userId)
    const users: { id: string; nome: string | null; avatarUrl: string | null }[] =
      ids.length === 0
        ? []
        : await db.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, nome: true, avatarUrl: true },
          })
    const porId = new Map(users.map((u) => [u.id, u]))
    return agrupado
      .filter((r) => (r._sum.peso ?? 0) > 0)
      .map((r) => {
        const u = porId.get(r.userId)
        return {
          userId: r.userId,
          nome: u?.nome ?? null,
          avatarUrl: u?.avatarUrl ?? null,
          score: r._sum.peso ?? 0,
          topicos: 0,
          respostas: 0,
          pctAprovacao: null,
        }
      })
  }

  const rows: {
    score: number
    topicos: number
    respostas: number
    gosteiRecebidos: number
    naoGosteiRecebidos: number
    user: { id: string; nome: string | null; avatarUrl: string | null }
  }[] = await db.forumScoreSaldo.findMany({
    where: { escopoChave: chave, score: { gte: LIMIAR_RANKING_PRACA } },
    orderBy: { score: 'desc' },
    take: 10,
    select: {
      score: true,
      topicos: true,
      respostas: true,
      gosteiRecebidos: true,
      naoGosteiRecebidos: true,
      user: { select: { id: true, nome: true, avatarUrl: true } },
    },
  })
  return rows.map((r) => ({
    userId: r.user.id,
    nome: r.user.nome,
    avatarUrl: r.user.avatarUrl,
    score: r.score,
    topicos: r.topicos,
    respostas: r.respostas,
    pctAprovacao: pctAprovacaoPraca(r.gosteiRecebidos, r.naoGosteiRecebidos),
  }))
}

export async function scorePracaDoUsuario(
  userId: string,
  ancora: AncoraPraca,
): Promise<number | null> {
  const chave = ancora.tenantId
    ? escopoChavePraca({ tenantId: ancora.tenantId })
    : ancora.afiliacaoId
      ? escopoChavePraca({ afiliacaoId: ancora.afiliacaoId })
      : null
  if (!chave) return null
  const row: { score: number } | null = await db.forumScoreSaldo.findUnique({
    where: { userId_escopoChave: { userId, escopoChave: chave } },
    select: { score: true },
  })
  return row?.score ?? null
}

export async function contarSinaisBaratosSemana(userId: string, ancora: AncoraPraca): Promise<number> {
  const chave = ancora.tenantId
    ? escopoChavePraca({ tenantId: ancora.tenantId })
    : ancora.afiliacaoId
      ? escopoChavePraca({ afiliacaoId: ancora.afiliacaoId })
      : null
  if (!chave) return 0
  return db.forumScoreEvento.count({
    where: {
      userId,
      escopoChave: chave,
      sinal: { in: [...SINAIS_BARATOS_PRACA] },
      criadoEm: { gte: inicioJanelaSinaisPraca() },
    },
  })
}

export async function assertTetoSinaisPraca(userId: string, ancora: AncoraPraca): Promise<void> {
  const n = await contarSinaisBaratosSemana(userId, ancora)
  if (n >= TETO_SINAIS_BARATOS_SEMANA) {
    throw new ExpectedError(
      `Você já usou os ${TETO_SINAIS_BARATOS_SEMANA} sinais desta semana neste canal.`,
    )
  }
}

export async function podeModerarPraca(userId: string, tenantId: string | null): Promise<boolean> {
  if (!tenantId) return false
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  return hasPermission(
    calculateEffectivePermissions(rolePermissions, overrides),
    PERMISSIONS.COMMUNITY_MODERATE,
  )
}

export async function podePublicarArtigoNoTenant(userId: string, tenantId: string): Promise<boolean> {
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
  if (hasPermission(efetivas, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)) return true
  const membro: { fonteVerificadaEm: Date | null } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { fonteVerificadaEm: true },
  })
  return Boolean(membro?.fonteVerificadaEm)
}

export async function aplicarDeltaVotoTopico(
  topicoId: string,
  valorNovo: number,
  valorAntigo: number | null,
): Promise<void> {
  const gosteiDelta =
    (valorNovo === 1 ? 1 : 0) - (valorAntigo === 1 ? 1 : 0)
  const naoDelta =
    (valorNovo === -1 ? 1 : 0) - (valorAntigo === -1 ? 1 : 0)
  await db.forumTopico.update({
    where: { id: topicoId },
    data: { gostei: { increment: gosteiDelta }, naoGostei: { increment: naoDelta } },
  })
}

export type PracaAlvoVoto = PracaAlvoTipo
