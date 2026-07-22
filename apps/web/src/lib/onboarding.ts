import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db, saoMesmoClube, indiceAfiliacaoCanonica, withDbRetry } from '@torcida/db'
import { torcidaAcessivelNoHost } from '@/lib/tenant'
import {
  calcularStatsClubesOnboarding,
  tetoLimiteDeStatsMap,
  type StatsClubeOnboarding,
} from '@/lib/onboarding-clube-stats'
import {
  calcularStatsTorcidasOnboarding,
  type StatsTorcidaOnboarding,
} from '@/lib/onboarding-torcida-stats'
import { TOOLTIP_ESTIMATIVA_INDISPONIVEL } from '@/lib/format-contagem'
import { formatNomeTorcida, isDepartamentoLegado } from '@torcida/types'

export type { StatsClubeOnboarding, StatsTorcidaOnboarding }

export type SerieCampeonato = 'A' | 'B' | 'C' | 'D' | 'ESTADUAL' | 'OUTRA'

/** Estados brasileiros (siglas) usados no onboarding e na validação de região. */
export const UFS_BRASIL: string[] = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const STATS_VAZIAS: StatsClubeOnboarding = {
  sociosTotal: 0,
  sociosOnline: 0,
  torcedoresTotal: 0,
  torcedoresOnline: 0,
}

/** Preferência dado real da plataforma sobre teto LIMITE_ATE genérico no card. */
function aplicarEstimativaRealNoCard(
  row: {
    torcedoresEstimados: number | null
    torcedoresEstimadosFonte: string | null
    torcedoresEstimadosTipo: TorcedoresEstimadosTipo | null
  },
  stats: StatsClubeOnboarding,
  tetoLimiteGlobal: number,
): {
  torcedoresEstimados: number | null
  torcedoresEstimadosFonte: string | null
  torcedoresEstimadosTipo: TorcedoresEstimadosTipo | null
} {
  if (row.torcedoresEstimadosTipo === 'IBOPE_DIGITAL') return row

  const realPlataforma =
    stats.torcedoresTotal > 0
      ? stats.torcedoresTotal
      : stats.sociosTotal > 0
        ? stats.sociosTotal
        : null

  if (realPlataforma != null && realPlataforma > 0) {
    return {
      torcedoresEstimados: realPlataforma,
      torcedoresEstimadosFonte:
        'Contagem real de torcedores e sócios aprovados na plataforma Torcida SaaS',
      torcedoresEstimadosTipo: 'PLATAFORMA',
    }
  }

  if (row.torcedoresEstimadosTipo === 'LIMITE_ATE') {
    return {
      torcedoresEstimados: tetoLimiteGlobal,
      torcedoresEstimadosFonte: TOOLTIP_ESTIMATIVA_INDISPONIVEL,
      torcedoresEstimadosTipo: 'LIMITE_ATE',
    }
  }

  return row
}

// ─── Tipos de retorno explícitos (a inferência do Prisma quebra silenciosamente
// neste schema — ver ARCHITECTURE.md §5.2). ─────────────────────────────────────

export type TorcedoresEstimadosTipo = 'IBOPE_DIGITAL' | 'LIMITE_ATE' | 'PLATAFORMA'

export type AfiliacaoOnboarding = {
  id: string
  nome: string
  apelido: string | null
  escudoUrl: string | null
  cidade: string | null
  estado: string | null
  serie: SerieCampeonato | null
  torcedoresEstimados: number | null
  torcedoresEstimadosFonte: string | null
  torcedoresEstimadosTipo: TorcedoresEstimadosTipo | null
  stats: StatsClubeOnboarding
}

/** Maior base digital (IBOPE/plataforma) primeiro; sem dado estimado por último. */
function valorOrdenacaoInscritosDigitais(a: AfiliacaoOnboarding): number {
  if (a.torcedoresEstimadosTipo === 'LIMITE_ATE') return -1
  return a.torcedoresEstimados ?? 0
}

function pesoEscudoOnboarding(a: AfiliacaoOnboarding): number {
  return a.escudoUrl ? 0 : 1
}

