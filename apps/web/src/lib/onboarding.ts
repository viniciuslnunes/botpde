import { cache } from 'react'
import { db, saoMesmoClube, indiceAfiliacaoCanonica } from '@torcida/db'
import { torcidaAcessivelNoHost } from '@/lib/tenant'
import {
  calcularStatsClubesOnboarding,
  type StatsClubeOnboarding,
} from '@/lib/onboarding-clube-stats'

export type { StatsClubeOnboarding }

export type SerieCampeonato = 'A' | 'B' | 'C' | 'D' | 'ESTADUAL' | 'OUTRA'

const STATS_VAZIAS: StatsClubeOnboarding = {
  sociosTotal: 0,
  sociosOnline: 0,
  torcedoresTotal: 0,
  torcedoresOnline: 0,
}

// ─── Tipos de retorno explícitos (a inferência do Prisma quebra silenciosamente
// neste schema — ver ARCHITECTURE.md §5.2). ─────────────────────────────────────

export type TorcedoresEstimadosTipo = 'IBOPE_DIGITAL' | 'LIMITE_ATE'

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
export type SedeOnboarding = {
  id: string
  nome: string
  tipo: string
}

export type TorcidaOnboarding = {
  id: string
  nome: string
  slug: string
  logoUrl: string | null
  corPrimaria: string
  membrosAprovados: number
  sedes: SedeOnboarding[]
  /** Se o portal desta torcida está neste host (subdomínio ou TENANT_SLUG). */
  acessivelNoHost: boolean
}

export type DepartamentoOnboarding = {
  id: string
  nome: string
  cor: string
}

export type EstadoOnboarding = {
  perfil: {
    afiliacaoId: string | null
    regiao: string | null
    onboardingConcluidoEm: Date | null
  } | null
  temMembro: boolean
}

/**
 * Lista de clubes (Afiliacao) para o passo de seleção do onboarding.
 * Ordena clubes com escudo primeiro (melhor visual do grid) e depois por nome.
 * Quando `busca` é informada, filtra clubes cujo **nome ou apelido começa**
 * com o termo (case-insensitive) — ex.: "co" → Corinthians, Coritiba.
 */
export const getAfiliacoesParaOnboarding = cache(
  async (busca?: string): Promise<AfiliacaoOnboarding[]> => {
    const termo = busca?.trim()
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

    const afiliacoes: AfiliacaoRow[] = await db.afiliacao.findMany({
      where: termo
        ? {
            OR: [
              { nome: { startsWith: termo, mode: 'insensitive' } },
              { apelido: { startsWith: termo, mode: 'insensitive' } },
            ],
          }
        : undefined,
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

    return unicas
      .map((afiliacao) => ({
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
      .sort((a, b) => {
        const comEscudo = (x: AfiliacaoOnboarding) => (x.escudoUrl ? 0 : 1)
        const diff = comEscudo(a) - comEscudo(b)
        if (diff !== 0) return diff
        return a.nome.localeCompare(b.nome, 'pt-BR')
      })
  },
)

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

    type TenantComContagem = {
      id: string
      nome: string
      slug: string
      logoUrl: string | null
      corPrimaria: string
      torcidaConhecidaId: string | null
      torcidaConhecida: { logoUrl: string | null; titulo: string | null } | null
      _count: { membros: number }
      sedes: SedeOnboarding[]
    }
    const tenants: TenantComContagem[] = await db.tenant.findMany({
      where: { afiliacaoId: { in: afiliacaoIds }, ativo: true },
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
          select: { id: true, nome: true, tipo: true },
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

    return unicos.map((t: TenantComContagem) => ({
      id: t.id,
      nome: t.torcidaConhecida?.titulo ?? t.nome,
      slug: t.slug,
      logoUrl: t.torcidaConhecida?.logoUrl ?? t.logoUrl,
      corPrimaria: t.corPrimaria,
      membrosAprovados: t._count.membros,
      sedes: t.sedes,
      acessivelNoHost: torcidaAcessivelNoHost(t.slug),
    }))
  },
)

/**
 * Departamentos de um tenant, para o passo de sócio.
 */
export const getDepartamentosDoTenant = cache(
  async (tenantId: string): Promise<DepartamentoOnboarding[]> => {
    const departamentos: DepartamentoOnboarding[] = await db.departamento.findMany({
      where: { tenantId },
      select: { id: true, nome: true, cor: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
    return departamentos
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
