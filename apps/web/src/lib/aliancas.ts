import { db } from '@torcida/db'
import type { ConfiancaRecomendacao, StatusAlianca } from '@torcida/db'

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

export async function listRecomendacoesForTenant(
  tenantId: string,
): Promise<RecomendacaoAliancaListItem[]> {
  const recomendacoes: RecomendacaoAliancaRow[] = await db.recomendacaoAlianca.findMany({
    where: { tenantId },
    orderBy: [{ confianca: 'asc' }, { criadoEm: 'desc' }],
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
  })

  const suggestedIds = recomendacoes
    .map((item: RecomendacaoAliancaRow) => item.tenantSugeridoId)
    .filter((id: string | null): id is string => Boolean(id))

  const tenantsById = new Map<string, TenantSugestaoRow>()
  if (suggestedIds.length > 0) {
    const tenants: TenantSugestaoRow[] = await db.tenant.findMany({
      where: {
        id: { in: suggestedIds },
        ativo: true,
      },
      select: { id: true, nome: true, slug: true },
    })
    for (const tenant of tenants) tenantsById.set(tenant.id, tenant)
  }

  return recomendacoes.map((item: RecomendacaoAliancaRow) => {
    const suggested = item.tenantSugeridoId ? tenantsById.get(item.tenantSugeridoId) : null
    return {
      id: item.id,
      tenantId: item.tenantId,
      tenantSugeridoId: item.tenantSugeridoId,
      tenantSugeridoSlug: suggested?.slug ?? null,
      tenantSugeridoNome: suggested?.nome ?? item.nomeSugerido,
      nomeSugerido: item.nomeSugerido,
      confianca: item.confianca,
      fonte: item.fonte,
      observacao: item.observacao,
      criadoEm: item.criadoEm,
    }
  })
}