const STATS_TORCIDA_VAZIAS: StatsTorcidaOnboarding = {
  sociosTotal: 0,
  sociosOnline: 0,
  torcedoresTotal: 0,
  torcedoresOnline: 0,
}

function pesoLogoTorcida(t: TorcidaOnboarding): number {
  return t.logoUrl ? 0 : 1
}

function valorOrdenacaoMembrosTorcida(t: TorcidaOnboarding): number {
  return t.stats.sociosTotal
}

function compararTorcidasOnboarding(a: TorcidaOnboarding, b: TorcidaOnboarding): number {
  const diffLogo = pesoLogoTorcida(a) - pesoLogoTorcida(b)
  if (diffLogo !== 0) return diffLogo

  const diffMembros = valorOrdenacaoMembrosTorcida(b) - valorOrdenacaoMembrosTorcida(a)
  if (diffMembros !== 0) return diffMembros

  return a.nome.localeCompare(b.nome, 'pt-BR')
}

function compararClubesOnboarding(a: AfiliacaoOnboarding, b: AfiliacaoOnboarding): number {
  const diffEscudo = pesoEscudoOnboarding(a) - pesoEscudoOnboarding(b)
  if (diffEscudo !== 0) return diffEscudo

  const diffInscritos = valorOrdenacaoInscritosDigitais(b) - valorOrdenacaoInscritosDigitais(a)
  if (diffInscritos !== 0) return diffInscritos

  return a.nome.localeCompare(b.nome, 'pt-BR')
}
export type SedeOnboarding = {
  id: string
  nome: string
  tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string | null
  estado: string | null
  endereco: string | null
  sedePaiId: string | null
  lat: number | null
  lng: number | null
  fotoUrl: string | null
}

export type TorcidaOnboarding = {
  id: string
  nome: string
  slug: string
  logoUrl: string | null
  corPrimaria: string
  membrosAprovados: number
  sedes: SedeOnboarding[]
  stats: StatsTorcidaOnboarding
  /** Se o portal desta torcida está neste host (subdomínio ou TENANT_SLUG). */
  acessivelNoHost: boolean
}

export type DepartamentoOnboarding = {
  id: string
  nome: string
  cor: string
  slug: string
}

export type EstadoOnboarding = {
  perfil: {
    afiliacaoId: string | null
    regiao: string | null
    onboardingConcluidoEm: Date | null
  } | null
  temMembro: boolean
}

export type RegiaoOnboarding = {
  uf: string
  total: number
}

/**
 * UFs com clubes no catálogo (sugestão por região no passo Clube).
 * Cache cross-request — a malha de estados muda raramente.
 */
export const getRegioesOnboarding = cache(async (): Promise<RegiaoOnboarding[]> => {
  return unstable_cache(
    async (): Promise<RegiaoOnboarding[]> => {
      type GrupoUf = { estado: string | null; _count: { _all: number } }
      const grupos: GrupoUf[] = await db.afiliacao.groupBy({
        by: ['estado'],
        where: { estado: { not: null } },
        _count: { _all: true },
      })
      return grupos
        .filter((g): g is GrupoUf & { estado: string } => g.estado != null && g.estado !== '')
        .map((g) => ({ uf: g.estado, total: g._count._all }))
        .sort((a, b) => a.uf.localeCompare(b.uf, 'pt-BR'))
    },
    ['onboarding-regioes'],
    { revalidate: 300, tags: ['onboarding-regioes', 'onboarding-afiliacoes'] },
  )()
})

/**
 * Lista de clubes (Afiliacao) para o passo de seleção do onboarding.
 * Ordena clubes com escudo primeiro; depois do maior para o menor número de
 * inscritos digitais (IBOPE/plataforma); sem imagem e sem dado estimado ficam
 * por último. Desempate por nome.
 * Quando `busca` é informada, filtra clubes cujo **nome ou apelido começa**
 * com o termo (case-insensitive) — ex.: "co" → Corinthians, Coritiba.
 * `uf` restringe por estado (sugestão regional).
 *
 * Cache cross-request (~90s): catálogo + stats de plataforma são dados globais;
 * `*Online` pode ficar até ~90s stale (aceitável no card de onboarding).
 */
