/**
 * Brechó: lojas dos sócios, anúncios, interesse → conversa, confirmação, score.
 */
import { cache } from 'react'
import { db, type Prisma } from '@torcida/db'
import { ExpectedError } from '@/lib/expected-error'
import { criarMensagem } from '@/lib/mensageria'
import { avaliarAcessoDm } from '@/lib/mensageria'
import { notificarSafe } from '@/lib/notificacoes'
import { listarDestinatariosAdminPorPermissoes } from '@/lib/notificacoes'
import {
  BRECHO_PAGE_SIZE,
  calcularScoreConfianca,
  estadoConfirmacaoTroca,
  idCurtoBrecho,
  nomeConversaBrecho,
  podeConfirmarTroca,
  podeDemonstrarInteresse,
  rotuloPrecoBrecho,
  nomeExibicaoVendedorBrecho,
  rotuloRankingBrecho,
  estrelasConfiancaBrecho,
  PERMISSIONS,
} from '@torcida/types'
import type { BrechoContexto } from '@/lib/brecho-escopo'
import { getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import {
  excedeuLimiteEngajamento,
  registrarAcaoEngajamento,
} from '@/lib/engagement-rate-limit'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'

export type BrechoLojaLite = {
  id: string
  tenantId: string
  userId: string
  nome: string
  bio: string | null
  fotoUrl: string | null
  capaUrl: string | null
  ativa: boolean
  congeladaEm: Date | null
  trocasConcluidas: number
  contrapartesUnicas: number
  scoreConfianca: number
}

export type BrechoAnuncioCard = {
  id: string
  titulo: string
  modalidade: 'TROCA' | 'DOACAO' | 'VENDA'
  categoria: 'CAMISA' | 'BERMUDA' | 'PATCH' | 'BANDEIRA_PESSOAL' | 'OUTRO'
  tamanho: string | null
  precoLabel: string
  imagensUrl: string[]
  criadoEm: Date
  vendedor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  vendedorNome: string
  vendedorAvatarUrl: string | null
  confiancaNivel: string
  estrelas: number
  trocasConcluidas: number
  loja: {
    userId: string
    nome: string
    fotoUrl: string | null
    scoreConfianca: number
    trocasConcluidas: number
  }
}

const LOJA_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  nome: true,
  bio: true,
  fotoUrl: true,
  capaUrl: true,
  ativa: true,
  congeladaEm: true,
  trocasConcluidas: true,
  contrapartesUnicas: true,
  scoreConfianca: true,
} as const

type AnuncioToCardRow = {
  id: string
  titulo: string
  modalidade: 'TROCA' | 'DOACAO' | 'VENDA'
  categoria: 'CAMISA' | 'BERMUDA' | 'PATCH' | 'BANDEIRA_PESSOAL' | 'OUTRO'
  tamanho: string | null
  preco: unknown
  imagensUrl: string[]
  criadoEm: Date
  vendedor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  loja: { userId: string; nome: string; fotoUrl: string | null; scoreConfianca: number; trocasConcluidas: number }
}

function toCard(row: AnuncioToCardRow, maxNaPraca: number): BrechoAnuncioCard {
  return {
    id: row.id,
    titulo: row.titulo,
    modalidade: row.modalidade,
    categoria: row.categoria,
    tamanho: row.tamanho,
    precoLabel: rotuloPrecoBrecho({ modalidade: row.modalidade, preco: row.preco }),
    imagensUrl: row.imagensUrl,
    criadoEm: row.criadoEm,
    vendedor: row.vendedor,
    vendedorNome: nomeExibicaoVendedorBrecho({
      nome: row.vendedor.nome,
      nickname: row.vendedor.nickname,
      lojaNome: row.loja.nome,
    }),
    vendedorAvatarUrl: row.vendedor.avatarUrl ?? row.loja.fotoUrl,
    confiancaNivel: rotuloRankingBrecho(row.loja.scoreConfianca),
    estrelas: estrelasConfiancaBrecho(row.loja.scoreConfianca, maxNaPraca),
    trocasConcluidas: row.loja.trocasConcluidas,
    loja: row.loja,
  }
}

