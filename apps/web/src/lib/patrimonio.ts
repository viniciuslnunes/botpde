import { cache } from 'react'
import { db } from '@torcida/db'
import type { CategoriaPatrimonioItem, StatusPatrimonioItem } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { PATRIMONIO_PAGE_SIZE } from '@torcida/types'

export type PatrimonioItemLite = {
  id: string
  nome: string
  categoria: CategoriaPatrimonioItem
  status: StatusPatrimonioItem
  quantidade: number
  localizacao: string | null
  valorEstimado: Prisma.Decimal | null
  observacao: string | null
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

function buildWhere(
  tenantId: string,
  filtro?: PatrimonioFiltro,
): Prisma.PatrimonioItemWhereInput {
  const where: Prisma.PatrimonioItemWhereInput = { tenantId }
  if (!filtro) {
    where.status = { not: 'BAIXADO' }
    return where
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
  return where
}

export const resumirPatrimonio = cache(async function resumirPatrimonio(
  tenantId: string,
): Promise<PatrimonioResumo> {
  const grouped: Array<{
    status: StatusPatrimonioItem
    _count: { _all: number }
    _sum: { quantidade: number | null }
  }> = await db.patrimonioItem.groupBy({
    by: ['status'],
    where: { tenantId },
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

export const listarPatrimonio = cache(async function listarPatrimonio(
  tenantId: string,
  opts?: { filtro?: PatrimonioFiltro; pageSize?: number },
): Promise<{ itens: PatrimonioItemLite[]; page: number; pageSize: number; total: number }> {
  const pageSize = opts?.pageSize ?? PATRIMONIO_PAGE_SIZE
  const page = Math.max(1, opts?.filtro?.page ?? 1)
  const where = buildWhere(tenantId, opts?.filtro)

  const [total, rows]: [number, PatrimonioItemLite[]] = await Promise.all([
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
        criadoEm: true,
        atualizadoEm: true,
        responsavel: { select: { id: true, nome: true } },
        criadoPor: { select: { id: true, nome: true } },
      },
    }),
  ])

  return { itens: rows, page, pageSize, total }
})

export const carregarPainelPatrimonio = cache(async function carregarPainelPatrimonio(
  tenantId: string,
  recentes = 5,
): Promise<{ resumo: PatrimonioResumo; recentes: PatrimonioItemLite[] }> {
  const [resumo, lista] = await Promise.all([
    resumirPatrimonio(tenantId),
    listarPatrimonio(tenantId, { pageSize: recentes, filtro: { page: 1 } }),
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