export const getAfiliacoesParaOnboarding = cache(
  async (busca?: string, uf?: string): Promise<AfiliacaoOnboarding[]> => {
    const termo = busca?.trim() || ''
    const estado = uf?.trim().toUpperCase() || ''
    return unstable_cache(
      () => carregarAfiliacoesParaOnboarding(termo || undefined, estado || undefined),
      ['onboarding-afiliacoes', termo || '-', estado || '-'],
      { revalidate: 90, tags: ['onboarding-afiliacoes'] },
    )()
  },
)

async function carregarAfiliacoesParaOnboarding(
  busca?: string,
  uf?: string,
): Promise<AfiliacaoOnboarding[]> {
  const termo = busca?.trim()
  const estado = uf?.trim().toUpperCase() || undefined
  type AfiliacaoRow = {
    id: string
    nome: string
    apelido: string | null
    escudoUrl: string | null
    cidade: string | null
    estado: string | null
    serie: SerieCampeonato | null
    torcedoresEstimados: number | null
    torcedoresEstimadosFonte: string | null
    torcedoresEstimadosTipo: 'IBOPE_DIGITAL' | 'LIMITE_ATE' | null
    _count: { tenants: number }
  }
  type AfiliacaoDedup = AfiliacaoRow & { idsGrupo: string[] }

  const filtros = []
  if (termo) {
    filtros.push({
      OR: [
        { nome: { startsWith: termo, mode: 'insensitive' as const } },
        { apelido: { startsWith: termo, mode: 'insensitive' as const } },
      ],
    })
  }
  if (estado) {
    filtros.push({ estado })
  }

  const afiliacoes: AfiliacaoRow[] = await db.afiliacao.findMany({
    where: filtros.length > 0 ? { AND: filtros } : undefined,
    select: {
      id: true,
      nome: true,
      apelido: true,
      escudoUrl: true,
      cidade: true,
      estado: true,
      serie: true,
      torcedoresEstimados: true,
      torcedoresEstimadosFonte: true,
      torcedoresEstimadosTipo: true,
      _count: { select: { tenants: true } },
    },
    orderBy: [{ escudoUrl: { sort: 'asc', nulls: 'last' } }, { nome: 'asc' }],
  })

  // Duplicatas por nome literal OU pelo mesmo clube (ex.: Corinthians ×
  // Sport Club Corinthians Paulista). Prioriza quem tem tenants + escudo;
  // herda escudoUrl de qualquer duplicata do grupo (Fase E).
  const unicas: AfiliacaoDedup[] = []
  for (const afiliacao of afiliacoes) {
    const idxGrupo = unicas.findIndex((u) => saoMesmoClube(u, afiliacao))
    if (idxGrupo === -1) {
      unicas.push({ ...afiliacao, idsGrupo: [afiliacao.id] })
      continue
    }
    const existente = unicas[idxGrupo]!
    existente.idsGrupo.push(afiliacao.id)
    const grupo = [existente, afiliacao]
    const canonIdx = indiceAfiliacaoCanonica(grupo)
    const canon = grupo[canonIdx]!
    const escudoUrl = canon.escudoUrl ?? grupo.find((g) => g.escudoUrl)?.escudoUrl ?? null
    const torcedoresEstimados =
      canon.torcedoresEstimados ??
      grupo.find((g) => g.torcedoresEstimados != null)?.torcedoresEstimados ??
      null
    const torcedoresEstimadosFonte =
      canon.torcedoresEstimadosFonte ??
      grupo.find((g) => g.torcedoresEstimadosFonte)?.torcedoresEstimadosFonte ??
      null
    const torcedoresEstimadosTipo =
      canon.torcedoresEstimadosTipo ??
      grupo.find((g) => g.torcedoresEstimadosTipo)?.torcedoresEstimadosTipo ??
      null
    unicas[idxGrupo] = {
      ...canon,
      escudoUrl,
      torcedoresEstimados,
      torcedoresEstimadosFonte,
      torcedoresEstimadosTipo,
      idsGrupo: existente.idsGrupo,
    }
  }

  const statsMap = await calcularStatsClubesOnboarding(
    unicas.map((u) => ({ canonicalId: u.id, afiliacaoIds: u.idsGrupo })),
  )

  // Reusa o Map já calculado — evita 2ª passagem em SaasMembro/PerfilTorcedor.
  const tetoLimiteGlobal = tetoLimiteDeStatsMap(statsMap)

  const baseRows = unicas.map((afiliacao) => ({
    id: afiliacao.id,
    nome: afiliacao.nome,
    apelido: afiliacao.apelido,
    escudoUrl: afiliacao.escudoUrl,
    cidade: afiliacao.cidade,
    estado: afiliacao.estado,
    serie: afiliacao.serie,
    torcedoresEstimados: afiliacao.torcedoresEstimados,
    torcedoresEstimadosFonte: afiliacao.torcedoresEstimadosFonte,
    torcedoresEstimadosTipo: afiliacao.torcedoresEstimadosTipo,
    stats: statsMap.get(afiliacao.id) ?? STATS_VAZIAS,
  }))

  return baseRows
    .map((afiliacao) => {
      const estimativa = aplicarEstimativaRealNoCard(
        {
          torcedoresEstimados: afiliacao.torcedoresEstimados,
          torcedoresEstimadosFonte: afiliacao.torcedoresEstimadosFonte,
          torcedoresEstimadosTipo: afiliacao.torcedoresEstimadosTipo,
        },
        afiliacao.stats,
        tetoLimiteGlobal,
      )
      return {
        id: afiliacao.id,
        nome: afiliacao.nome,
        apelido: afiliacao.apelido,
        escudoUrl: afiliacao.escudoUrl,
        cidade: afiliacao.cidade,
        estado: afiliacao.estado,
        serie: afiliacao.serie,
        torcedoresEstimados: estimativa.torcedoresEstimados,
        torcedoresEstimadosFonte: estimativa.torcedoresEstimadosFonte,
        torcedoresEstimadosTipo: estimativa.torcedoresEstimadosTipo,
        stats: afiliacao.stats,
      }
    })
    .sort(compararClubesOnboarding)
}