export const maxScoreConfiancaPraca = cache(async function maxScoreConfiancaPraca(
  tenantIds: readonly string[],
): Promise<number> {
  const ids = [...new Set(tenantIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return 0
  const agg: { _max: { scoreConfianca: number | null } } = await db.brechoLoja.aggregate({
    where: { tenantId: { in: ids }, ativa: true, congeladaEm: null },
    _max: { scoreConfianca: true },
  })
  return agg._max.scoreConfianca ?? 0
})

/** Capa da vitrine: foto enviada pelo sócio, senão a primeira foto de anúncio ativo. */
export function capaExibicaoBrecho(
  capaUrl: string | null | undefined,
  imagensAnuncio: string[] | undefined | null,
): string | null {
  return capaUrl || firstProdutoImagemUrl(imagensAnuncio)
}

/** Campos do card de produto (hub, feed, vitrine) a partir do anúncio. */
export function anuncioParaGridItem(i: BrechoAnuncioCard) {
  return {
    id: i.id,
    nome: i.titulo,
    href: `/portal/loja/brecho/${i.id}`,
    precoLabel: i.precoLabel,
    precoOriginalLabel: null as string | null,
    imagensUrl: i.imagensUrl,
    esgotado: false,
    descontoPct: null,
    vendedorNome: i.vendedorNome,
    vendedorAvatarUrl: i.vendedorAvatarUrl,
    confiancaNivel: i.confiancaNivel,
    estrelas: i.estrelas,
    trocasConcluidas: i.trocasConcluidas,
  }
}

export const getMinhaLojaBrecho = cache(async function getMinhaLojaBrecho(
  ctx: BrechoContexto,
): Promise<BrechoLojaLite | null> {
  const loja: BrechoLojaLite | null = await db.brechoLoja.findUnique({
    where: { tenantId_userId: { tenantId: ctx.raizId, userId: ctx.userId } },
    select: LOJA_SELECT,
  })
  return loja
})

export async function upsertLojaBrecho(
  ctx: BrechoContexto,
  data: { nome: string; bio?: string | null; fotoUrl?: string | null; capaUrl?: string | null },
): Promise<BrechoLojaLite> {
  const capaPatch = data.capaUrl !== undefined ? { capaUrl: data.capaUrl } : {}
  const loja: BrechoLojaLite = await db.brechoLoja.upsert({
    where: { tenantId_userId: { tenantId: ctx.raizId, userId: ctx.userId } },
    create: {
      tenantId: ctx.raizId,
      userId: ctx.userId,
      nome: data.nome,
      bio: data.bio ?? null,
      fotoUrl: data.fotoUrl ?? null,
      ...capaPatch,
      ativa: true,
    },
    update: {
      nome: data.nome,
      bio: data.bio ?? null,
      fotoUrl: data.fotoUrl ?? null,
      ...capaPatch,
    },
    select: LOJA_SELECT,
  })

  await db.auditLog.create({
    data: {
      tenantId: ctx.raizId,
      atorId: ctx.userId,
      acao: 'BRECHO_LOJA_SALVA',
      entidade: 'BrechoLoja',
      entidadeId: loja.id,
      detalhes: { nome: loja.nome },
    },
  })
  return loja
}

export async function listarFeedBrecho(
  ctx: BrechoContexto,
  opts: {
    q?: string
    categoria?: 'CAMISA' | 'BERMUDA' | 'PATCH' | 'BANDEIRA_PESSOAL' | 'OUTRO'
    modalidade?: 'TROCA' | 'DOACAO' | 'VENDA'
    sort: 'recentes' | 'confiaveis'
    pagina: number
    take?: number
  },
): Promise<{ itens: BrechoAnuncioCard[]; total: number }> {
  const take = opts.take ?? BRECHO_PAGE_SIZE
  const skip = (opts.pagina - 1) * take
  const q = opts.q?.trim()
  const where: Prisma.BrechoAnuncioWhereInput = {
    tenantId: { in: ctx.raizesFeed },
    status: 'ATIVO',
    loja: { ativa: true, congeladaEm: null },
    ...(opts.categoria ? { categoria: opts.categoria } : {}),
    ...(opts.modalidade ? { modalidade: opts.modalidade } : {}),
    ...(q
      ? {
          OR: [
            { titulo: { contains: q, mode: 'insensitive' } },
            { descricao: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const orderBy: Prisma.BrechoAnuncioOrderByWithRelationInput[] =
    opts.sort === 'confiaveis'
      ? [{ loja: { scoreConfianca: 'desc' } }, { loja: { trocasConcluidas: 'desc' } }, { criadoEm: 'desc' }]
      : [{ criadoEm: 'desc' }]

  const [rows, total, maxNaPraca]: [Array<Parameters<typeof toCard>[0]>, number, number] =
    await Promise.all([
    db.brechoAnuncio.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        titulo: true,
        modalidade: true,
        categoria: true,
        tamanho: true,
        preco: true,
        imagensUrl: true,
        criadoEm: true,
        vendedor: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
        loja: {
          select: {
            userId: true,
            nome: true,
            fotoUrl: true,
            scoreConfianca: true,
            trocasConcluidas: true,
          },
        },
      },
    }),
    db.brechoAnuncio.count({ where }),
    maxScoreConfiancaPraca(ctx.raizesFeed),
  ])

  return { itens: rows.map((row) => toCard(row, maxNaPraca)), total }
}

export type BrechoPracaHub = {
  raizId: string
  nome: string
  propria: boolean
  anunciosAtivos: number
}

/** Uma praça por Sede raiz no feed (própria + aliadas, se o flag estiver ligado). */
export async function listarPracasBrecho(ctx: BrechoContexto): Promise<BrechoPracaHub[]> {
  const ids = ctx.raizesFeed
  if (ids.length === 0) return []

  const [tenants, contagens]: [
    Array<{ id: string; nome: string }>,
    Array<{ tenantId: string; _count: { _all: number } }>,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true },
    }),
    db.brechoAnuncio.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: ids }, status: 'ATIVO' },
      _count: { _all: true },
    }),
  ])

  const nomePorId = new Map(tenants.map((t) => [t.id, t.nome]))
  const countPorId = new Map(contagens.map((c) => [c.tenantId, c._count._all]))

  return ids.map((raizId) => ({
    raizId,
    nome: nomePorId.get(raizId) ?? 'Brechó',
    propria: raizId === ctx.raizId,
    anunciosAtivos: countPorId.get(raizId) ?? 0,
  }))
}

