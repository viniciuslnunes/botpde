import {
  extrairMetaArtigoBlocos,
  midiaPrincipalDeUrls,
} from '@/lib/noticias-artigo-meta'
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
  whereTopicosNaListagem,
  rankTopicosHot,
  rankNoticiasHot,
  podeVerStatusTopico,
  prioridadeStatusListagem,
  deltaContagemVotoPraca,
  canalElegivelParaNoticia,
} from '@torcida/types'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { ContextoComunidadePortal } from '@/lib/comunidade-contexto'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { ExpectedError } from '@/lib/expected-error'
import { idDeRotaPraca, idsCandidatosRotaPraca } from '@/lib/praca-rota-id'

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

export type CanalElegivelNoticia = {
  id: string
  nome: string | null
  canalOficial: boolean
  portalNoticiasVerificado: boolean
}

export type NoticiaRelacionada = {
  id: string
  titulo: string
}

export type NoticiaPracaItem = {
  kind: 'artigo' | 'noticia'
  id: string
  titulo: string
  resumo: string | null
  corpo: string | null
  midiaUrls: string[]
  /** Primeira mídia — define capa e carrossel de vídeos curtos. */
  midiaPrincipal: 'imagem' | 'video' | 'embed' | null
  duracaoSegundos: number | null
  relacionados: NoticiaRelacionada[]
  origem: 'imprensa' | 'oficial' | 'verificada'
  publicadoEm: Date | null
  criadoEm: Date
  visitas: number
  gostei: number
  naoGostei: number
  fixado: boolean
  autorId: string | null
  autorNome: string | null
  fonte: string | null
  url: string | null
  /** Voto do viewer no card (listagem / engajamento inline). */
  meuVoto: 1 | -1 | null
  totalComentarios: number
}

export type ForumTopicoStatus = 'PENDENTE' | 'VISIVEL' | 'REJEITADO' | 'OCULTO' | 'REMOVIDO'

export type ForumTopicoItem = {
  id: string
  titulo: string
  corpo: string
  midiaUrls: string[]
  visitas: number
  respostasCount: number
  gostei: number
  naoGostei: number
  fixado: boolean
  status: ForumTopicoStatus
  rejeitadoMotivo: string | null
  criadoEm: Date
  atualizadoEm: Date
  autorId: string
  autorNome: string | null
  meuVoto: 1 | -1 | null
}

/** Card de notícia/artigo na faixa «Na praça» — mesmo padrão visual dos tópicos no feed. */
export type PracaNoticiaFeedItem = {
  kind: 'noticia' | 'artigo'
  origem: 'imprensa' | 'oficial' | 'verificada'
  id: string
  titulo: string
  resumo: string | null
  midiaUrls: string[]
  href: string
  criadoEm: Date
  fixado: boolean
  gostei: number
  naoGostei: number
  meuVoto: 1 | -1 | null
  totalComentarios: number
  fonte: string | null
  autor: {
    id: string | null
    nome: string | null
    avatarUrl: string | null
  }
}

/** @deprecated Use PracaNoticiaFeedItem */
export type PracaFeedCard = PracaNoticiaFeedItem

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

type CanalNoticiaRow = {
  id: string
  nome: string | null
  tipo: string
  canalOficial: boolean
  portalNoticiasVerificado: boolean
}

/** Canal oficial da torcida/unidade, ou portal de notícias verificado (futuro). */
export async function resolverCanalElegivelNoticia(
  tenantId: string,
): Promise<CanalElegivelNoticia | null> {
  const canais: CanalNoticiaRow[] = await db.conversa.findMany({
    where: {
      tenantId,
      tipo: 'CANAL',
      OR: [{ canalOficial: true }, { portalNoticiasVerificado: true }],
    },
    orderBy: { criadoEm: 'asc' },
    select: {
      id: true,
      nome: true,
      tipo: true,
      canalOficial: true,
      portalNoticiasVerificado: true,
    },
  })
  const elegiveis = canais.filter((c) => canalElegivelParaNoticia(c))
  const oficial = elegiveis.find((c) => c.canalOficial)
  const escolhido = oficial ?? elegiveis[0]
  if (!escolhido) return null
  return {
    id: escolhido.id,
    nome: escolhido.nome,
    canalOficial: escolhido.canalOficial,
    portalNoticiasVerificado: escolhido.portalNoticiasVerificado,
  }
}

