import { db } from '@torcida/db'
import type { ConfiancaRecomendacao, StatusAlianca } from '@torcida/db'

/** @deprecated Prefer findAliancaEntreTenants — pares de aliança não são canônicos por UUID. */
export function normalizeTenantPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export interface AliancaListItem {
  id: string
  tenantOrigemId: string
  tenantAliadoId: string
  status: StatusAlianca
  propostaPorId: string
  confirmadaPorId: string | null
  confirmadaEm: Date | null
  criadoEm: Date
  tenantOrigem: { id: string; nome: string; slug: string }
  tenantAliado: { id: string; nome: string; slug: string }
  propostaPor: { id: string; nome: string | null; email: string | null }
}

interface AliancaPairRow {
  id: string
  tenantOrigemId: string
  tenantAliadoId: string
  status: StatusAlianca
  propostaPorId: string
  confirmadaPorId: string | null
  confirmadaEm: Date | null
}

/**
 * Busca aliança entre dois tenants em qualquer direção
 * (origem↔aliado não é canônico por UUID).
 */
export async function findAliancaEntreTenants(
  tenantAId: string,
  tenantBId: string,
): Promise<AliancaPairRow | null> {
  const alianca: AliancaPairRow | null = await db.alianca.findFirst({
    where: {
      OR: [
        { tenantOrigemId: tenantAId, tenantAliadoId: tenantBId },
        { tenantOrigemId: tenantBId, tenantAliadoId: tenantAId },
      ],
    },
    select: {
      id: true,
      tenantOrigemId: true,
      tenantAliadoId: true,
      status: true,
      propostaPorId: true,
      confirmadaPorId: true,
      confirmadaEm: true,
    },
  })
  return alianca
}

export async function listAliancasForTenant(tenantId: string): Promise<AliancaListItem[]> {
  const aliancas: AliancaListItem[] = await db.alianca.findMany({
    where: {
      OR: [{ tenantOrigemId: tenantId }, { tenantAliadoId: tenantId }],
    },
    orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
    select: {
      id: true,
      tenantOrigemId: true,
      tenantAliadoId: true,
      status: true,
      propostaPorId: true,
      confirmadaPorId: true,
      confirmadaEm: true,
      criadoEm: true,
      tenantOrigem: { select: { id: true, nome: true, slug: true } },
      tenantAliado: { select: { id: true, nome: true, slug: true } },
      propostaPor: { select: { id: true, nome: true, email: true } },
    },
  })

  return aliancas
}

export interface RecomendacaoAliancaListItem {
  id: string
  tenantId: string
  tenantSugeridoId: string | null
  tenantSugeridoSlug: string | null
  tenantSugeridoNome: string
  nomeSugerido: string
  confianca: ConfiancaRecomendacao
  fonte: string
  observacao: string | null
  criadoEm: Date
  /** Só ALTA com tenant mapeado pode virar proposta automática. */
  podePropor: boolean
}

interface RecomendacaoAliancaRow {
  id: string
  tenantId: string
  tenantSugeridoId: string | null
  nomeSugerido: string
  confianca: ConfiancaRecomendacao
  fonte: string
  observacao: string | null
  criadoEm: Date
}

interface TenantSugestaoRow {
  id: string
  nome: string
  slug: string
}

const CONFIANCA_ORDEM: Record<ConfiancaRecomendacao, number> = {
  ALTA: 0,
  MEDIA: 1,
  BAIXA: 2,
}

export function confiancaRank(confianca: ConfiancaRecomendacao): number {
  return CONFIANCA_ORDEM[confianca] ?? 99
}

/**
 * Filtra recomendações: omite quem já tem ATIVA/PENDENTE com o tenant
 * e ordena por confiança (ALTA → MEDIA → BAIXA).
 */
export function filterAndSortRecomendacoes(
  recomendacoes: RecomendacaoAliancaListItem[],
  blockedTenantIds: Set<string>,
): RecomendacaoAliancaListItem[] {
  return recomendacoes
    .filter((item: RecomendacaoAliancaListItem) => {
      if (item.tenantSugeridoId && blockedTenantIds.has(item.tenantSugeridoId)) return false
      return true
    })
    .sort((a: RecomendacaoAliancaListItem, b: RecomendacaoAliancaListItem) => {
      const rankDiff = confiancaRank(a.confianca) - confiancaRank(b.confianca)
      if (rankDiff !== 0) return rankDiff
      return b.criadoEm.getTime() - a.criadoEm.getTime()
    })
}