export async function atualizarCapaLojaBrecho(
  ctx: BrechoContexto,
  capaUrl: string | null,
): Promise<BrechoLojaLite> {
  return atualizarCamposLojaBrecho(ctx, { capaUrl }, 'capa')
}

export async function atualizarCamposLojaBrecho(
  ctx: BrechoContexto,
  data: { nome?: string; fotoUrl?: string | null; capaUrl?: string | null },
  origem: 'capa' | 'foto' | 'nome',
): Promise<BrechoLojaLite> {
  const existente: { id: string } | null = await db.brechoLoja.findUnique({
    where: { tenantId_userId: { tenantId: ctx.raizId, userId: ctx.userId } },
    select: { id: true },
  })
  if (!existente) {
    throw new ExpectedError('Abra sua loja no brechó antes de editar a vitrine.')
  }

  const loja: BrechoLojaLite = await db.brechoLoja.update({
    where: { id: existente.id },
    data: {
      ...(data.nome !== undefined ? { nome: data.nome } : {}),
      ...(data.fotoUrl !== undefined ? { fotoUrl: data.fotoUrl } : {}),
      ...(data.capaUrl !== undefined ? { capaUrl: data.capaUrl } : {}),
    },
    select: LOJA_SELECT,
  })

  await db.auditLog.create({
    data: {
      tenantId: ctx.raizId,
      atorId: ctx.userId,
      acao: 'BRECHO_LOJA_SALVA',
      entidade: 'BrechoLoja',
      entidadeId: loja.id,
      detalhes: { ...data, origem },
    },
  })
  return loja
}