/**
 * Torcidas (Tenants ativos) vinculadas a um clube, com contagem de membros aprovados.
 */
export const getTorcidasPorAfiliacao = cache(
  async (afiliacaoId: string): Promise<TorcidaOnboarding[]> => {
    const afiliacaoSelecionada: { nome: string; estado: string | null } | null =
      await db.afiliacao.findUnique({
        where: { id: afiliacaoId },
        select: { nome: true, estado: true },
      })

    // Mesmo clube pode ter várias Afiliacao (seed catálogo × diretório).
    // Agrupa por saoMesmoClube para listar todas as torcidas do time.
    let afiliacaoIds = [afiliacaoId]
    if (afiliacaoSelecionada?.estado) {
      const doEstado: { id: string; nome: string; estado: string | null }[] =
        await db.afiliacao.findMany({
          where: { estado: afiliacaoSelecionada.estado },
          select: { id: true, nome: true, estado: true },
        })
      afiliacaoIds = doEstado
        .filter((a) => saoMesmoClube(afiliacaoSelecionada, a))
        .map((a) => a.id)
      if (afiliacaoIds.length === 0) afiliacaoIds = [afiliacaoId]
    }

    type SedeRow = {
      id: string
      nome: string
      tipo: string
      cidade: string | null
      estado: string | null
      endereco: string | null
      sedeId: string | null
      lat: number | null
      lng: number | null
      fotoUrl: string | null
    }
    type TenantComContagem = {
      id: string
      nome: string
      slug: string
      logoUrl: string | null
      corPrimaria: string
      torcidaConhecidaId: string | null
      torcidaConhecida: { logoUrl: string | null; titulo: string | null } | null
      _count: { membros: number }
      sedes: SedeRow[]
    }
    const tenants: TenantComContagem[] = await db.tenant.findMany({
      where: { afiliacaoId: { in: afiliacaoIds }, ativo: true, sintetico: false },
      select: {
        id: true,
        nome: true,
        slug: true,
        logoUrl: true,
        corPrimaria: true,
        torcidaConhecidaId: true,
        torcidaConhecida: { select: { logoUrl: true, titulo: true } },
        _count: { select: { membros: { where: { status: 'APROVADO' } } } },
        sedes: {
          where: { ativa: true },
          select: {
            id: true,
            nome: true,
            tipo: true,
            cidade: true,
            estado: true,
            endereco: true,
            sedeId: true,
            lat: true,
            lng: true,
            fotoUrl: true,
          },
          orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
        },
      },
      orderBy: { nome: 'asc' },
    })

    // Dedup: mesmo catálogo ou slug âncora duplicado (ex.: Camisa 12).
    const vistos = new Set<string>()
    const unicos = tenants.filter((t) => {
      const chave = t.torcidaConhecidaId ?? t.slug
      if (vistos.has(chave)) return false
      vistos.add(chave)
      return true
    })

    const statsMap = await calcularStatsTorcidasOnboarding(unicos.map((t) => t.id))

    return unicos
      .map((t: TenantComContagem) => ({
        id: t.id,
        nome: formatNomeTorcida(t.torcidaConhecida?.titulo ?? t.nome),
        slug: t.slug,
        logoUrl: t.torcidaConhecida?.logoUrl ?? t.logoUrl,
        corPrimaria: t.corPrimaria,
        membrosAprovados: t._count.membros,
        sedes: t.sedes.map((s) => ({
          id: s.id,
          nome: s.nome,
          tipo: s.tipo as SedeOnboarding['tipo'],
          cidade: s.cidade,
          estado: s.estado,
          endereco: s.endereco,
          sedePaiId: s.sedeId,
          lat: s.lat,
          lng: s.lng,
          fotoUrl: s.fotoUrl,
        })),
        stats: statsMap.get(t.id) ?? STATS_TORCIDA_VAZIAS,
        acessivelNoHost: torcidaAcessivelNoHost(t.slug),
      }))
      .sort(compararTorcidasOnboarding)
  },
)

