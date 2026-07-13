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
    type AfiliacaoComVinculos = AfiliacaoOnboarding & {
      _count: { tenants: number }
    }
    const afiliacoes: AfiliacaoComVinculos[] = await db.afiliacao.findMany({
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
        _count: { select: { tenants: true } },
      },
      orderBy: [{ escudoUrl: { sort: 'asc', nulls: 'last' } }, { nome: 'asc' }],
    })

    // Bancos que receberam a versão antiga do seed podem ter duplicatas por
    // nome+UF. Mostra uma só opção e prioriza a que está ligada a tenants,
    // evitando selecionar uma cópia de Corinthians sem Gaviões/Camisa 12.
    const unicas = new Map<string, AfiliacaoComVinculos>()
    for (const afiliacao of afiliacoes) {
      const chave = `${afiliacao.nome.trim().toLocaleLowerCase('pt-BR')}|${afiliacao.estado ?? ''}`
      const atual = unicas.get(chave)
      const deveSubstituir =
        !atual
        || afiliacao._count.tenants > atual._count.tenants
        || (afiliacao._count.tenants === atual._count.tenants
          && Boolean(afiliacao.escudoUrl)
          && !atual.escudoUrl)
      if (deveSubstituir) unicas.set(chave, afiliacao)
    }

    return [...unicas.values()].map((afiliacao) => ({
      id: afiliacao.id,
      nome: afiliacao.nome,
      apelido: afiliacao.apelido,
      escudoUrl: afiliacao.escudoUrl,
      cidade: afiliacao.cidade,
      estado: afiliacao.estado,
      serie: afiliacao.serie,
    }))
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

    // Compatibilidade com bancos afetados pelo seed antigo: procura todos os
    // IDs do mesmo clube para que um PerfilTorcedor salvo na cópia sem Tenant
    // ainda encontre Gaviões, Camisa 12, Pavilhão Nove etc.
    let afiliacaoIds = [afiliacaoId]
    if (afiliacaoSelecionada) {
      const equivalentes: { id: string }[] = await db.afiliacao.findMany({
        where: {
          nome: { equals: afiliacaoSelecionada.nome, mode: 'insensitive' },
          estado: afiliacaoSelecionada.estado,
        },
        select: { id: true },
      })
      afiliacaoIds = equivalentes.map((a) => a.id)
    }

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
      where: { afiliacaoId: { in: afiliacaoIds }, ativo: true },
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

export type TorcidaConhecidaOnboarding = {
  id: string
  nome: string
  titulo: string | null
  logoUrl: string | null
  fundacao: string | null
  lema: string | null
  cidade: string | null
  uf: string | null
  siteOficial: string | null
}

/**
 * Normalização local de nomes (acentos, caixa, pontuação) para comparar
 * TorcidaConhecida × Tenant. Espelha `normalizeNome` de
 * `packages/db/src/data/afiliacoes-normalize.js` (não exportado por `@torcida/db`).
 */
function normalizarNomeTorcida(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Torcidas organizadas conhecidas (catálogo nacional) de um clube, para a seção
 * informativa do onboarding. Exclui as que já estão na plataforma como Tenant
 * ativo do mesmo clube (comparação por nome normalizado).
 */
export const getTorcidasConhecidasPorAfiliacao = cache(
  async (afiliacaoId: string): Promise<TorcidaConhecidaOnboarding[]> => {
    const [conhecidas, tenants]: [TorcidaConhecidaOnboarding[], { nome: string }[]] =
      await Promise.all([
        db.torcidaConhecida.findMany({
          where: { afiliacaoId, ativa: true },
          select: {
            id: true,
            nome: true,
            titulo: true,
            logoUrl: true,
            fundacao: true,
            lema: true,
            cidade: true,
            uf: true,
            siteOficial: true,
          },
          orderBy: { nome: 'asc' },
        }),
        db.tenant.findMany({
          where: { afiliacaoId, ativo: true },
          select: { nome: true },
        }),
      ])

    const nomesTenants = new Set(tenants.map((t) => normalizarNomeTorcida(t.nome)))
    return conhecidas.filter((c) => !nomesTenants.has(normalizarNomeTorcida(c.nome)))
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