export async function listarLojasBrecho(
  ctx: BrechoContexto,
  opts: {
    sort: 'recentes' | 'confiaveis'
    pagina: number
    take?: number
    soComAnuncio?: boolean
  },
): Promise<{
  lojas: Array<
    BrechoLojaLite & {
      user: { nome: string | null; nickname: string | null; avatarUrl: string | null }
      anunciosAtivos: number
      capaExibicao: string | null
      estrelas: number
    }
  >
  total: number
}> {
  const take = opts.take ?? BRECHO_PAGE_SIZE
  const skip = (opts.pagina - 1) * take
  const where: Prisma.BrechoLojaWhereInput = {
    tenantId: { in: ctx.raizesFeed },
    ativa: true,
    congeladaEm: null,
    ...(opts.soComAnuncio ? { anuncios: { some: { status: 'ATIVO' } } } : {}),
  }
  const orderBy: Prisma.BrechoLojaOrderByWithRelationInput[] =
    opts.sort === 'confiaveis'
      ? [{ scoreConfianca: 'desc' }, { trocasConcluidas: 'desc' }, { criadoEm: 'desc' }]
      : [{ atualizadoEm: 'desc' }]

  type LojaRow = BrechoLojaLite & {
    user: { nome: string | null; nickname: string | null; avatarUrl: string | null }
    _count: { anuncios: number }
    anuncios: Array<{ imagensUrl: string[] }>
  }

  const [rows, total, maxNaPraca]: [LojaRow[], number, number] = await Promise.all([
    db.brechoLoja.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        ...LOJA_SELECT,
        user: { select: { nome: true, nickname: true, avatarUrl: true } },
        _count: { select: { anuncios: { where: { status: 'ATIVO' } } } },
        anuncios: {
          where: { status: 'ATIVO' },
          take: 1,
          orderBy: { criadoEm: 'desc' },
          select: { imagensUrl: true },
        },
      },
    }),
    db.brechoLoja.count({ where }),
    maxScoreConfiancaPraca(ctx.raizesFeed),
  ])

  return {
    lojas: rows.map((r) => {
      const { anuncios, _count, ...loja } = r
      return {
        ...loja,
        user: r.user,
        anunciosAtivos: _count.anuncios,
        capaExibicao: capaExibicaoBrecho(r.capaUrl, anuncios[0]?.imagensUrl),
        estrelas: estrelasConfiancaBrecho(loja.scoreConfianca, maxNaPraca),
      }
    }),
    total,
  }
}

export async function getLojaBrechoPorUser(
  ctx: BrechoContexto,
  userId: string,
): Promise<
  | (BrechoLojaLite & {
      user: { nome: string | null; nickname: string | null; avatarUrl: string | null }
      anuncios: BrechoAnuncioCard[]
      estrelas: number
    })
  | null
> {
  const loja: (BrechoLojaLite & {
    user: { nome: string | null; nickname: string | null; avatarUrl: string | null }
    anuncios: AnuncioToCardRow[]
  }) | null = await db.brechoLoja.findFirst({
    where: { tenantId: { in: ctx.raizesFeed }, userId, ativa: true },
    select: {
      ...LOJA_SELECT,
      user: { select: { nome: true, nickname: true, avatarUrl: true } },
      anuncios: {
        where: { status: 'ATIVO' },
        orderBy: { criadoEm: 'desc' },
        take: BRECHO_PAGE_SIZE,
        select: {
          id: true,
          titulo: true,
          modalidade: true,
          categoria: true,
          tamanho: true,
          preco: true,
          imagensUrl: true,
          criadoEm: true,
          vendedor: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
          loja: {
            select: {
              userId: true,
              nome: true,
              fotoUrl: true,
              scoreConfianca: true,
              trocasConcluidas: true,
            },
          },
        },
      },
    },
  })
  if (!loja) return null
  const maxNaPraca = await maxScoreConfiancaPraca(ctx.raizesFeed)
  return {
    ...loja,
    estrelas: estrelasConfiancaBrecho(loja.scoreConfianca, maxNaPraca),
    anuncios: loja.anuncios.map((row) => toCard(row, maxNaPraca)),
  }
}