/**
 * Departamentos de um tenant, para o passo de sócio.
 */
export const getDepartamentosDoTenant = cache(
  async (tenantId: string): Promise<DepartamentoOnboarding[]> => {
    const departamentos: DepartamentoOnboarding[] = await db.departamento.findMany({
      where: { tenantId },
      select: { id: true, nome: true, cor: true, slug: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
    return departamentos.filter((d) => !isDepartamentoLegado(d))
  },
)

/**
 * Estado atual do onboarding de um usuário: perfil de torcedor (se existir) e se
 * já possui QUALQUER vínculo (SaasMembro) com uma torcida. Membros existentes são
 * "grandfathered" — não precisam refazer o onboarding.
 */
export const getEstadoOnboarding = cache(
  async (userId: string): Promise<EstadoOnboarding> => {
    const [perfil, membro] = await Promise.all([
      db.perfilTorcedor.findUnique({
        where: { userId },
        select: {
          afiliacaoId: true,
          regiao: true,
          onboardingConcluidoEm: true,
        },
      }),
      db.saasMembro.findFirst({
        where: { userId },
        select: { id: true },
      }),
    ])
    return { perfil, temMembro: membro !== null }
  },
)

export type SolicitacaoSocioPendente = {
  tenantNome: string
  criadoEm: Date
}

/** Sócio ainda em análise (mais recente) — banner de status na Comunidade Nacional. */
export const getSolicitacaoSocioPendente = cache(
  async (userId: string): Promise<SolicitacaoSocioPendente | null> => {
    // Leitura idempotente com retry (blips do proxy Railway na entrada da CN).
    const pendente: { criadoEm: Date; tenant: { nome: string } } | null = await withDbRetry(() =>
      db.saasMembro.findFirst({
        where: { userId, tipo: 'SOCIO', status: 'PENDENTE' },
        orderBy: { criadoEm: 'desc' },
        select: { criadoEm: true, tenant: { select: { nome: true } } },
      }),
    )
    if (!pendente) return null
    return { tenantNome: formatNomeTorcida(pendente.tenant.nome), criadoEm: pendente.criadoEm }
  },
)
