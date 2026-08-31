import { db } from '@torcida/db'
import type { ConfiancaRecomendacao, StatusAlianca } from '@torcida/db'
import { formatNomeAfiliacao, formatNomeTorcida } from '@torcida/types'
import { getTorcidaLineageTenantIds, carregarIdsRivaisDe } from '@/lib/hierarquia'
import { filtrarTenantsRestritos } from '@/lib/isolamento'

/** @deprecated Prefer findAliancaEntreTenants — pares de aliança não são canônicos por UUID. */
export function normalizeTenantPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export interface AliancaTenantLite {
  id: string
  nome: string
  slug: string
  logoUrl: string | null
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
  tenantOrigem: AliancaTenantLite
  tenantAliado: AliancaTenantLite
  propostaPor: { id: string; nome: string | null; email: string | null }
}

interface TenantLogoRow {
  id: string
  nome: string
  slug: string
  logoUrl: string | null
  torcidaConhecida: { logoUrl: string | null } | null
}

function resolveTenantLogoUrl(tenant: TenantLogoRow): string | null {
  return tenant.torcidaConhecida?.logoUrl ?? tenant.logoUrl
}

function toAliancaTenantLite(tenant: TenantLogoRow): AliancaTenantLite {
  return {
    id: tenant.id,
    nome: formatNomeTorcida(tenant.nome),
    slug: tenant.slug,
    logoUrl: resolveTenantLogoUrl(tenant),
  }
}

const TENANT_LITE_SELECT = {
  id: true,
  nome: true,
  slug: true,
  logoUrl: true,
  torcidaConhecida: { select: { logoUrl: true } },
} as const

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

function counterpartTenantId(alianca: { tenantOrigemId: string; tenantAliadoId: string }, tenantId: string): string {
  return alianca.tenantOrigemId === tenantId ? alianca.tenantAliadoId : alianca.tenantOrigemId
}

export async function listAliancasForTenant(tenantId: string): Promise<AliancaListItem[]> {
  const aliancas: Array<{
    id: string
    tenantOrigemId: string
    tenantAliadoId: string
    status: StatusAlianca
    propostaPorId: string
    confirmadaPorId: string | null
    confirmadaEm: Date | null
    criadoEm: Date
    tenantOrigem: TenantLogoRow
    tenantAliado: TenantLogoRow
    propostaPor: { id: string; nome: string | null; email: string | null }
  }> = await db.alianca.findMany({
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
      tenantOrigem: { select: TENANT_LITE_SELECT },
      tenantAliado: { select: TENANT_LITE_SELECT },
      propostaPor: { select: { id: true, nome: true, email: true } },
    },
  })

  const rivalIds = await carregarIdsRivaisDe(
    tenantId,
    aliancas.map((a) => counterpartTenantId(a, tenantId)),
  )

  return aliancas
    .filter((item) => {
      const outro = counterpartTenantId(item, tenantId)
      // ATIVA sobrevive (aliança vence rivalidade de clube). PENDENTE/ENCERRADA
      // de rival não podem anunciar a existência da outra torcida.
      if (rivalIds.has(outro) && item.status !== 'ATIVA') return false
      return true
    })
    .map((item) => ({
      ...item,
      tenantOrigem: toAliancaTenantLite(item.tenantOrigem),
      tenantAliado: toAliancaTenantLite(item.tenantAliado),
    }))
}

/** ALIADA = bloco/bilateral entre times distintos; CO_IRMA = mesma afiliação. */
export type RecomendacaoTipo = 'ALIADA' | 'CO_IRMA'