export async function getAnuncioBrecho(
  ctx: BrechoContexto,
  anuncioId: string,
): Promise<{
  id: string
  tenantId: string
  titulo: string
  descricao: string
  modalidade: 'TROCA' | 'DOACAO' | 'VENDA'
  categoria: 'CAMISA' | 'BERMUDA' | 'PATCH' | 'BANDEIRA_PESSOAL' | 'OUTRO'
  tamanho: string | null
  preco: unknown
  aceitoTroca: string | null
  imagensUrl: string[]
  status: 'ATIVO' | 'RESERVADO' | 'CONCLUIDO' | 'OCULTO' | 'REMOVIDO'
  criadoEm: Date
  vendedor: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  loja: BrechoLojaLite
  estrelas: number
  meuInteresse: {
    id: string
    conversaId: string
    vendedorConfirmouEm: Date | null
    interessadoConfirmouEm: Date | null
  } | null
} | null> {
  const row = await db.brechoAnuncio.findFirst({
    where: { id: anuncioId, tenantId: { in: ctx.raizesFeed } },
    select: {
      id: true,
      tenantId: true,
      titulo: true,
      descricao: true,
      modalidade: true,
      categoria: true,
      tamanho: true,
      preco: true,
      aceitoTroca: true,
      imagensUrl: true,
      status: true,
      criadoEm: true,
      vendedor: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
      loja: { select: LOJA_SELECT },
      interesses: {
        where: { interessadoId: ctx.userId },
        select: {
          id: true,
          conversaId: true,
          vendedorConfirmouEm: true,
          interessadoConfirmouEm: true,
        },
        take: 1,
      },
    },
  })
  if (!row) return null
  if (row.status !== 'ATIVO' && row.vendedor.id !== ctx.userId) return null
  const maxNaPraca = await maxScoreConfiancaPraca(ctx.raizesFeed)
  return {
    ...row,
    estrelas: estrelasConfiancaBrecho(row.loja.scoreConfianca, maxNaPraca),
    meuInteresse: row.interesses[0] ?? null,
  }
}

export async function listarMeusAnuncios(ctx: BrechoContexto): Promise<
  Array<{
    id: string
    titulo: string
    modalidade: 'TROCA' | 'DOACAO' | 'VENDA'
    categoria: 'CAMISA' | 'BERMUDA' | 'PATCH' | 'BANDEIRA_PESSOAL' | 'OUTRO'
    status: 'ATIVO' | 'RESERVADO' | 'CONCLUIDO' | 'OCULTO' | 'REMOVIDO'
    imagensUrl: string[]
    criadoEm: Date
  }>
> {
  return db.brechoAnuncio.findMany({
    where: { tenantId: ctx.raizId, vendedorId: ctx.userId, status: { not: 'REMOVIDO' } },
    orderBy: { criadoEm: 'desc' },
    take: 100,
    select: {
      id: true,
      titulo: true,
      modalidade: true,
      categoria: true,
      status: true,
      imagensUrl: true,
      criadoEm: true,
    },
  })
}

export async function criarAnuncioBrecho(
  ctx: BrechoContexto,
  data: {
    titulo: string
    descricao: string
    modalidade: 'TROCA' | 'DOACAO' | 'VENDA'
    categoria: 'CAMISA' | 'BERMUDA' | 'PATCH' | 'BANDEIRA_PESSOAL' | 'OUTRO'
    tamanho?: string | null
    preco?: number | null
    aceitoTroca?: string | null
    imagensUrl: string[]
  },
): Promise<{ id: string }> {
  if (excedeuLimiteEngajamento(`brecho:anuncio:${ctx.userId}`)) {
    throw new ExpectedError('Calma — você criou anúncios demais neste minuto.')
  }
  const loja = await getMinhaLojaBrecho(ctx)
  if (!loja) throw new ExpectedError('Abra sua loja no brechó antes de anunciar.')
  if (!loja.ativa || loja.congeladaEm) {
    throw new ExpectedError('Sua loja está suspensa e não pode anunciar.')
  }

  const criado: { id: string } = await db.brechoAnuncio.create({
    data: {
      tenantId: ctx.raizId,
      lojaId: loja.id,
      vendedorId: ctx.userId,
      origemTenantId: ctx.origemTenantId,
      titulo: data.titulo,
      descricao: data.descricao,
      modalidade: data.modalidade,
      categoria: data.categoria,
      tamanho: data.tamanho ?? null,
      preco: data.preco ?? null,
      aceitoTroca: data.aceitoTroca ?? null,
      imagensUrl: data.imagensUrl,
      status: 'ATIVO',
    },
    select: { id: true },
  })

  registrarAcaoEngajamento(`brecho:anuncio:${ctx.userId}`)
  await db.auditLog.create({
    data: {
      tenantId: ctx.raizId,
      atorId: ctx.userId,
      acao: 'BRECHO_ANUNCIO_CRIADO',
      entidade: 'BrechoAnuncio',
      entidadeId: criado.id,
      detalhes: { titulo: data.titulo, modalidade: data.modalidade },
    },
  })
  return criado
}