export async function podePublicarNoticiaNoTenant(
  userId: string,
  tenantId: string,
): Promise<{
  pode: boolean
  canal: CanalElegivelNoticia | null
  oficial: boolean
  podePessoa: boolean
}> {
  const [{ rolePermissions, overrides }, canal] = await Promise.all([
    getUserPermissionsInTenant(userId, tenantId),
    resolverCanalElegivelNoticia(tenantId),
  ])
  const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
  const oficial = hasPermission(efetivas, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)
  const podePessoa = oficial ? true : await podePublicarArtigoNoTenant(userId, tenantId)
  return {
    pode: Boolean(podePessoa && canal),
    canal,
    oficial,
    podePessoa,
  }
}

type ArtigoListRow = {
  id: string
  titulo: string
  resumo: string | null
  midiaUrls: string[]
  capaUrl: string | null
  blocos: unknown
  origem: 'OFICIAL' | 'VERIFICADA'
  publicadoEm: Date | null
  criadoEm: Date
  visitas: number
  gostei: number
  naoGostei: number
  fixado: boolean
  autorId: string
  autor: { nome: string | null }
}

type ImprensaListRow = {
  id: string
  titulo: string
  resumo: string | null
  fonte: string
  url: string
  embedThumbnail: string | null
  publicadoEm: Date | null
  criadoEm: Date
  visitas: number
}

function mapArtigoParaItem(a: ArtigoListRow): NoticiaPracaItem {
  const capa = a.capaUrl && !a.midiaUrls.includes(a.capaUrl) ? [a.capaUrl] : []
  const midiaUrls = [...capa, ...a.midiaUrls]
  const meta = extrairMetaArtigoBlocos(a.blocos)
  return {
    kind: 'artigo',
    id: a.id,
    titulo: a.titulo,
    resumo: a.resumo,
    corpo: a.resumo,
    midiaUrls,
    midiaPrincipal: midiaPrincipalDeUrls(midiaUrls),
    duracaoSegundos: meta.duracaoSegundos,
    relacionados: meta.relacionados,
    origem: a.origem === 'OFICIAL' ? 'oficial' : 'verificada',
    publicadoEm: a.publicadoEm,
    criadoEm: a.criadoEm,
    visitas: a.visitas,
    gostei: a.gostei,
    naoGostei: a.naoGostei,
    fixado: a.fixado,
    autorId: a.autorId,
    autorNome: a.autor.nome,
    fonte: null,
    url: null,
    meuVoto: null,
    totalComentarios: 0,
  }
}

function mapImprensaParaItem(n: ImprensaListRow): NoticiaPracaItem {
  const midiaUrls = n.embedThumbnail ? [n.embedThumbnail] : []
  return {
    kind: 'noticia',
    id: n.id,
    titulo: n.titulo,
    resumo: n.resumo,
    corpo: null,
    midiaUrls,
    midiaPrincipal: midiaPrincipalDeUrls(midiaUrls),
    duracaoSegundos: null,
    relacionados: [],
    origem: 'imprensa',
    publicadoEm: n.publicadoEm,
    criadoEm: n.criadoEm,
    visitas: n.visitas,
    gostei: 0,
    naoGostei: 0,
    fixado: false,
    autorId: null,
    autorNome: null,
    fonte: n.fonte,
    url: n.url,
    meuVoto: null,
    totalComentarios: 0,
  }
}

function ordenarNoticiasPraca(
  itens: NoticiaPracaItem[],
  ordem: 'em_alta' | 'acessados' | 'recentes',
): NoticiaPracaItem[] {
  if (ordem === 'em_alta') {
    return rankNoticiasHot(
      itens.map((n) => ({ ...n, respostasCount: 0, status: 'VISIVEL' as const })),
    )
  }
  return [...itens].sort((a, b) => {
    if (Boolean(a.fixado) !== Boolean(b.fixado)) return a.fixado ? -1 : 1
    if (ordem === 'acessados' && a.visitas !== b.visitas) return b.visitas - a.visitas
    const ta = (a.publicadoEm ?? a.criadoEm).getTime()
    const tb = (b.publicadoEm ?? b.criadoEm).getTime()
    return tb - ta
  })
}