export interface RecomendacaoAliancaListItem {
  id: string
  tenantId: string
  tenantSugeridoId: string | null
  tenantSugeridoSlug: string | null
  tenantSugeridoNome: string
  tenantSugeridoLogoUrl: string | null
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
  logoUrl: string | null
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

/**
 * Outras organizadas ativas do mesmo time (Afiliacao) — co-irmãs, não aliadas.
 */
export function buildCoIrmaRecomendacoes(
  tenantId: string,
  coirmas: Array<{
    id: string
    nome: string
    slug: string
    afiliacaoNome: string | null
    logoUrl: string | null
  }>,
  agora: Date = new Date(),
): RecomendacaoAliancaListItem[] {
  return coirmas.map((c) => {
    const nome = formatNomeTorcida(c.nome)
    const clube = c.afiliacaoNome ? formatNomeAfiliacao(c.afiliacaoNome) : 'mesmo time'
    return {
      id: `co-irma:${tenantId}:${c.id}`,
      tenantId,
      tenantSugeridoId: c.id,
      tenantSugeridoSlug: c.slug,
      tenantSugeridoNome: nome,
      tenantSugeridoLogoUrl: c.logoUrl,
      nomeSugerido: nome,
      confianca: 'ALTA' as const,
      fonte: `Mesmo time (${clube})`,
      observacao: null,
      criadoEm: agora,
      tipo: 'CO_IRMA' as const,
      podePropor: false,
    }
  })
}

interface SedeAncoraRow {
  tenantId: string | null
  sede: { tenantId: string | null } | null
}

/**
 * Quais desses tenants são UNIDADE de outra torcida (Caso B: subsede/PDE
 * promovido a tenant próprio) — e portanto não são parte de aliança.
 *
 * `promoverSede` copia o `afiliacaoId` da mãe para o tenant novo, então a
 * unidade cai em toda query por clube e apareceria como "co-irmã". Aliança é
 * vínculo entre TORCIDAS (raiz da worktree); unidade herda o vínculo da sede.
 *
 * Detecção: alguma Sede do tenant pendurada numa Sede de OUTRO tenant — a
 * âncora que `promoverSede` deixa. Sedes internas (subsede/PDE no mesmo
 * tenant) apontam para uma Sede do próprio tenant e não contam.
 */
export function unidadesEntreTenants(sedes: SedeAncoraRow[]): Set<string> {
  const unidades = new Set<string>()
  for (const sede of sedes) {
    const paiTenantId = sede.sede?.tenantId ?? null
    if (sede.tenantId && paiTenantId && paiTenantId !== sede.tenantId) {
      unidades.add(sede.tenantId)
    }
  }
  return unidades
}

/** Candidatos elegíveis a aliança/co-irmã: nem unidade, nem da própria worktree, nem rival. */
export function filtrarTorcidasElegiveis<T extends { id: string }>(
  candidatos: T[],
  unidadeIds: Set<string>,
  linhagemIds: Set<string>,
  rivalIds: Set<string> = new Set(),
): T[] {
  return candidatos.filter(
    (c: T) => !unidadeIds.has(c.id) && !linhagemIds.has(c.id) && !rivalIds.has(c.id),
  )
}

async function carregarUnidadeIds(tenantIds: string[]): Promise<Set<string>> {
  if (tenantIds.length === 0) return new Set()

  const sedes: SedeAncoraRow[] = await db.sede.findMany({
    where: { tenantId: { in: tenantIds }, sedeId: { not: null } },
    select: { tenantId: true, sede: { select: { tenantId: true } } },
  })
  return unidadesEntreTenants(sedes)
}

/**
 * Remove da lista quem não pode ser parte de uma aliança vista por `tenantId`:
 * unidades promovidas (Caso B), a própria worktree, rivais e canal restrito.
 * Rival some como se não existisse — nunca serializar nome/logo/slug ao client.
 */
export async function filtrarTenantsDeAlianca<T extends { id: string }>(
  tenantId: string,
  candidatos: T[],
): Promise<T[]> {
  if (candidatos.length === 0) return []

  const ids = candidatos.map((c: T) => c.id)
  const [unidadeIds, linhagem, rivalIds, visiveis]: [Set<string>, string[], Set<string>, string[]] =
    await Promise.all([
      carregarUnidadeIds(ids),
      getTorcidaLineageTenantIds(tenantId),
      carregarIdsRivaisDe(tenantId, ids),
      filtrarTenantsRestritos(ids, tenantId),
    ])
  const visiveisSet = new Set(visiveis)
  return filtrarTorcidasElegiveis(candidatos, unidadeIds, new Set(linhagem), rivalIds).filter(
    (c: T) => visiveisSet.has(c.id),
  )
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

    const tenants: TenantLogoRow[] = await db.tenant.findMany({
      where: {
        ativo: true,
        sintetico: false,
        OR: orFilters,
      },
      select: TENANT_LITE_SELECT,
    })
    for (const tenant of tenants) {
      const lite = toAliancaTenantLite(tenant)
      tenantsById.set(tenant.id, lite)
      tenantsByNome.set(tenant.nome.toLowerCase(), lite)
    }
  }

