import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import type { MetodoPagamentoBar, StatusVendaBar, TipoSede } from '@torcida/db'
import { Prisma } from '@torcida/db'
import { BAR_PAGE_SIZE } from '@torcida/types'

export type BarUnidadeLite = {
  id: string
  nome: string
  tipo: TipoSede
}

export type BarCategoriaLite = {
  id: string
  nome: string
  slug: string
  ordem: number
  ativo: boolean
}

export type BarProdutoLite = {
  id: string
  nome: string
  descricao: string | null
  preco: Prisma.Decimal
  custoMedio: Prisma.Decimal
  estoque: number
  estoqueMinimo: number | null
  imagemUrl: string | null
  ativo: boolean
  destaque: boolean
  ordem: number
  categoria: { id: string; nome: string } | null
}

export type BarVendaItemLite = {
  id: string
  produtoId: string | null
  produtoNome: string
  quantidade: number
  precoUnit: Prisma.Decimal
  total: Prisma.Decimal
}

export type BarVendaLite = {
  id: string
  subtotal: Prisma.Decimal
  desconto: Prisma.Decimal
  total: Prisma.Decimal
  metodoPagamento: MetodoPagamentoBar
  status: StatusVendaBar
  pagoEm: Date | null
  observacao: string | null
  criadoEm: Date
  operador: { id: string; nome: string | null }
  itens: BarVendaItemLite[]
}

export type BarVendasResumo = {
  totalVendas: number
  totalPago: number
  quantidade: number
}

const produtoSelect = {
  id: true,
  nome: true,
  descricao: true,
  preco: true,
  custoMedio: true,
  estoque: true,
  estoqueMinimo: true,
  imagemUrl: true,
  ativo: true,
  destaque: true,
  ordem: true,
  categoria: { select: { id: true, nome: true } },
} satisfies Prisma.BarProdutoSelect

/**
 * Resolve a unidade operacional do Bar para o usuário no tenant.
 *
 * 1. `SaasMembro.sedeId` (unidade do vínculo territorial)
 * 2. Senão, a SEDE principal ativa do tenant
 *
 * Garante isolamento: sede/subsede/PDE não compartilham estoque.
 */
export const resolveUnidadeBar = cache(async function resolveUnidadeBar(
  tenantId: string,
  userId: string,
): Promise<BarUnidadeLite> {
  const membro: { sedeId: string | null } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { sedeId: true },
  })

  if (membro?.sedeId) {
    const unidade: BarUnidadeLite | null = await db.sede.findFirst({
      where: { id: membro.sedeId, tenantId, ativa: true },
      select: { id: true, nome: true, tipo: true },
    })
    if (unidade) return unidade
  }

  const sedePrincipal: BarUnidadeLite | null = await db.sede.findFirst({
    where: { tenantId, tipo: 'SEDE', ativa: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, tipo: true },
  })
  if (sedePrincipal) return sedePrincipal

  // Último recurso: qualquer unidade ativa do tenant (PDE/subsede órfãos).
  const qualquer: BarUnidadeLite | null = await db.sede.findFirst({
    where: { tenantId, ativa: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, tipo: true },
  })
  if (qualquer) return qualquer

  throw new Error('Nenhuma unidade (sede/subsede/PDE) ativa neste tenant para operar o Bar')
})

/** Confirma que a unidade pertence ao tenant (antes de mutações). */
export async function assertUnidadeDoTenant(
  tenantId: string,
  sedeId: string,
): Promise<BarUnidadeLite> {
  const unidade: BarUnidadeLite | null = await db.sede.findFirst({
    where: { id: sedeId, tenantId, ativa: true },
    select: { id: true, nome: true, tipo: true },
  })
  if (!unidade) throw new Error('Unidade inválida para este tenant')
  return unidade
}

export const listarProdutosBar = cache(async function listarProdutosBar(
  tenantId: string,
  sedeId: string,
  opts?: { apenasAtivos?: boolean; categoriaId?: string },
): Promise<BarProdutoLite[]> {
  const where: Prisma.BarProdutoWhereInput = { tenantId, sedeId }
  if (opts?.apenasAtivos) where.ativo = true
  if (opts?.categoriaId) where.categoriaId = opts.categoriaId

  const rows: BarProdutoLite[] = await db.barProduto.findMany({
    where,
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: produtoSelect,
  })
  return rows
})

export const listarCategoriasBar = cache(async function listarCategoriasBar(
  tenantId: string,
  sedeId: string,
): Promise<BarCategoriaLite[]> {
  const rows: BarCategoriaLite[] = await db.barCategoria.findMany({
    where: { tenantId, sedeId },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: { id: true, nome: true, slug: true, ordem: true, ativo: true },
  })
  return rows
})