export async function listarNoticiasDaPraca(
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
  ordem: 'em_alta' | 'acessados' | 'recentes' = 'acessados',
  opts: { userId?: string } = {},
): Promise<NoticiaPracaItem[]> {
  let itens: NoticiaPracaItem[] = []

  if (escopo === 'nacional' && ancora.afiliacaoId) {
    const noticias: ImprensaListRow[] = await db.noticia.findMany({
      where: { afiliacaoId: ancora.afiliacaoId, status: 'APROVADA' },
      take: 80,
      select: {
        id: true,
        titulo: true,
        resumo: true,
        fonte: true,
        url: true,
        embedThumbnail: true,
        publicadoEm: true,
        criadoEm: true,
        visitas: true,
      },
    })
    const votosPorId = await agregarVotosNoticiaPraca(noticias.map((n) => n.id))
    itens = ordenarNoticiasPraca(
      noticias.map((n) => {
        const mapped = mapImprensaParaItem(n)
        const votos = votosPorId.get(n.id) ?? { gostei: 0, naoGostei: 0 }
        return { ...mapped, gostei: votos.gostei, naoGostei: votos.naoGostei }
      }),
      ordem,
    ).slice(0, 50)
  } else if (ancora.tenantId) {
    const artigos: ArtigoListRow[] = await db.artigoPortal.findMany({
      where: { tenantId: ancora.tenantId, status: 'PUBLICADO' },
      take: 80,
      select: {
        id: true,
        titulo: true,
        resumo: true,
        midiaUrls: true,
        capaUrl: true,
        blocos: true,
        origem: true,
        publicadoEm: true,
        criadoEm: true,
        visitas: true,
        gostei: true,
        naoGostei: true,
        fixado: true,
        autorId: true,
        autor: { select: { nome: true } },
      },
    })
    itens = ordenarNoticiasPraca(artigos.map(mapArtigoParaItem), ordem).slice(0, 50)
  }

  if (itens.length === 0) return []

  const paresComentario = itens.map((c) => ({
    alvoTipo: (c.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO') as 'NOTICIA' | 'ARTIGO',
    alvoId: c.id,
  }))
  const comentariosPorChave = await contarComentariosPraca(paresComentario)

  let votosViewer = new Map<string, 1 | -1>()
  if (opts.userId) {
    const votos: { alvoTipo: string; alvoId: string; valor: number }[] = await db.pracaVoto.findMany({
      where: {
        userId: opts.userId,
        alvoTipo: { in: ['NOTICIA', 'ARTIGO'] },
        alvoId: { in: itens.map((c) => c.id) },
      },
      select: { alvoTipo: true, alvoId: true, valor: true },
    })
    votosViewer = new Map(
      votos
        .filter((v) => v.valor === 1 || v.valor === -1)
        .map((v) => [`${v.alvoTipo}:${v.alvoId}`, v.valor as 1 | -1]),
    )
  }

  return itens.map((c) => {
    const alvoTipo = c.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO'
    return {
      ...c,
      totalComentarios: comentariosPorChave.get(`${alvoTipo}:${c.id}`) ?? 0,
      meuVoto: votosViewer.get(`${alvoTipo}:${c.id}`) ?? null,
    }
  })
}

type TopicoRow = {
  id: string
  titulo: string
  corpo: string
  midiaUrls: string[]
  visitas: number
  respostasCount: number
  gostei: number
  naoGostei: number
  fixado: boolean
  status: ForumTopicoStatus
  rejeitadoMotivo: string | null
  criadoEm: Date
  atualizadoEm: Date
  autorId: string
  autor: { nome: string | null }
}

export async function listarTopicos(
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
  ordem: 'em_alta' | 'recentes' | 'acessados' = 'em_alta',
  opts: { userId?: string | null; podeModerar?: boolean } = {},
): Promise<ForumTopicoItem[]> {
  const where = whereTopicosNaListagem(escopo, ancora, {
    userId: opts.userId ?? undefined,
    podeModerar: opts.podeModerar,
  })
  const orderBy =
    ordem === 'acessados'
      ? ([{ fixado: 'desc' }, { visitas: 'desc' }] as const)
      : ([{ fixado: 'desc' }, { atualizadoEm: 'desc' }] as const)
  const rows: TopicoRow[] = await db.forumTopico.findMany({
    where,
    orderBy: [...orderBy],
    take: 80,
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
      status: true,
      rejeitadoMotivo: true,
      criadoEm: true,
      atualizadoEm: true,
      autorId: true,
      autor: { select: { nome: true } },
    },
  })
  const mapped = rows.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    corpo: t.corpo,
    midiaUrls: t.midiaUrls,
    visitas: t.visitas,
    respostasCount: t.respostasCount,
    gostei: t.gostei,
    naoGostei: t.naoGostei,
    fixado: t.fixado,
    status: t.status,
    rejeitadoMotivo: t.rejeitadoMotivo,
    criadoEm: t.criadoEm,
    atualizadoEm: t.atualizadoEm,
    autorId: t.autorId,
    autorNome: t.autor.nome,
    meuVoto: null as 1 | -1 | null,
  }))
  const ranked =
    ordem === 'em_alta'
      ? rankTopicosHot(mapped)
      : [...mapped].sort((a, b) => {
          const sa = prioridadeStatusListagem(a.status)
          const sb = prioridadeStatusListagem(b.status)
          if (sa !== sb) return sa - sb
          return 0
        })
  const fatia = ranked.slice(0, 50)
  if (!opts.userId || fatia.length === 0) return fatia

  const votos: { alvoId: string; valor: number }[] = await db.pracaVoto.findMany({
    where: {
      userId: opts.userId,
      alvoTipo: 'TOPICO',
      alvoId: { in: fatia.map((t) => t.id) },
    },
    select: { alvoId: true, valor: true },
  })
  const votoPorId = new Map(votos.map((v) => [v.alvoId, v.valor]))
  return fatia.map((t) => ({
    ...t,
    meuVoto:
      votoPorId.get(t.id) === 1 || votoPorId.get(t.id) === -1
        ? (votoPorId.get(t.id) as 1 | -1)
        : null,
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
  parentId: string | null
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
    parentId: string | null
    autor: { id: string; nome: string | null; avatarUrl: string | null }
  }[] = await db.forumResposta.findMany({
    where: { topicoId, oculto: false },
    orderBy: { criadoEm: 'asc' },
    take: 80,
    select: {
      id: true,
      conteudo: true,
      criadoEm: true,
      parentId: true,
      autor: { select: { id: true, nome: true, avatarUrl: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    conteudo: r.conteudo,
    criadoEm: r.criadoEm,
    parentId: r.parentId,
    autor: r.autor,
  }))
}

async function agregarVotosNoticiaPraca(
  ids: string[],
): Promise<Map<string, { gostei: number; naoGostei: number }>> {
  if (ids.length === 0) return new Map()
  const votos: { alvoId: string; valor: number }[] = await db.pracaVoto.findMany({
    where: { alvoTipo: 'NOTICIA', alvoId: { in: ids } },
    select: { alvoId: true, valor: true },
  })
  const map = new Map<string, { gostei: number; naoGostei: number }>()
  for (const v of votos) {
    const cur = map.get(v.alvoId) ?? { gostei: 0, naoGostei: 0 }
    if (v.valor === 1) cur.gostei += 1
    else if (v.valor === -1) cur.naoGostei += 1
    map.set(v.alvoId, cur)
  }
  return map
}

async function contarComentariosPraca(
  pares: Array<{ alvoTipo: 'NOTICIA' | 'ARTIGO'; alvoId: string }>,
): Promise<Map<string, number>> {
  if (pares.length === 0) return new Map()
  const ids = pares.map((p) => p.alvoId)
  const rows: { alvoTipo: 'NOTICIA' | 'ARTIGO'; alvoId: string; _count: { id: number } }[] =
    await db.pracaComentario.groupBy({
      by: ['alvoTipo', 'alvoId'],
      where: { alvoId: { in: ids }, oculto: false },
      _count: { id: true },
    })
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(`${r.alvoTipo}:${r.alvoId}`, r._count.id)
  }
  return map
}

export async function getPracaFeedCards(
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
  opts: { userId?: string } = {},
): Promise<PracaNoticiaFeedItem[]> {
  const sufixo = sufixoEscopoPraca(escopo)
  const cards: PracaNoticiaFeedItem[] = []

  if (escopo === 'nacional' && ancora.afiliacaoId) {
    const noticias: ImprensaListRow[] = await db.noticia.findMany({
      where: { afiliacaoId: ancora.afiliacaoId, status: 'APROVADA' },
      orderBy: { publicadoEm: 'desc' },
      take: 6,
      select: {
        id: true,
        titulo: true,
        resumo: true,
        fonte: true,
        url: true,
        embedThumbnail: true,
        publicadoEm: true,
        criadoEm: true,
        visitas: true,
      },
    })
    const votosPorId = await agregarVotosNoticiaPraca(noticias.map((n) => n.id))
    for (const n of noticias) {
      const mapped = mapImprensaParaItem(n)
      const votos = votosPorId.get(n.id) ?? { gostei: 0, naoGostei: 0 }
      cards.push({
        kind: 'noticia',
        origem: 'imprensa',
        id: n.id,
        titulo: mapped.titulo,
        resumo: mapped.resumo,
        midiaUrls: mapped.midiaUrls,
        href: `/portal/comunidade/noticias/${n.id}${sufixo}`,
        criadoEm: mapped.publicadoEm ?? mapped.criadoEm,
        fixado: false,
        gostei: votos.gostei,
        naoGostei: votos.naoGostei,
        meuVoto: null,
        totalComentarios: 0,
        fonte: mapped.fonte,
        autor: { id: null, nome: mapped.fonte, avatarUrl: null },
      })
    }
  }

  const where = wherePracaNoEscopo(escopo, ancora)

  if (escopo !== 'nacional' && ancora.tenantId) {
    const artigos: (ArtigoListRow & {
      autor: { nome: string | null; avatarUrl: string | null }
    })[] = await db.artigoPortal.findMany({
      where: where.artigos,
      orderBy: { publicadoEm: 'desc' },
      take: 6,
      select: {
        id: true,
        titulo: true,
        resumo: true,
        midiaUrls: true,
        capaUrl: true,
        blocos: true,
        origem: true,
        publicadoEm: true,
        criadoEm: true,
        visitas: true,
        gostei: true,
        naoGostei: true,
        fixado: true,
        autorId: true,
        autor: { select: { nome: true, avatarUrl: true } },
      },
    })
    for (const a of artigos) {
      const mapped = mapArtigoParaItem(a)
      cards.push({
        kind: 'artigo',
        origem: mapped.origem,
        id: a.id,
        titulo: mapped.titulo,
        resumo: mapped.resumo,
        midiaUrls: mapped.midiaUrls,
        href: `/portal/comunidade/noticias/${a.id}${sufixo}`,
        criadoEm: mapped.publicadoEm ?? mapped.criadoEm,
        fixado: mapped.fixado,
        gostei: mapped.gostei,
        naoGostei: mapped.naoGostei,
        meuVoto: null,
        totalComentarios: 0,
        fonte: null,
        autor: {
          id: mapped.autorId,
          nome: mapped.autorNome,
          avatarUrl: a.autor.avatarUrl,
        },
      })
    }
  }

  const ordenados = ordenarCardsPraca(cards).slice(0, 8)
  if (ordenados.length === 0) return []

  const paresComentario = ordenados.map((c) => ({
    alvoTipo: (c.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO') as 'NOTICIA' | 'ARTIGO',
    alvoId: c.id,
  }))
  const comentariosPorChave = await contarComentariosPraca(paresComentario)

  let votosViewer = new Map<string, 1 | -1>()
  if (opts.userId) {
    const votos: { alvoTipo: string; alvoId: string; valor: number }[] = await db.pracaVoto.findMany({
      where: {
        userId: opts.userId,
        alvoTipo: { in: ['NOTICIA', 'ARTIGO'] },
        alvoId: { in: ordenados.map((c) => c.id) },
      },
      select: { alvoTipo: true, alvoId: true, valor: true },
    })
    votosViewer = new Map(
      votos
        .filter((v) => v.valor === 1 || v.valor === -1)
        .map((v) => [`${v.alvoTipo}:${v.alvoId}`, v.valor as 1 | -1]),
    )
  }

  return ordenados.map((c) => {
    const alvoTipo = c.kind === 'noticia' ? 'NOTICIA' : 'ARTIGO'
    return {
      ...c,
      totalComentarios: comentariosPorChave.get(`${alvoTipo}:${c.id}`) ?? 0,
      meuVoto: votosViewer.get(`${alvoTipo}:${c.id}`) ?? null,
    }
  })
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
  visitas: number
  embedThumbnail: string | null
}

export type ArtigoPracaDetalhe = {
  kind: 'artigo'
  id: string
  titulo: string
  resumo: string | null
  corpo: string
  blocos: unknown
  midiaUrls: string[]
  origem: 'OFICIAL' | 'VERIFICADA'
  publicadoEm: Date | null
  autorNome: string | null
  autorAvatarUrl: string | null
  autorId: string
  tenantId: string
  visitas: number
  gostei: number
  naoGostei: number
  fixado: boolean
}

export async function resolverNoticiaOuArtigo(
  id: string,
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
): Promise<NoticiaPracaDetalhe | ArtigoPracaDetalhe | null> {
  const candidatos = idsCandidatosRotaPraca(id)
  if (escopo === 'nacional' && ancora.afiliacaoId) {
    const n: {
      id: string
      titulo: string
      resumo: string | null
      url: string
      fonte: string
      publicadoEm: Date | null
      visitas: number
      embedThumbnail: string | null
      afiliacaoId: string
      status: string
    } | null = await db.noticia.findFirst({
      where: { id: { in: candidatos }, status: 'APROVADA', afiliacaoId: ancora.afiliacaoId },
      select: {
        id: true,
        titulo: true,
        resumo: true,
        url: true,
        fonte: true,
        publicadoEm: true,
        visitas: true,
        embedThumbnail: true,
        afiliacaoId: true,
        status: true,
      },
    })
    if (!n) return null
    return {
      kind: 'noticia',
      id: n.id,
      titulo: n.titulo,
      resumo: n.resumo,
      url: n.url,
      fonte: n.fonte,
      publicadoEm: n.publicadoEm,
      visitas: n.visitas,
      embedThumbnail: n.embedThumbnail,
    }
  }

  if (!ancora.tenantId) return null
  const a: {
    id: string
    titulo: string
    resumo: string | null
    corpo: string
    blocos: unknown
    midiaUrls: string[]
    capaUrl: string | null
    origem: 'OFICIAL' | 'VERIFICADA'
    publicadoEm: Date | null
    tenantId: string
    status: string
    visitas: number
    gostei: number
    naoGostei: number
    fixado: boolean
    autorId: string
    autor: { nome: string | null; avatarUrl: string | null }
  } | null = await db.artigoPortal.findFirst({
    where: { id: { in: candidatos }, status: 'PUBLICADO' },
    select: {
      id: true,
      titulo: true,
      resumo: true,
      corpo: true,
      blocos: true,
      midiaUrls: true,
      capaUrl: true,
      origem: true,
      publicadoEm: true,
      tenantId: true,
      status: true,
      visitas: true,
      gostei: true,
      naoGostei: true,
      fixado: true,
      autorId: true,
      autor: { select: { nome: true, avatarUrl: true } },
    },
  })
  if (!a) return null
  if (!podeVerArtigoNoEscopo(escopo, ancora, a.tenantId)) return null
  const capa = a.capaUrl && !a.midiaUrls.includes(a.capaUrl) ? [a.capaUrl] : []
  return {
    kind: 'artigo',
    id: a.id,
    titulo: a.titulo,
    resumo: a.resumo,
    corpo: a.corpo,
    blocos: a.blocos,
    midiaUrls: [...capa, ...a.midiaUrls],
    origem: a.origem,
    publicadoEm: a.publicadoEm,
    autorNome: a.autor.nome,
    autorAvatarUrl: a.autor.avatarUrl,
    autorId: a.autorId,
    tenantId: a.tenantId,
    visitas: a.visitas,
    gostei: a.gostei,
    naoGostei: a.naoGostei,
    fixado: a.fixado,
  }
}

export type ForumRespostaItem = {
  id: string
  conteudo: string
  criadoEm: Date
  autorId: string
  autorNome: string | null
  parentId: string | null
  oculto: boolean
}

export type ForumTopicoDetalhe = ForumTopicoItem & {
  autorAvatarUrl: string | null
  autorNickname: string | null
  respostas: ForumRespostaItem[]
  meuVoto: 1 | -1 | null
}

export async function getTopicoDetalhe(
  idRaw: string,
  escopo: EscopoComunidade,
  ancora: AncoraPraca,
  viewer: { userId: string; podeModerar: boolean },
): Promise<ForumTopicoDetalhe | null> {
  const id = idDeRotaPraca(idRaw)
  const [t, voto]: [
    {
      id: string
      titulo: string
      corpo: string
      midiaUrls: string[]
      visitas: number
      respostasCount: number
      gostei: number
      naoGostei: number
      fixado: boolean
      status: ForumTopicoStatus
      rejeitadoMotivo: string | null
      criadoEm: Date
      atualizadoEm: Date
      autorId: string
      escopo: 'CLUBE' | 'TORCIDA'
      tenantId: string | null
      afiliacaoId: string | null
      autor: { nome: string | null; nickname: string | null; avatarUrl: string | null }
      respostas: {
        id: string
        conteudo: string
        criadoEm: Date
        oculto: boolean
        autorId: string
        parentId: string | null
        autor: { nome: string | null }
      }[]
    } | null,
    { valor: number } | null,
  ] = await Promise.all([
    db.forumTopico.findUnique({
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
        status: true,
        rejeitadoMotivo: true,
        criadoEm: true,
        atualizadoEm: true,
        autorId: true,
        escopo: true,
        tenantId: true,
        afiliacaoId: true,
        autor: { select: { nome: true, nickname: true, avatarUrl: true } },
        respostas: {
          where: viewer.podeModerar ? undefined : { oculto: false },
          orderBy: { criadoEm: 'asc' },
          take: 200,
          select: {
            id: true,
            conteudo: true,
            criadoEm: true,
            oculto: true,
            autorId: true,
            parentId: true,
            autor: { select: { nome: true } },
          },
        },
      },
    }),
    db.pracaVoto.findUnique({
      where: {
        userId_alvoTipo_alvoId: {
          userId: viewer.userId,
          alvoTipo: 'TOPICO',
          alvoId: id,
        },
      },
      select: { valor: true },
    }),
  ])
  if (!t) return null
  if (!podeVerTopicoNoEscopo(escopo, ancora, t)) return null
  if (
    !podeVerStatusTopico(t.status, {
      autorId: t.autorId,
      userId: viewer.userId,
      podeModerar: viewer.podeModerar,
    })
  ) {
    return null
  }
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
    status: t.status,
    rejeitadoMotivo: t.rejeitadoMotivo,
    criadoEm: t.criadoEm,
    atualizadoEm: t.atualizadoEm,
    autorNome: t.autor.nome,
    autorAvatarUrl: t.autor.avatarUrl,
    autorNickname: t.autor.nickname,
    autorId: t.autorId,
    meuVoto: voto?.valor === 1 || voto?.valor === -1 ? (voto.valor as 1 | -1) : null,
    respostas: t.respostas.map((r) => ({
      id: r.id,
      conteudo: r.conteudo,
      criadoEm: r.criadoEm,
      autorId: r.autorId,
      autorNome: r.autor.nome,
      parentId: r.parentId,
      oculto: r.oculto,
    })),
  }
}

export type PracaComentarioItem = {
  id: string
  conteudo: string
  criadoEm: Date
  autorId: string
  autorNome: string | null
  autorAvatarUrl: string | null
  parentId: string | null
  gostei: number
  naoGostei: number
  meuVoto: 1 | -1 | null
}

export async function listarComentariosPraca(
  alvoTipo: 'ARTIGO' | 'NOTICIA',
  alvoId: string,
  viewerId?: string,
): Promise<PracaComentarioItem[]> {
  const rows: {
    id: string
    conteudo: string
    criadoEm: Date
    autorId: string
    parentId: string | null
    gostei: number
    naoGostei: number
    autor: { nome: string | null; avatarUrl: string | null }
  }[] = await db.pracaComentario.findMany({
    where: { alvoTipo, alvoId, oculto: false },
    orderBy: { criadoEm: 'asc' },
    take: 80,
    select: {
      id: true,
      conteudo: true,
      criadoEm: true,
      autorId: true,
      parentId: true,
      gostei: true,
      naoGostei: true,
      autor: { select: { nome: true, avatarUrl: true } },
    },
  })

  const votosPorId = new Map<string, 1 | -1>()
  if (viewerId && rows.length > 0) {
    const votos: { alvoId: string; valor: number }[] = await db.pracaVoto.findMany({
      where: {
        userId: viewerId,
        alvoTipo: 'COMENTARIO',
        alvoId: { in: rows.map((r) => r.id) },
      },
      select: { alvoId: true, valor: true },
    })
    for (const v of votos) {
      if (v.valor === 1 || v.valor === -1) votosPorId.set(v.alvoId, v.valor)
    }
  }

  return rows.map((c) => ({
    id: c.id,
    conteudo: c.conteudo,
    criadoEm: c.criadoEm,
    autorId: c.autorId,
    autorNome: c.autor.nome,
    autorAvatarUrl: c.autor.avatarUrl,
    parentId: c.parentId,
    gostei: c.gostei,
    naoGostei: c.naoGostei,
    meuVoto: votosPorId.get(c.id) ?? null,
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

export function tenantModeracaoPraca(
  ancora: AncoraPraca,
  ctx: ContextoComunidadePortal,
): string | null {
  if (ancora.tenantId) return ancora.tenantId
  return ctx.torcidaReal?.id ?? (ctx.modo === 'torcida' ? ctx.tenant.id : null)
}

export async function podeModerarPraca(userId: string, tenantId: string | null): Promise<boolean> {
  if (!tenantId) return false
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  return hasPermission(
    calculateEffectivePermissions(rolePermissions, overrides),
    PERMISSIONS.COMMUNITY_MODERATE,
  )
}

/** Moderação ou Comunicação publicam na hora; o resto entra na fila. */
export async function podeAprovarPracaNaHora(userId: string, tenantId: string | null): Promise<boolean> {
  if (!tenantId) return false
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
  return (
    hasPermission(efetivas, PERMISSIONS.COMMUNITY_MODERATE) ||
    hasPermission(efetivas, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)
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
  const novo: 1 | -1 | 0 = valorNovo === 1 || valorNovo === -1 ? valorNovo : 0
  const antigo: 1 | -1 | 0 | null = valorAntigo === 1 || valorAntigo === -1 ? valorAntigo : null
  const { gostei: gosteiDelta, naoGostei: naoDelta } = deltaContagemVotoPraca(antigo, novo)
  await db.forumTopico.update({
    where: { id: topicoId },
    data: { gostei: { increment: gosteiDelta }, naoGostei: { increment: naoDelta } },
  })
}

export async function aplicarDeltaVotoArtigo(
  artigoId: string,
  valorNovo: number,
  valorAntigo: number | null,
): Promise<void> {
  const novo: 1 | -1 | 0 = valorNovo === 1 || valorNovo === -1 ? valorNovo : 0
  const antigo: 1 | -1 | 0 | null = valorAntigo === 1 || valorAntigo === -1 ? valorAntigo : null
  const { gostei: gosteiDelta, naoGostei: naoDelta } = deltaContagemVotoPraca(antigo, novo)
  await db.artigoPortal.update({
    where: { id: artigoId },
    data: { gostei: { increment: gosteiDelta }, naoGostei: { increment: naoDelta } },
  })
}

export async function aplicarDeltaVotoComentario(
  comentarioId: string,
  valorNovo: number,
  valorAntigo: number | null,
): Promise<void> {
  const novo: 1 | -1 | 0 = valorNovo === 1 || valorNovo === -1 ? valorNovo : 0
  const antigo: 1 | -1 | 0 | null = valorAntigo === 1 || valorAntigo === -1 ? valorAntigo : null
  const { gostei: gosteiDelta, naoGostei: naoDelta } = deltaContagemVotoPraca(antigo, novo)
  await db.pracaComentario.update({
    where: { id: comentarioId },
    data: { gostei: { increment: gosteiDelta }, naoGostei: { increment: naoDelta } },
  })
}

export type PracaAlvoVoto = PracaAlvoTipo