export async function atualizarAnuncioBrecho(
  ctx: BrechoContexto,
  anuncioId: string,
  data: {
    titulo?: string
    descricao?: string
    modalidade?: 'TROCA' | 'DOACAO' | 'VENDA'
    categoria?: 'CAMISA' | 'BERMUDA' | 'PATCH' | 'BANDEIRA_PESSOAL' | 'OUTRO'
    tamanho?: string | null
    preco?: number | null
    aceitoTroca?: string | null
    imagensUrl?: string[]
    status?: 'ATIVO' | 'RESERVADO' | 'OCULTO' | 'REMOVIDO'
  },
): Promise<void> {
  const anuncio: { id: string; vendedorId: string; status: string } | null =
    await db.brechoAnuncio.findFirst({
      where: { id: anuncioId, tenantId: ctx.raizId },
      select: { id: true, vendedorId: true, status: true },
    })
  if (!anuncio || anuncio.vendedorId !== ctx.userId) {
    throw new ExpectedError('Anúncio não encontrado.')
  }
  if (anuncio.status === 'CONCLUIDO' || anuncio.status === 'REMOVIDO') {
    throw new ExpectedError('Este anúncio não pode mais ser editado.')
  }
  await db.brechoAnuncio.update({
    where: { id: anuncioId },
    data: {
      ...(data.titulo != null ? { titulo: data.titulo } : {}),
      ...(data.descricao != null ? { descricao: data.descricao } : {}),
      ...(data.modalidade != null ? { modalidade: data.modalidade } : {}),
      ...(data.categoria != null ? { categoria: data.categoria } : {}),
      ...(data.tamanho !== undefined ? { tamanho: data.tamanho } : {}),
      ...(data.preco !== undefined ? { preco: data.preco } : {}),
      ...(data.aceitoTroca !== undefined ? { aceitoTroca: data.aceitoTroca } : {}),
      ...(data.imagensUrl != null ? { imagensUrl: data.imagensUrl } : {}),
      ...(data.status != null ? { status: data.status } : {}),
    },
  })
  await db.auditLog.create({
    data: {
      tenantId: ctx.raizId,
      atorId: ctx.userId,
      acao: 'BRECHO_ANUNCIO_ATUALIZADO',
      entidade: 'BrechoAnuncio',
      entidadeId: anuncioId,
      detalhes: { status: data.status ?? null },
    },
  })
}