function counterpartTenantId(alianca: { tenantOrigemId: string; tenantAliadoId: string }, tenantId: string): string {
  return alianca.tenantOrigemId === tenantId ? alianca.tenantAliadoId : alianca.tenantOrigemId
}

export async function listRecomendacoesForTenant(
  tenantId: string,
): Promise<RecomendacaoAliancaListItem[]> {
  const [recomendacoes, aliancasAtivasOuPendentes]: [
    RecomendacaoAliancaRow[],
    { tenantOrigemId: string; tenantAliadoId: string }[],
  ] = await Promise.all([
    db.recomendacaoAlianca.findMany({
      where: { tenantId },
      orderBy: [{ criadoEm: 'desc' }],
      select: {
        id: true,
        tenantId: true,
        tenantSugeridoId: true,
        nomeSugerido: true,
        confianca: true,
        fonte: true,
        observacao: true,
        criadoEm: true,
      },
    }),
    db.alianca.findMany({
      where: {
        status: { in: ['ATIVA', 'PENDENTE'] },
        OR: [{ tenantOrigemId: tenantId }, { tenantAliadoId: tenantId }],
      },
      select: { tenantOrigemId: true, tenantAliadoId: true },
    }),
  ])

  const blockedTenantIds = new Set(
    aliancasAtivasOuPendentes.map((a) => counterpartTenantId(a, tenantId)),
  )

  const suggestedIds = recomendacoes
    .map((item: RecomendacaoAliancaRow) => item.tenantSugeridoId)
    .filter((id: string | null): id is string => Boolean(id))

  const unresolvedNames = recomendacoes
    .filter((item: RecomendacaoAliancaRow) => !item.tenantSugeridoId)
    .map((item: RecomendacaoAliancaRow) => item.nomeSugerido)

  const tenantsById = new Map<string, TenantSugestaoRow>()
  const tenantsByNome = new Map<string, TenantSugestaoRow>()

  if (suggestedIds.length > 0 || unresolvedNames.length > 0) {
    const orFilters: Array<{ id?: { in: string[] }; nome?: { in: string[]; mode: 'insensitive' } }> = []
    if (suggestedIds.length > 0) orFilters.push({ id: { in: suggestedIds } })
    if (unresolvedNames.length > 0) {
      orFilters.push({ nome: { in: unresolvedNames, mode: 'insensitive' } })
    }

    const tenants: TenantSugestaoRow[] = await db.tenant.findMany({
      where: {
        ativo: true,
        OR: orFilters,
      },
      select: { id: true, nome: true, slug: true },
    })
    for (const tenant of tenants) {
      tenantsById.set(tenant.id, tenant)
      tenantsByNome.set(tenant.nome.toLowerCase(), tenant)
    }
  }

  const mapped: RecomendacaoAliancaListItem[] = recomendacoes.map((item: RecomendacaoAliancaRow) => {
    const suggested =
      (item.tenantSugeridoId ? tenantsById.get(item.tenantSugeridoId) : null) ??
      tenantsByNome.get(item.nomeSugerido.toLowerCase()) ??
      null
    const tenantSugeridoId = suggested?.id ?? item.tenantSugeridoId
    const confianca = item.confianca
    return {
      id: item.id,
      tenantId: item.tenantId,
      tenantSugeridoId,
      tenantSugeridoSlug: suggested?.slug ?? null,
      tenantSugeridoNome: suggested?.nome ?? item.nomeSugerido,
      nomeSugerido: item.nomeSugerido,
      confianca,
      fonte: item.fonte,
      observacao: item.observacao,
      criadoEm: item.criadoEm,
      podePropor: confianca === 'ALTA' && Boolean(tenantSugeridoId),
    }
  })

  return filterAndSortRecomendacoes(mapped, blockedTenantIds)
}
