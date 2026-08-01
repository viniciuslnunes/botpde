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

export interface PostUnidadeItem {
  id: string
  conteudo: string
  autorNome: string | null
  criadoEm: Date
  oculto: boolean
  visibilidade: string
  totalComentarios: number
  totalReacoes: number
}

/**
 * R5 — leitura da comunidade da unidade pelo Presidente/Vice da Sede. É o
 * caminho de monitoramento quando a unidade fecha o canal: em vez de injetar a
 * unidade restrita no feed pessoal do Presidente (que vazaria para o cache
 * compartilhado da Sede), o conteúdo é lido aqui, sob o gate explícito
 * `assertPresidentePodeLerUnidade`.
 *
 * Somente leitura por construção: nenhuma ação de engajamento é exposta, e o
 * select não traz nada além do necessário para acompanhar o mural.
 */
export const listarPostsDaUnidade = cache(async function listarPostsDaUnidade(
  tenantId: string,
  limite = 30,
): Promise<{ itens: PostUnidadeItem[]; total: number }> {
  const [total, posts]: [
    number,
    Array<{
      id: string
      conteudo: string
      criadoEm: Date
      oculto: boolean
      visibilidade: string
      autor: { nome: string | null } | null
      _count: { comentarios: number; reacoes: number }
    }>,
  ] = await Promise.all([
    db.post.count({ where: { tenantId } }),
    db.post.findMany({
      where: { tenantId },
      orderBy: { criadoEm: 'desc' },
      take: limite,
      select: {
        id: true,
        conteudo: true,
        criadoEm: true,
        oculto: true,
        visibilidade: true,
        autor: { select: { nome: true } },
        _count: { select: { comentarios: true, reacoes: true } },
      },
    }),
  ])

  return {
    total,
    itens: posts.map((p) => ({
      id: p.id,
      conteudo: p.conteudo,
      autorNome: p.autor?.nome ?? null,
      criadoEm: p.criadoEm,
      oculto: p.oculto,
      visibilidade: p.visibilidade,
      totalComentarios: p._count.comentarios,
      totalReacoes: p._count.reacoes,
    })),
  }
})