export async function demonstrarInteresseBrecho(
  ctx: BrechoContexto,
  anuncioId: string,
): Promise<{ conversaId: string; interesseId: string; criado: boolean }> {
  if (excedeuLimiteEngajamento(`brecho:interesse:${ctx.userId}`)) {
    throw new ExpectedError('Calma — você demonstrou interesse demais neste minuto.')
  }

  const anuncio = await db.brechoAnuncio.findFirst({
    where: { id: anuncioId, tenantId: { in: ctx.raizesFeed } },
    select: {
      id: true,
      tenantId: true,
      titulo: true,
      status: true,
      vendedorId: true,
      loja: { select: { ativa: true, congeladaEm: true } },
    },
  })
  if (!anuncio) throw new ExpectedError('Anúncio não encontrado.')

  const check = podeDemonstrarInteresse({
    interessadoId: ctx.userId,
    vendedorId: anuncio.vendedorId,
    anuncioStatus: anuncio.status,
    lojaAtiva: anuncio.loja.ativa,
    lojaCongelada: Boolean(anuncio.loja.congeladaEm),
  })
  if (!check.ok) throw new ExpectedError(check.erro)

  const acesso = await avaliarAcessoDm(ctx.userId, anuncio.vendedorId, anuncio.tenantId)
  if (acesso === 'bloqueado') {
    throw new ExpectedError('Você não pode conversar com este sócio.')
  }

  const existente: { id: string; conversaId: string } | null = await db.brechoInteresse.findUnique({
    where: { anuncioId_interessadoId: { anuncioId, interessadoId: ctx.userId } },
    select: { id: true, conversaId: true },
  })
  if (existente) return { conversaId: existente.conversaId, interesseId: existente.id, criado: false }

  registrarAcaoEngajamento(`brecho:interesse:${ctx.userId}`)

  const idCurto = idCurtoBrecho(anuncio.id)
  const nome = nomeConversaBrecho({ titulo: anuncio.titulo, idCurto })

  const interesse = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const conversa: { id: string } = await tx.conversa.create({
      data: {
        tipo: 'GRUPO',
        tenantId: anuncio.tenantId,
        nome,
        comunidade: false,
        publica: false,
        criadoPorId: ctx.userId,
        membros: {
          create: [
            { userId: ctx.userId, papel: 'MEMBRO', status: 'ATIVO' },
            { userId: anuncio.vendedorId, papel: 'MEMBRO', status: 'ATIVO' },
          ],
        },
      },
      select: { id: true },
    })

    const criado: { id: string; conversaId: string } = await tx.brechoInteresse.create({
      data: {
        tenantId: anuncio.tenantId,
        anuncioId: anuncio.id,
        interessadoId: ctx.userId,
        conversaId: conversa.id,
      },
      select: { id: true, conversaId: true },
    })

    await tx.brechoTroca.create({
      data: {
        tenantId: anuncio.tenantId,
        interesseId: criado.id,
        vendedorId: anuncio.vendedorId,
        interessadoId: ctx.userId,
        status: 'ABERTA',
      },
    })

    return criado
  })

  await criarMensagem(
    interesse.conversaId,
    ctx.userId,
    [
      `Tenho interesse neste item: ${anuncio.titulo}.`,
      '',
      BRECHO_AVISO(),
    ].join('\n'),
    [],
  )

  await notificarSafe({
    userId: anuncio.vendedorId,
    tenantId: anuncio.tenantId,
    tipo: 'BRECHO_INTERESSE',
    titulo: 'Alguém se interessou no seu anúncio',
    corpo: anuncio.titulo,
    link: `/portal/mensagens?c=${interesse.conversaId}`,
    atorId: ctx.userId,
  })

  await db.auditLog.create({
    data: {
      tenantId: anuncio.tenantId,
      atorId: ctx.userId,
      acao: 'BRECHO_INTERESSE',
      entidade: 'BrechoInteresse',
      entidadeId: interesse.id,
      detalhes: { anuncioId, conversaId: interesse.conversaId },
    },
  })

  return { conversaId: interesse.conversaId, interesseId: interesse.id, criado: true }
}

function BRECHO_AVISO() {
  return 'A plataforma não intermedia pagamento nem atesta autenticidade. Combine encontro na sede.'
}

