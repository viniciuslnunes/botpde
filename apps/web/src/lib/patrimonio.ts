import { cache } from 'react'
import { db } from '@torcida/db'
import type { CategoriaPatrimonioItem, StatusPatrimonioItem } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { nomesPecasPatrimonio, PATRIMONIO_PAGE_SIZE, patrimonioEhPecaUnica } from '@torcida/types'

export type PatrimonioItemLite = {
  id: string
  nome: string
  categoria: CategoriaPatrimonioItem
  status: StatusPatrimonioItem
  quantidade: number
  localizacao: string | null
  valorEstimado: Prisma.Decimal | null
  observacao: string | null
  fotoUrl: string | null
  /** Catálogo ou, na falta, última evidência de empréstimo — só para a grade. */
  fotoPreviewUrl: string | null
  meta: Prisma.JsonValue | null
  criadoEm: Date
  atualizadoEm: Date
  responsavel: { id: string; nome: string | null } | null
  criadoPor: { id: string; nome: string | null }
}

export type PatrimonioResumo = {
  totalAtivos: number
  disponiveis: number
  emUso: number
  manutencao: number
  baixados: number
  quantidadeItens: number
}

export type PatrimonioFiltro = {
  categoria?: CategoriaPatrimonioItem
  status?: StatusPatrimonioItem
  q?: string
  page?: number
  incluirBaixados?: boolean
}

/**
 * Recorte de categoria imposto pelo RBAC (`flags:view` = só `BANDEIRA`).
 * Aplicado **depois** do filtro do usuário: o query param nunca amplia escopo.
 */
export type EscopoCategoria = CategoriaPatrimonioItem | null

function aplicarEscopo(
  where: Prisma.PatrimonioItemWhereInput,
  escopoCategoria: EscopoCategoria,
): Prisma.PatrimonioItemWhereInput {
  if (escopoCategoria) where.categoria = escopoCategoria
  return where
}

function buildWhere(
  tenantId: string,
  filtro?: PatrimonioFiltro,
  escopoCategoria: EscopoCategoria = null,
): Prisma.PatrimonioItemWhereInput {
  const where: Prisma.PatrimonioItemWhereInput = { tenantId }
  if (!filtro) {
    where.status = { not: 'BAIXADO' }
    return aplicarEscopo(where, escopoCategoria)
  }

  if (filtro.categoria) where.categoria = filtro.categoria
  if (filtro.status) {
    where.status = filtro.status
  } else if (!filtro.incluirBaixados) {
    where.status = { not: 'BAIXADO' }
  }
  if (filtro.q) {
    where.OR = [
      { nome: { contains: filtro.q, mode: 'insensitive' } },
      { localizacao: { contains: filtro.q, mode: 'insensitive' } },
      { observacao: { contains: filtro.q, mode: 'insensitive' } },
    ]
  }
  return aplicarEscopo(where, escopoCategoria)
}

export const resumirPatrimonio = cache(async function resumirPatrimonio(
  tenantId: string,
  escopoCategoria: EscopoCategoria = null,
): Promise<PatrimonioResumo> {
  const grouped: Array<{
    status: StatusPatrimonioItem
    _count: { _all: number }
    _sum: { quantidade: number | null }
  }> = await db.patrimonioItem.groupBy({
    by: ['status'],
    where: aplicarEscopo({ tenantId }, escopoCategoria),
    _count: { _all: true },
    _sum: { quantidade: true },
  })

  let disponiveis = 0
  let emUso = 0
  let manutencao = 0
  let baixados = 0
  let quantidadeItens = 0
  for (const row of grouped) {
    const q = row._sum.quantidade ?? 0
    quantidadeItens += row._count._all
    if (row.status === 'DISPONIVEL') disponiveis += q
    else if (row.status === 'EM_USO') emUso += q
    else if (row.status === 'MANUTENCAO') manutencao += q
    else if (row.status === 'BAIXADO') baixados += q
  }

  return {
    totalAtivos: disponiveis + emUso + manutencao,
    disponiveis,
    emUso,
    manutencao,
    baixados,
    quantidadeItens,
  }
})

