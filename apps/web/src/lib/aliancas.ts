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

/** ALIADA = bloco/bilateral entre times distintos; CO_IRMA = mesma afiliação. */
export type RecomendacaoTipo = 'ALIADA' | 'CO_IRMA'

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
  tipo: RecomendacaoTipo
  /** Só ALTA de tipo ALIADA com tenant mapeado vira proposta automática. */
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

function tipoRank(tipo: RecomendacaoTipo): number {
  return tipo === 'CO_IRMA' ? 0 : 1
}

/**
 * Filtra recomendações: omite quem já tem ATIVA/PENDENTE com o tenant
 * e ordena co-irmãs → ALTA → MEDIA → BAIXA.
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
      const tipoDiff = tipoRank(a.tipo) - tipoRank(b.tipo)
      if (tipoDiff !== 0) return tipoDiff
      const rankDiff = confiancaRank(a.confianca) - confiancaRank(b.confianca)
      if (rankDiff !== 0) return rankDiff
      return b.criadoEm.getTime() - a.criadoEm.getTime()
    })
}

function counterpartTenantId(alianca: { tenantOrigemId: string; tenantAliadoId: string }, tenantId: string): string {
  return alianca.tenantOrigemId === tenantId ? alianca.tenantAliadoId : alianca.tenantOrigemId
}

/**
 * Outras organizadas ativas do mesmo time (Afiliacao) — co-irmãs, não aliadas.
 */
export function buildCoIrmaRecomendacoes(
  tenantId: string,
  coirmas: Array<{ id: string; nome: string; slug: string; afiliacaoNome: string | null }>,
  agora: Date = new Date(),
): RecomendacaoAliancaListItem[] {
  return coirmas.map((c) => {
    const clube = c.afiliacaoNome ?? 'mesmo time'
    return {
      id: `co-irma:${tenantId}:${c.id}`,
      tenantId,
      tenantSugeridoId: c.id,
      tenantSugeridoSlug: c.slug,
      tenantSugeridoNome: c.nome,
      nomeSugerido: c.nome,
      confianca: 'ALTA' as const,
      fonte: `Mesmo time (${clube})`,
      observacao: null,
      criadoEm: agora,
      tipo: 'CO_IRMA' as const,
      podePropor: false,
    }
  })
}

export async function listRecomendacoesForTenant(
  tenantId: string,
): Promise<RecomendacaoAliancaListItem[]> {
  const [recomendacoes, aliancasAtivasOuPendentes, me]: [
    RecomendacaoAliancaRow[],
    { tenantOrigemId: string; tenantAliadoId: string }[],
    { id: string; afiliacaoId: string | null } | null,
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
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, afiliacaoId: true },
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
        sintetico: false,
        OR: orFilters,
      },
      select: { id: true, nome: true, slug: true },
    })
    for (const tenant of tenants) {
      tenantsById.set(tenant.id, tenant)
      tenantsByNome.set(tenant.nome.toLowerCase(), tenant)
    }
  }

  /** Omitir da lista de aliadas quem é co-irmã (mesmo clube). */
  const sameClubIds = new Set<string>()

  let coIrmaItems: RecomendacaoAliancaListItem[] = []
  if (me?.afiliacaoId) {
    const coirmas: Array<{
      id: string
      nome: string
      slug: string
      afiliacao: { nome: string } | null
    }> = await db.tenant.findMany({
      where: {
        ativo: true,
        sintetico: false,
        afiliacaoId: me.afiliacaoId,
        id: { not: tenantId },
      },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        slug: true,
        afiliacao: { select: { nome: true } },
      },
    })
    for (const c of coirmas) sameClubIds.add(c.id)
    coIrmaItems = buildCoIrmaRecomendacoes(
      tenantId,
      coirmas.map((c) => ({
        id: c.id,
        nome: c.nome,
        slug: c.slug,
        afiliacaoNome: c.afiliacao?.nome ?? null,
      })),
    )
  }

  const mapped: RecomendacaoAliancaListItem[] = recomendacoes
    .map((item: RecomendacaoAliancaRow) => {
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
        tipo: 'ALIADA' as const,
        podePropor: confianca === 'ALTA' && Boolean(tenantSugeridoId),
      }
    })
    .filter((item: RecomendacaoAliancaListItem) => {
      // Seed legado / erro: não mostrar “aliada” quem é do mesmo clube.
      if (item.tenantSugeridoId && sameClubIds.has(item.tenantSugeridoId)) return false
      return true
    })

  return filterAndSortRecomendacoes([...coIrmaItems, ...mapped], blockedTenantIds)
}