  type CoIrmaRow = TenantLogoRow & { afiliacao: { nome: string } | null }

  let coirmasRaw: CoIrmaRow[] = []
  if (me?.afiliacaoId) {
    coirmasRaw = await db.tenant.findMany({
      where: {
        ativo: true,
        sintetico: false,
        afiliacaoId: me.afiliacaoId,
        id: { not: tenantId },
      },
      orderBy: { nome: 'asc' },
      select: {
        ...TENANT_LITE_SELECT,
        afiliacao: { select: { nome: true } },
      },
    })
  }

  // O `where` acima só sabe de clube: unidade promovida (Caso B) herda o
  // `afiliacaoId` da mãe e entraria como "co-irmã", assim como as unidades da
  // própria worktree. Aliança é vínculo entre torcidas — unidade herda o da
  // sede. Uma consulta cobre co-irmãs e sugestões mapeadas.
  const [unidadeIds, linhagem, rivalIds]: [Set<string>, string[], Set<string>] = await Promise.all([
    carregarUnidadeIds(
      Array.from(new Set([...coirmasRaw.map((c: CoIrmaRow) => c.id), ...tenantsById.keys()])),
    ),
    getTorcidaLineageTenantIds(tenantId),
    carregarIdsRivaisDe(tenantId, Array.from(tenantsById.keys())),
  ])
  const linhagemIds = new Set(linhagem)

  const coirmas: CoIrmaRow[] = filtrarTorcidasElegiveis(coirmasRaw, unidadeIds, linhagemIds)

  /** Omitir da lista de aliadas quem é co-irmã (mesmo clube). */
  const sameClubIds = new Set<string>(coirmas.map((c: CoIrmaRow) => c.id))

  const coIrmaItems: RecomendacaoAliancaListItem[] = buildCoIrmaRecomendacoes(
    tenantId,
    coirmas.map((c: CoIrmaRow) => ({
      id: c.id,
      nome: c.nome,
      slug: c.slug,
      afiliacaoNome: c.afiliacao?.nome ?? null,
      logoUrl: resolveTenantLogoUrl(c),
    })),
  )

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
        tenantSugeridoNome: formatNomeTorcida(suggested?.nome ?? item.nomeSugerido),
        tenantSugeridoLogoUrl: suggested?.logoUrl ?? null,
        nomeSugerido: formatNomeTorcida(item.nomeSugerido),
        confianca,
        fonte: item.fonte,
        observacao: item.observacao,
        criadoEm: item.criadoEm,
        tipo: 'ALIADA' as const,
        podePropor: confianca === 'ALTA' && Boolean(tenantSugeridoId),
      }
    })
    .filter((item: RecomendacaoAliancaListItem) => {
      if (!item.tenantSugeridoId) return true
      // Seed legado / erro: não mostrar “aliada” quem é do mesmo clube.
      if (sameClubIds.has(item.tenantSugeridoId)) return false
      // Nem unidade de outra torcida, nem a própria worktree, nem rival.
      if (unidadeIds.has(item.tenantSugeridoId)) return false
      if (linhagemIds.has(item.tenantSugeridoId)) return false
      if (rivalIds.has(item.tenantSugeridoId)) return false
      return true
    })

  return filterAndSortRecomendacoes([...coIrmaItems, ...mapped], blockedTenantIds)
}