export const listarVendasBar = cache(async function listarVendasBar(
  tenantId: string,
  sedeId: string,
  opts?: { status?: StatusVendaBar; page?: number; pageSize?: number },
): Promise<{ itens: BarVendaLite[]; page: number; pageSize: number; total: number }> {
  const pageSize = opts?.pageSize ?? BAR_PAGE_SIZE
  const page = Math.max(1, opts?.page ?? 1)
  const where: Prisma.BarVendaWhereInput = { tenantId, sedeId }
  if (opts?.status) where.status = opts.status

  const [total, rows]: [number, BarVendaLite[]] = await Promise.all([
    db.barVenda.count({ where }),
    db.barVenda.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        subtotal: true,
        desconto: true,
        total: true,
        metodoPagamento: true,
        status: true,
        pagoEm: true,
        observacao: true,
        criadoEm: true,
        operador: { select: { id: true, nome: true } },
        itens: {
          select: {
            id: true,
            produtoId: true,
            produtoNome: true,
            quantidade: true,
            precoUnit: true,
            total: true,
          },
        },
      },
    }),
  ])

  return { itens: rows, page, pageSize, total }
})

/** Resumo das vendas pagas da unidade (bruto, líquido após desconto e quantidade). */
export const resumirVendasBar = cache(async function resumirVendasBar(
  tenantId: string,
  sedeId: string,
  opts?: { desde?: Date },
): Promise<BarVendasResumo> {
  const where: Prisma.BarVendaWhereInput = { tenantId, sedeId, status: 'PAGA' }
  if (opts?.desde) where.criadoEm = { gte: opts.desde }

  const agg: {
    _sum: { subtotal: Prisma.Decimal | null; total: Prisma.Decimal | null }
    _count: { _all: number }
  } = await db.barVenda.aggregate({
    where,
    _sum: { subtotal: true, total: true },
    _count: { _all: true },
  })

  return {
    totalVendas: Number(agg._sum.subtotal ?? 0),
    totalPago: Number(agg._sum.total ?? 0),
    quantidade: agg._count._all,
  }
})

/**
 * Produtos ativos da unidade com estoque igual ou abaixo do mínimo.
 */
export const listarEstoqueBaixo = cache(async function listarEstoqueBaixo(
  tenantId: string,
  sedeId: string,
): Promise<BarProdutoLite[]> {
  const rows: BarProdutoLite[] = await db.barProduto.findMany({
    where: { tenantId, sedeId, ativo: true, estoqueMinimo: { not: null } },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: produtoSelect,
  })
  return rows.filter((p) => p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo)
})

/**
 * Confirma o pagamento de uma venda do bar (baixa via webhook Pix ou manual).
 * Espelha `baixarCobrancaComoPaga`: cria a RECEITA no livro-caixa dentro de
 * transação, idempotente via `financeiroLancamentoId`.
 *
 * IMPORTANTE: NÃO mexe em estoque — a baixa de estoque acontece no momento de
 * registrar a venda (PENDENTE já decrementa). Aqui só criamos a receita e
 * marcamos a venda como PAGA.
 */
export async function confirmarVendaBarPaga(input: {
  tenantId: string
  vendaId: string
  atorId?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  type Row = {
    id: string
    status: StatusVendaBar
    total: Prisma.Decimal
    financeiroLancamentoId: string | null
    operadorId: string
  }
  const venda: Row | null = await db.barVenda.findFirst({
    where: { id: input.vendaId, tenantId: input.tenantId },
    select: {
      id: true,
      status: true,
      total: true,
      financeiroLancamentoId: true,
      operadorId: true,
    },
  })
  if (!venda) return { ok: false, error: 'Venda não encontrada' }
  if (venda.status === 'PAGA') return { ok: true }
  if (venda.status === 'CANCELADA') return { ok: false, error: 'Venda cancelada' }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    let lancamentoId = venda.financeiroLancamentoId
    if (!lancamentoId) {
      const lanc = await tx.financeiroLancamento.create({
        data: {
          tenantId: input.tenantId,
          tipo: 'RECEITA',
          categoria: 'BAR',
          valor: venda.total,
          descricao: 'Venda do bar',
          data: new Date(),
          observacao: `Pagamento PIX — venda ${venda.id}`,
          criadoPorId: input.atorId ?? venda.operadorId,
        },
        select: { id: true },
      })
      lancamentoId = lanc.id
    }

    await tx.barVenda.update({
      where: { id: venda.id },
      data: {
        status: 'PAGA',
        pagoEm: new Date(),
        financeiroLancamentoId: lancamentoId,
      },
    })
  })

  return { ok: true }
}
