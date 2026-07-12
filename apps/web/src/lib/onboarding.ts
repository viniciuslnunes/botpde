import { cache } from 'react'
import { db } from '@torcida/db'
import { torcidaAcessivelNoHost } from '@/lib/tenant'

export type SerieCampeonato = 'A' | 'B' | 'C' | 'D' | 'ESTADUAL' | 'OUTRA'

// ─── Tipos de retorno explícitos (a inferência do Prisma quebra silenciosamente
// neste schema — ver ARCHITECTURE.md §5.2). ─────────────────────────────────────

export type AfiliacaoOnboarding = {
  id: string
  nome: string
  apelido: string | null
  escudoUrl: string | null
  cidade: string | null
  estado: string | null
  serie: SerieCampeonato | null
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
 * Quando `busca` é informada, filtra por nome ou apelido (case-insensitive).
 */
export const getAfiliacoesParaOnboarding = cache(
  async (busca?: string): Promise<AfiliacaoOnboarding[]> => {
    const termo = busca?.trim()
    const afiliacoes: AfiliacaoOnboarding[] = await db.afiliacao.findMany({
      where: termo
        ? {
            OR: [
              { nome: { contains: termo, mode: 'insensitive' } },
              { apelido: { contains: termo, mode: 'insensitive' } },
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
      },
      // Postgres ordena NULLs por último em asc → escudoUrl asc coloca os não-nulos
      // primeiro? Não: NULLS LAST em asc coloca não-nulos primeiro. Garantimos via ordem.
      orderBy: [{ escudoUrl: { sort: 'asc', nulls: 'last' } }, { nome: 'asc' }],
    })
    return afiliacoes
  },
)

/**
 * Torcidas (Tenants ativos) vinculadas a um clube, com contagem de membros aprovados.
 */
export const getTorcidasPorAfiliacao = cache(
  async (afiliacaoId: string): Promise<TorcidaOnboarding[]> => {
    type TenantComContagem = {
      id: string
      nome: string
      slug: string
      logoUrl: string | null
      corPrimaria: string
      _count: { membros: number }
      sedes: SedeOnboarding[]
    }
    const tenants: TenantComContagem[] = await db.tenant.findMany({
      where: { afiliacaoId, ativo: true },
      select: {
        id: true,
        nome: true,
        slug: true,
        logoUrl: true,
        corPrimaria: true,
        _count: { select: { membros: { where: { status: 'APROVADO' } } } },
        sedes: {
          where: { ativa: true },
          select: { id: true, nome: true, tipo: true },
          orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
        },
      },
      orderBy: { nome: 'asc' },
    })
    return tenants.map((t: TenantComContagem) => ({
      id: t.id,
      nome: t.nome,
      slug: t.slug,
      logoUrl: t.logoUrl,
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