export async function confirmarTrocaBrecho(
  ctx: BrechoContexto,
  interesseId: string,
): Promise<{ concluida: boolean }> {
  const interesse = await db.brechoInteresse.findFirst({
    where: { id: interesseId, tenantId: { in: ctx.raizesFeed } },
    select: {
      id: true,
      tenantId: true,
      interessadoId: true,
      vendedorConfirmouEm: true,
      interessadoConfirmouEm: true,
      anuncio: {
        select: {
          id: true,
          status: true,
          vendedorId: true,
          lojaId: true,
        },
      },
      troca: { select: { id: true, status: true } },
    },
  })
  if (!interesse) throw new ExpectedError('Troca não encontrada.')

  const vendedorId = interesse.anuncio.vendedorId
  const souVendedor = ctx.userId === vendedorId
  const jaConfirmou = souVendedor
    ? Boolean(interesse.vendedorConfirmouEm)
    : Boolean(interesse.interessadoConfirmouEm)

  const check = podeConfirmarTroca({
    userId: ctx.userId,
    vendedorId,
    interessadoId: interesse.interessadoId,
    jaConfirmou,
    anuncioStatus: interesse.anuncio.status,
  })
  if (!check.ok) throw new ExpectedError(check.erro)

  const agora = new Date()
  await db.brechoInteresse.update({
    where: { id: interesse.id },
    data: souVendedor ? { vendedorConfirmouEm: agora } : { interessadoConfirmouEm: agora },
  })

  const atualizado = await db.brechoInteresse.findUnique({
    where: { id: interesse.id },
    select: { vendedorConfirmouEm: true, interessadoConfirmouEm: true },
  })
  const estado = estadoConfirmacaoTroca({
    vendedorConfirmouEm: atualizado?.vendedorConfirmouEm ?? null,
    interessadoConfirmouEm: atualizado?.interessadoConfirmouEm ?? null,
  })
  if (estado !== 'concluida') return { concluida: false }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.brechoTroca.updateMany({
      where: { interesseId: interesse.id, status: 'ABERTA' },
      data: { status: 'CONCLUIDA', concluidaEm: agora },
    })
    await tx.brechoAnuncio.update({
      where: { id: interesse.anuncio.id },
      data: { status: 'CONCLUIDO' },
    })
    await recalcularScoreLoja(tx, interesse.tenantId, vendedorId)
    await recalcularScoreLoja(tx, interesse.tenantId, interesse.interessadoId)
  })

  const outroId = souVendedor ? interesse.interessadoId : vendedorId
  await notificarSafe({
    userId: outroId,
    tenantId: interesse.tenantId,
    tipo: 'BRECHO_TROCA_CONFIRMADA',
    titulo: 'Troca confirmada no brechó',
    corpo: 'Os dois lados confirmaram a entrega. Isso sobe a confiança no ranking.',
    link: `/portal/loja/brecho/${interesse.anuncio.id}`,
    atorId: ctx.userId,
  })

  await db.auditLog.create({
    data: {
      tenantId: interesse.tenantId,
      atorId: ctx.userId,
      acao: 'BRECHO_TROCA_CONCLUIDA',
      entidade: 'BrechoTroca',
      entidadeId: interesse.troca?.id ?? interesse.id,
      detalhes: { anuncioId: interesse.anuncio.id },
    },
  })

  return { concluida: true }
}

async function recalcularScoreLoja(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const loja: { id: string; congeladaEm: Date | null } | null = await tx.brechoLoja.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { id: true, congeladaEm: true },
  })
  if (!loja) return

  const trocas: Array<{ vendedorId: string; interessadoId: string }> = await tx.brechoTroca.findMany({
    where: {
      tenantId,
      status: 'CONCLUIDA',
      OR: [{ vendedorId: userId }, { interessadoId: userId }],
    },
    select: { vendedorId: true, interessadoId: true },
  })
  const counterparties = new Set<string>()
  for (const t of trocas) {
    counterparties.add(t.vendedorId === userId ? t.interessadoId : t.vendedorId)
  }

  const denunciasProcedentes: number = await tx.denunciaBrecho.count({
    where: {
      tenantId,
      status: 'RESOLVIDA',
      OR: [{ lojaId: loja.id }, { anuncio: { vendedorId: userId } }],
    },
  })

  const trocasConcluidas = trocas.length
  const contrapartesUnicas = counterparties.size
  const scoreConfianca = calcularScoreConfianca({
    trocasConcluidas,
    contrapartesUnicas,
    denunciasProcedentes,
    congelada: Boolean(loja.congeladaEm),
  })

  await tx.brechoLoja.update({
    where: { id: loja.id },
    data: { trocasConcluidas, contrapartesUnicas, scoreConfianca },
  })
}

export async function notificarStaffBrechoLinhaagem(input: {
  raizId: string
  titulo: string
  corpo: string
  link: string
  atorId: string
}): Promise<void> {
  const lineage: string[] = await getTorcidaLineageTenantIds(input.raizId)
  const dest = new Set<string>()
  for (const tenantId of lineage) {
    const ids: string[] = await listarDestinatariosAdminPorPermissoes(
      tenantId,
      [PERMISSIONS.STORE_VIEW_ORDERS, PERMISSIONS.STORE_MANAGE],
      input.atorId,
    )
    for (const id of ids) dest.add(id)
  }
  await Promise.all(
    [...dest].map((userId) =>
      notificarSafe({
        userId,
        tenantId: input.raizId,
        tipo: 'BRECHO_DENUNCIA',
        titulo: input.titulo,
        corpo: input.corpo,
        link: input.link,
        atorId: input.atorId,
      }),
    ),
  )
}

export { recalcularScoreLoja }
