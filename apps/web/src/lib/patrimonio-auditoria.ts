import { cache } from 'react'
import { db, Prisma } from '@torcida/db'
import type { CategoriaPatrimonioItem } from '@torcida/db'
import { CATEGORIA_PATRIMONIO_LABEL } from '@torcida/types'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { labelAcaoAuditoria } from '@/lib/audit-labels'
import type { EscopoCategoria } from '@/lib/patrimonio'

export const ACOES_AUDITORIA_INVENTARIO = [
  'PATRIMONIO_ITEM_BAIXADO',
  'PATRIMONIO_ITEM_EXCLUIDO',
] as const

export type AcaoAuditoriaInventario = (typeof ACOES_AUDITORIA_INVENTARIO)[number]

export const PATRIMONIO_AUDITORIA_PAGE_SIZE = 80

export type PatrimonioAuditoriaEntrada = {
  id: string
  acao: AcaoAuditoriaInventario
  acaoLabel: string
  nome: string
  categoria: string | null
  categoriaLabel: string | null
  statusAnterior: string | null
  quantidade: number | null
  localizacao: string | null
  quando: Date
  quandoLabel: string
  atorNome: string
  atorEmail: string | null
}

type DetalhesInventario = {
  nome?: unknown
  categoria?: unknown
  status?: unknown
  quantidade?: unknown
  localizacao?: unknown
}

export function lerDetalhesInventario(raw: unknown): DetalhesInventario {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as DetalhesInventario
}

export function categoriaDoEventoInventario(
  detalhes: unknown,
  itemCategoria?: string | null,
): string | null {
  const d = lerDetalhesInventario(detalhes)
  if (typeof d.categoria === 'string' && d.categoria) return d.categoria
  if (itemCategoria) return itemCategoria
  return null
}

export function eventoInventarioNoEscopo(
  categoria: string | null,
  escopo: EscopoCategoria,
): boolean {
  if (!escopo) return true
  return categoria === escopo
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor.trim()) {
    const n = Number(valor)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function montarEntrada(
  row: {
    id: string
    acao: string
    detalhes: unknown
    criadoEm: Date
    ator: { nome: string | null; email: string | null } | null
  },
  itemCategoria: string | null,
): PatrimonioAuditoriaEntrada | null {
  if (row.acao !== 'PATRIMONIO_ITEM_BAIXADO' && row.acao !== 'PATRIMONIO_ITEM_EXCLUIDO') {
    return null
  }
  const d = lerDetalhesInventario(row.detalhes)
  const categoria = categoriaDoEventoInventario(d, itemCategoria)
  const nome = texto(d.nome) ?? 'Item sem nome'
  return {
    id: row.id,
    acao: row.acao,
    acaoLabel: labelAcaoAuditoria(row.acao),
    nome,
    categoria,
    categoriaLabel: categoria
      ? (CATEGORIA_PATRIMONIO_LABEL[categoria as CategoriaPatrimonioItem] ?? categoria)
      : null,
    statusAnterior: texto(d.status),
    quantidade: numero(d.quantidade),
    localizacao: texto(d.localizacao),
    quando: row.criadoEm,
    quandoLabel: formatDateTimeShort(row.criadoEm),
    atorNome: row.ator?.nome?.trim() || row.ator?.email || 'Sistema / desconhecido',
    atorEmail: row.ator?.email ?? null,
  }
}

export const listarAuditoriaInventario = cache(async function listarAuditoriaInventario(
  tenantId: string,
  escopoCategoria: EscopoCategoria = null,
  limite = PATRIMONIO_AUDITORIA_PAGE_SIZE,
): Promise<PatrimonioAuditoriaEntrada[]> {
  const rows: Array<{
    id: string
    acao: string
    entidadeId: string | null
    detalhes: Prisma.JsonValue
    criadoEm: Date
    ator: { nome: string | null; email: string | null } | null
  }> = await db.auditLog.findMany({
    where: {
      tenantId,
      entidade: 'PatrimonioItem',
      acao: { in: [...ACOES_AUDITORIA_INVENTARIO] },
    },
    orderBy: { criadoEm: 'desc' },
    take: Math.max(limite * 3, limite),
    select: {
      id: true,
      acao: true,
      entidadeId: true,
      detalhes: true,
      criadoEm: true,
      ator: { select: { nome: true, email: true } },
    },
  })

  const idsBaixa = rows
    .filter((r) => r.acao === 'PATRIMONIO_ITEM_BAIXADO' && r.entidadeId)
    .map((r) => r.entidadeId as string)
  const itens: Array<{ id: string; categoria: CategoriaPatrimonioItem }> =
    idsBaixa.length > 0
      ? await db.patrimonioItem.findMany({
          where: { tenantId, id: { in: idsBaixa } },
          select: { id: true, categoria: true },
        })
      : []
  const categoriaPorItem = new Map(itens.map((i) => [i.id, i.categoria]))

  const saida: PatrimonioAuditoriaEntrada[] = []
  for (const row of rows) {
    const entrada = montarEntrada(
      row,
      row.entidadeId ? (categoriaPorItem.get(row.entidadeId) ?? null) : null,
    )
    if (!entrada) continue
    if (!eventoInventarioNoEscopo(entrada.categoria, escopoCategoria)) continue
    saida.push(entrada)
    if (saida.length >= limite) break
  }
  return saida
})