function fotoPreviewDoItem(
  fotoUrl: string | null,
  emprestimo?: { fotoSaidaUrl: string; fotoGuardaUrl: string | null } | null,
): string | null {
  if (fotoUrl) return fotoUrl
  if (!emprestimo) return null
  return emprestimo.fotoGuardaUrl || emprestimo.fotoSaidaUrl || null
}

export const listarPatrimonio = cache(async function listarPatrimonio(
  tenantId: string,
  opts?: {
    filtro?: PatrimonioFiltro
    pageSize?: number
    escopoCategoria?: EscopoCategoria
  },
): Promise<{ itens: PatrimonioItemLite[]; page: number; pageSize: number; total: number }> {
  const pageSize = opts?.pageSize ?? PATRIMONIO_PAGE_SIZE
  const page = Math.max(1, opts?.filtro?.page ?? 1)
  const where = buildWhere(tenantId, opts?.filtro, opts?.escopoCategoria ?? null)

  type Row = Omit<PatrimonioItemLite, 'fotoPreviewUrl'> & {
    emprestimos: Array<{ fotoSaidaUrl: string; fotoGuardaUrl: string | null }>
  }

  const [total, rows]: [number, Row[]] = await Promise.all([
    db.patrimonioItem.count({ where }),
    db.patrimonioItem.findMany({
      where,
      orderBy: [{ status: 'asc' }, { nome: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        nome: true,
        categoria: true,
        status: true,
        quantidade: true,
        localizacao: true,
        valorEstimado: true,
        observacao: true,
        fotoUrl: true,
        meta: true,
        criadoEm: true,
        atualizadoEm: true,
        responsavel: { select: { id: true, nome: true } },
        criadoPor: { select: { id: true, nome: true } },
        emprestimos: {
          orderBy: { abertoEm: 'desc' },
          take: 1,
          select: { fotoSaidaUrl: true, fotoGuardaUrl: true },
        },
      },
    }),
  ])

  const itens: PatrimonioItemLite[] = rows.map((row) => {
    const { emprestimos, ...item } = row
    return {
      ...item,
      fotoPreviewUrl: fotoPreviewDoItem(item.fotoUrl, emprestimos[0] ?? null),
    }
  })

  return { itens, page, pageSize, total }
})

export type PatrimonioEmprestimoLite = {
  id: string
  status: 'ABERTO' | 'DEVOLVIDO' | 'COM_DANO'
  fotoSaidaUrl: string
  fotoGuardaUrl: string | null
  abertoEm: Date
  devolvidoEm: Date | null
  danoReportado: boolean
  danoObservacao: string | null
  item: { id: string; nome: string; categoria: CategoriaPatrimonioItem; status: StatusPatrimonioItem }
  user: { id: string; nome: string | null }
}

/** Empréstimos abertos (+ recentes devolvidos) para inbox admin / meus empréstimos. */
export const listarEmprestimosPatrimonio = cache(async function listarEmprestimosPatrimonio(
  tenantId: string,
  opts?: {
    userId?: string
    status?: 'ABERTO' | 'DEVOLVIDO' | 'COM_DANO'
    limite?: number
    escopoCategoria?: EscopoCategoria
  },
): Promise<PatrimonioEmprestimoLite[]> {
  const rows: PatrimonioEmprestimoLite[] = await db.patrimonioEmprestimo.findMany({
    where: {
      tenantId,
      ...(opts?.userId ? { userId: opts.userId } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.escopoCategoria ? { item: { categoria: opts.escopoCategoria } } : {}),
    },
    orderBy: { abertoEm: 'desc' },
    take: opts?.limite ?? 40,
    select: {
      id: true,
      status: true,
      fotoSaidaUrl: true,
      fotoGuardaUrl: true,
      abertoEm: true,
      devolvidoEm: true,
      danoReportado: true,
      danoObservacao: true,
      item: { select: { id: true, nome: true, categoria: true, status: true } },
      user: { select: { id: true, nome: true } },
    },
  })
  return rows
})

export const carregarPainelPatrimonio = cache(async function carregarPainelPatrimonio(
  tenantId: string,
  recentes = 5,
  escopoCategoria: EscopoCategoria = null,
): Promise<{ resumo: PatrimonioResumo; recentes: PatrimonioItemLite[] }> {
  const [resumo, lista] = await Promise.all([
    resumirPatrimonio(tenantId, escopoCategoria),
    listarPatrimonio(tenantId, { pageSize: recentes, filtro: { page: 1 }, escopoCategoria }),
  ])
  return { resumo, recentes: lista.itens }
})

/** Candidatos a responsável: membros ativos do tenant (limitado). */
export const listarCandidatosResponsavelPatrimonio = cache(
  async function listarCandidatosResponsavelPatrimonio(
    tenantId: string,
  ): Promise<Array<{ id: string; nome: string | null; email: string }>> {
    const rows: Array<{
      user: { id: string; nome: string | null; email: string }
    }> = await db.saasMembro.findMany({
      where: { tenantId, status: 'APROVADO' },
      take: 200,
      orderBy: { nome: 'asc' },
      select: {
        user: { select: { id: true, nome: true, email: true } },
      },
    })
    const seen = new Set<string>()
    const out: Array<{ id: string; nome: string | null; email: string }> = []
    for (const r of rows) {
      if (seen.has(r.user.id)) continue
      seen.add(r.user.id)
      out.push(r.user)
    }
    out.sort((a, b) => (a.nome ?? a.email).localeCompare(b.nome ?? b.email))
    return out
  },
)

export type LoteBandeiraExpandivel = {
  id: string
  tenantId: string
  nome: string
  categoria: string
  quantidade: number
  status: StatusPatrimonioItem
  localizacao: string | null
  valorEstimado: Prisma.Decimal | number | null
  observacao: string | null
  fotoUrl: string | null
  meta: Prisma.JsonValue | null
  areaId: string | null
  responsavelId: string | null
  criadoPorId: string
}

/**
 * Lote de bandeira (`quantidade > 1`) vira N peças com foto/vistoria próprias.
 * O registro original fica a peça 1 e conserva empréstimos; as cópias
 * herdam `BAIXADO` se o lote já estava baixado, senão nascem `DISPONIVEL`
 * — não dá para saber quais das N estavam fora.
 */
export async function expandirLoteBandeira(
  tx: { patrimonioItem: Pick<typeof db.patrimonioItem, 'createMany' | 'update'> },
  lote: LoteBandeiraExpandivel,
): Promise<{ criados: number }> {
  if (!patrimonioEhPecaUnica(lote.categoria) || lote.quantidade <= 1) {
    return { criados: 0 }
  }
  const nomes: string[] = nomesPecasPatrimonio(lote.nome, lote.quantidade)
  const clones = nomes.slice(1).map((nome) => ({
    id: crypto.randomUUID(),
    tenantId: lote.tenantId,
    nome,
    categoria: lote.categoria as CategoriaPatrimonioItem,
    status: lote.status === 'BAIXADO' ? 'BAIXADO' : 'DISPONIVEL',
    quantidade: 1,
    localizacao: lote.localizacao,
    valorEstimado: lote.valorEstimado ?? null,
    observacao: lote.observacao,
    fotoUrl: lote.fotoUrl,
    ...(lote.meta != null ? { meta: lote.meta as Prisma.InputJsonValue } : {}),
    areaId: lote.areaId,
    responsavelId: lote.responsavelId,
    criadoPorId: lote.criadoPorId,
  }))
  if (clones.length > 0) {
    await tx.patrimonioItem.createMany({ data: clones })
  }
  await tx.patrimonioItem.update({
    where: { id: lote.id },
    data: { quantidade: 1, nome: nomes[0] },
  })
  return { criados: clones.length }
}
