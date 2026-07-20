import { cache } from 'react'
import { db } from '@torcida/db'

/**
 * Loaders READ-ONLY do drill-down R1 do Presidente sobre uma unidade
 * descendente (`/admin/torcida/unidade/[tenantId]`) — módulos Bar e Membros.
 * Todos consultam o tenant da própria unidade. Membros NUNCA expõe PII
 * (RG/CPF/filiação/endereço) no modo cross-tenant (decisão LGE — rbac).
 */

export interface BarVendaUnidadeItem {
  id: string
  total: number
  status: string
  metodoPagamento: string
  criadoEm: Date
  unidadeNome: string
  operadorNome: string | null
}

export interface ResumoBarUnidade {
  totalVendido: number
  qtdVendas: number
  recentes: BarVendaUnidadeItem[]
}

export const resumoBarDaUnidade = cache(async function resumoBarDaUnidade(
  tenantId: string,
): Promise<ResumoBarUnidade> {
  const [agg, recentes]: [
    { _sum: { total: unknown }; _count: { _all: number } },
    Array<{
      id: string
      total: unknown
      status: string
      metodoPagamento: string
      criadoEm: Date
      sede: { nome: string }
      operador: { nome: string | null }
    }>,
  ] = await Promise.all([
    db.barVenda.aggregate({
      where: { tenantId, status: 'PAGA' },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.barVenda.findMany({
      where: { tenantId },
      orderBy: { criadoEm: 'desc' },
      take: 10,
      select: {
        id: true,
        total: true,
        status: true,
        metodoPagamento: true,
        criadoEm: true,
        sede: { select: { nome: true } },
        operador: { select: { nome: true } },
      },
    }),
  ])

  return {
    totalVendido: agg._sum.total ? Number(agg._sum.total) : 0,
    qtdVendas: agg._count._all,
    recentes: recentes.map((r) => ({
      id: r.id,
      total: Number(r.total),
      status: r.status,
      metodoPagamento: r.metodoPagamento,
      criadoEm: r.criadoEm,
      unidadeNome: r.sede.nome,
      operadorNome: r.operador.nome,
    })),
  }
})

export interface MembroUnidadeItem {
  id: string
  nome: string
  tipo: string
  status: string
  cidade: string | null
  numeroAssociado: string | null
}

export const listarMembrosDaUnidade = cache(async function listarMembrosDaUnidade(
  tenantId: string,
  limite = 40,
): Promise<{ itens: MembroUnidadeItem[]; total: number }> {
  // PII (rg/cpf/filiacao/endereço/dataNascimento) NUNCA entra no select do
  // drill-down cross-tenant — só campos de gestão (LGE).
  const [total, itens]: [number, MembroUnidadeItem[]] = await Promise.all([
    db.saasMembro.count({ where: { tenantId } }),
    db.saasMembro.findMany({
      where: { tenantId },
      orderBy: { criadoEm: 'desc' },
      take: limite,
      select: {
        id: true,
        nome: true,
        tipo: true,
        status: true,
        cidade: true,
        numeroAssociado: true,
      },
    }),
  ])
  return { itens, total }
})
