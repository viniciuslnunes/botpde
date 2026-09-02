import { cache } from 'react'
import { revalidateTag, unstable_cache } from 'next/cache'
import { cookies } from 'next/headers'
import { db } from '@torcida/db'
import { formatNomeAfiliacao, formatNomeTorcida, nomeExibicaoAfiliacao } from '@torcida/types'
import { env, isProd, superAdminEmails } from '@/lib/env'
import { sharedCookieOptions } from '@/lib/session-cookie'
import {
  labelClubeComUf,
  labelTorcidaComClube,
  type ClubeOpcao,
  type TorcidaOpcao,
} from '@/lib/torcida-labels'
import { whereTenantEhTorcida } from '@/lib/tenant-hierarquia-plataforma'

export type { ClubeOpcao, TorcidaOpcao }
export { labelClubeComUf, labelTorcidaComClube }

/** Cookie httpOnly — torcida ativa quando não há subdomínio (single-tenant ou apex). */
export const TENANT_CTX_COOKIE = 'torcida_ctx'

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && superAdminEmails.includes(email))
}

export async function getTenantContextSlug(): Promise<string | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(TENANT_CTX_COOKIE)?.value?.trim()
  return value || null
}

export async function setTenantContextSlug(slug: string): Promise<void> {
  // Só válido em Server Actions e Route Handlers — não chamar de layouts/pages.
  const cookieStore = await cookies()
  cookieStore.set(TENANT_CTX_COOKIE, slug, sharedCookieOptions(isProd))
}

/** Limpa o cookie de contexto — ex.: vínculo TORCEDOR não deve herdar uma
 * torcida fixada numa tentativa anterior (o cookie sobreviveria ao filtro
 * de tipo em resolveUserTenantSlugForUser via fallback de torcedor global). */
export async function clearTenantContextSlug(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(TENANT_CTX_COOKIE)
}

/** Usuário sem SaasMembro e sem onboarding concluído → hub /onboarding. */
export async function usuarioPrecisaOnboarding(userId: string): Promise<boolean> {
  const [membroCount, perfil] = await Promise.all([
    db.saasMembro.count({ where: { userId } }),
    db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true },
    }),
  ])
  if (membroCount > 0) return false
  return !perfil?.onboardingConcluidoEm
}

/**
 * Conta incompleta vs cadastro manual (nome + e-mail + @) — OAuth sem senha é ok.
 * Redireciona para /definir-apelido até preencher o que falta.
 */
export async function usuarioPrecisaNickname(userId: string): Promise<boolean> {
  const user: { nickname: string | null; nome: string | null; email: string | null } | null =
    await db.user.findUnique({
      where: { id: userId },
      select: { nickname: true, nome: true, email: true },
    })
  if (!user) return true
  if (!user.nickname) return true
  if (!user.nome || user.nome.trim().length < 3) return true
  if (!user.email?.trim()) return true
  return false
}

/**
 * Slug da torcida do usuário (vínculo real). Sem fallback TENANT_SLUG —
 * use em roteamento pós-login; TENANT_SLUG é só contexto do deploy.
 *
 * Só sócio **APROVADO** abre modo "Minha torcida". SOCIO PENDENTE fica na
 * Comunidade Nacional + aba da unidade (como TORCEDOR) até a diretoria
 * aprovar — abrir tenant com PENDENTE expunha a Sede (Gaviões) sem vínculo.
 */
export async function resolveUserTenantSlugForUser(userId: string): Promise<string | null> {
  const socioAprovado: { tenant: { slug: string } } | null = await db.saasMembro.findFirst({
    where: { userId, status: 'APROVADO', tipo: 'SOCIO', espelhado: false },
    orderBy: { criadoEm: 'desc' },
    select: { tenant: { select: { slug: true } } },
  })
  return socioAprovado?.tenant.slug ?? null
}

/** Vínculo que autoriza cookie/subdomínio de portal nesta torcida.
 * Só SOCIO **APROVADO** (canônico ou espelho Caso B na Sede). PENDENTE nunca. */
export async function vinculoAutorizaContextoTenant(
  userId: string,
  tenantSlug: string,
): Promise<boolean> {
  const vinculo: { id: string } | null = await db.saasMembro.findFirst({
    where: {
      userId,
      tipo: 'SOCIO',
      status: 'APROVADO',
      tenant: { slug: tenantSlug },
    },
    select: { id: true },
  })
  return Boolean(vinculo)
}

/**
 * Tenant do vínculo que alimenta a aba "Minha unidade" sem abrir modo sócio
 * (`getActiveTenant` continua null): TORCEDOR APROVADO ou SOCIO ainda PENDENTE
 * (canônico). Espelho na Sede fica de fora — a unidade é a origem do convite.
 */
export async function resolverTorcidaDoTorcedor(userId: string): Promise<{
  id: string
  slug: string
  nome: string
  afiliacaoId: string | null
  logoUrl: string | null
  corPrimaria: string
  balancoFinanceiroVisivel: boolean
} | null> {
  const vinculo: {
    tenant: {
      id: string
      slug: string
      nome: string
      afiliacaoId: string | null
      logoUrl: string | null
      corPrimaria: string
      balancoFinanceiroVisivel: boolean
    }
  } | null = await db.saasMembro.findFirst({
    where: {
      userId,
      espelhado: false,
      tenant: { ativo: true, sintetico: false },
      OR: [
        { status: 'APROVADO', tipo: 'TORCEDOR' },
        { status: 'PENDENTE', tipo: 'SOCIO' },
      ],
    },
    orderBy: { criadoEm: 'desc' },
    select: {
      tenant: {
        select: {
          id: true,
          slug: true,
          nome: true,
          afiliacaoId: true,
          logoUrl: true,
          corPrimaria: true,
          balancoFinanceiroVisivel: true,
        },
      },
    },
  })
  return vinculo?.tenant ?? null
}

/**
 * Slug da torcida "casa" do usuário: sócio aprovado > fallback TENANT_SLUG.
 * Usado para resolver tenant ativo no portal (single-tenant), não pós-login.
 */
export async function resolveHomeTenantSlugForUser(userId: string): Promise<string | null> {
  const slug = await resolveUserTenantSlugForUser(userId)
  if (slug) return slug
  return env.TENANT_SLUG ?? null
}

/**
 * Destino pós-login (sem gravar cookie — use GET /auth/contexto).
 */
export async function resolvePortalHomeForUser(
  userId: string,
  email?: string | null,
): Promise<string> {
  if (isSuperAdminEmail(email)) {
    return '/super-admin/torcidas'
  }

  if (await usuarioPrecisaOnboarding(userId)) {
    return '/onboarding'
  }

  const slug = await resolveUserTenantSlugForUser(userId)
  if (!slug) {
    const perfil = await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true },
    })
    if (perfil?.onboardingConcluidoEm) {
      return env.ROOT_DOMAIN ? '/auth/contexto' : '/portal/comunidade'
    }
    return '/onboarding'
  }

  if (env.ROOT_DOMAIN) {
    const protocol = env.NODE_ENV === 'production' ? 'https' : 'http'
    return `${protocol}://${slug}.${env.ROOT_DOMAIN}/portal/comunidade`
  }

  return '/auth/contexto'
}

type TorcidaRowComAfiliacao = {
  id: string
  slug: string
  nome: string
  corPrimaria: string
  afiliacaoId: string | null
  afiliacao: { nome: string; apelido: string | null; estado: string | null } | null
}

function mapTorcidaOpcao(row: TorcidaRowComAfiliacao): TorcidaOpcao {
  return {
    id: row.id,
    slug: row.slug,
    nome: formatNomeTorcida(row.nome),
    corPrimaria: row.corPrimaria,
    afiliacaoId: row.afiliacaoId,
    clubeNome: row.afiliacao ? nomeExibicaoAfiliacao(row.afiliacao) || null : null,
    clubeUf: row.afiliacao?.estado ?? null,
  }
}

const TORCIDA_SELECAO_SELECT = {
  id: true,
  slug: true,
  nome: true,
  corPrimaria: true,
  afiliacaoId: true,
  afiliacao: { select: { nome: true, apelido: true, estado: true } },
} as const

export const TORCIDAS_SELECAO_CACHE_TAG = 'torcidas-para-selecao'
export const CLUBES_SELECAO_CACHE_TAG = 'clubes-para-selecao'

async function fetchTorcidasParaSelecao(): Promise<TorcidaOpcao[]> {
  const rows: TorcidaRowComAfiliacao[] = await db.tenant.findMany({
    where: await whereTenantEhTorcida(),
    select: TORCIDA_SELECAO_SELECT,
    orderBy: { nome: 'asc' },
  })
  return rows.map(mapTorcidaOpcao)
}

/**
 * TODAS as torcidas da plataforma. **Não usar em layout nem em switcher**: a
 * 554ª linha custa os mesmos bytes de flight que a primeira e o dropdown só
 * mostra 40. Sobrou para o `<select>` de filtro da auditoria, que é HTML de uma
 * página só. Para seletor, use `listarTorcidasParaSelecaoSemente` + busca sob
 * demanda (`buscarTorcidasParaSelecao`).
 */
export const listarTorcidasParaSelecao = cache(async function listarTorcidasParaSelecao(): Promise<
  TorcidaOpcao[]
> {
  return unstable_cache(fetchTorcidasParaSelecao, ['torcidas-para-selecao'], {
    revalidate: 300,
    tags: [TORCIDAS_SELECAO_CACHE_TAG],
  })()
})

/**
 * Quantas torcidas a plataforma tem — mesmo `where` de quem lista, para que o
 * KPI e a listagem nunca divirjam (ver `whereTenantEhTorcida`).
 */
export const contarTorcidasDaPlataforma = cache(
  async function contarTorcidasDaPlataforma(): Promise<number> {
    return db.tenant.count({ where: await whereTenantEhTorcida() })
  },
)

/** Quantas linhas o switcher embarca no payload antes de qualquer digitação. */
export const SEMENTE_TORCIDAS_MAX = 30

/** Teto de uma busca sob demanda — o dropdown mostra 40 e trunca depois disso. */
const BUSCA_TORCIDAS_MAX = 40

async function fetchSementeTorcidas(): Promise<TorcidaOpcao[]> {
  const rows: TorcidaRowComAfiliacao[] = await db.tenant.findMany({
    where: await whereTenantEhTorcida(),
    select: TORCIDA_SELECAO_SELECT,
    orderBy: { nome: 'asc' },
    take: SEMENTE_TORCIDAS_MAX,
  })
  return rows.map(mapTorcidaOpcao)
}

/**
 * Semente do switcher de torcida: as primeiras `SEMENTE_TORCIDAS_MAX` em ordem
 * alfabética, mais a torcida ativa — que precisa estar presente para o input
 * conseguir exibir o próprio rótulo. O resto chega por
 * `buscarTorcidasParaSelecao` quando o operador abre o dropdown.
 *
 * Por que existe: a lista inteira ia no payload RSC de TODA rota
 * `/super-admin/*` e de todo `/admin/*` de super-admin — 147 KB por navegação,
 * medidos com 557 tenants, para uma lista em que 40 é o teto do que aparece.
 */
export const listarTorcidasParaSelecaoSemente = cache(
  async function listarTorcidasParaSelecaoSemente(
    slugAtual?: string | null,
  ): Promise<TorcidaOpcao[]> {
    const semente = await unstable_cache(fetchSementeTorcidas, ['torcidas-selecao-semente'], {
      revalidate: 300,
      tags: [TORCIDAS_SELECAO_CACHE_TAG],
    })()

    const slug = slugAtual?.trim()
    if (!slug || semente.some((t) => t.slug === slug)) return semente

    const atual: TorcidaRowComAfiliacao | null = await db.tenant.findUnique({
      where: { slug },
      select: TORCIDA_SELECAO_SELECT,
    })
    return atual ? [mapTorcidaOpcao(atual), ...semente] : semente
  },
)

export type BuscaTorcidasParaSelecao = {
  /** Termo digitado. Vazio = "abriu o dropdown": devolve o topo alfabético. */
  termo?: string
  /** Cascata clube → torcida: quando presente, restringe ao clube. */
  afiliacaoId?: string | null
  /** Slugs no localStorage do operador — resolvidos no mesmo round-trip. */
  recentes?: string[]
}

/**
 * Busca sob demanda do switcher. Devolve quem casa com o termo (teto
 * `BUSCA_TORCIDAS_MAX`) **mais** os recentes pedidos — assim a seção "Recentes"
 * do dropdown continua funcionando sem que o servidor precise adivinhar o
 * localStorage de quem está olhando.
 */
export async function buscarTorcidasParaSelecao(
  input: BuscaTorcidasParaSelecao,
): Promise<TorcidaOpcao[]> {
  const base = await whereTenantEhTorcida()
  const termo = (input.termo ?? '').trim().slice(0, 80)
  const afiliacaoId = input.afiliacaoId?.trim() || undefined
  const recentes = (input.recentes ?? []).filter((s) => typeof s === 'string' && s).slice(0, 8)

  const filtroTermo = termo
    ? {
        OR: [
          { nome: { contains: termo, mode: 'insensitive' as const } },
          { slug: { contains: termo, mode: 'insensitive' as const } },
          { afiliacao: { nome: { contains: termo, mode: 'insensitive' as const } } },
          { afiliacao: { apelido: { contains: termo, mode: 'insensitive' as const } } },
        ],
      }
    : {}

  const [achados, dosRecentes]: [TorcidaRowComAfiliacao[], TorcidaRowComAfiliacao[]] =
    await Promise.all([
      db.tenant.findMany({
        where: { ...base, ...(afiliacaoId ? { afiliacaoId } : {}), ...filtroTermo },
        select: TORCIDA_SELECAO_SELECT,
        orderBy: { nome: 'asc' },
        take: BUSCA_TORCIDAS_MAX,
      }),
      recentes.length > 0
        ? db.tenant.findMany({
            where: { ...base, slug: { in: recentes } },
            select: TORCIDA_SELECAO_SELECT,
          })
        : Promise.resolve([]),
    ])

  const vistos = new Set<string>()
  const saida: TorcidaOpcao[] = []
  for (const row of [...achados, ...dosRecentes]) {
    if (vistos.has(row.id)) continue
    vistos.add(row.id)
    saida.push(mapTorcidaOpcao(row))
  }
  return saida
}

type ClubeRow = {
  id: string
  nome: string
  apelido: string | null
  estado: string | null
}

async function fetchClubesParaSelecao(): Promise<ClubeOpcao[]> {
  const rows: ClubeRow[] = await db.afiliacao.findMany({
    where: {
      tenants: { some: { ativo: true, sintetico: false } },
    },
    select: { id: true, nome: true, apelido: true, estado: true },
    orderBy: { nome: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id,
    nome: formatNomeAfiliacao(r.nome),
    apelido: r.apelido ? formatNomeAfiliacao(r.apelido) : null,
    estado: r.estado,
  }))
}

/** Clubes com ≥1 torcida ativa — filtro do switcher em cascata (cache 5 min). */
export const listarClubesParaSelecao = cache(async function listarClubesParaSelecao(): Promise<
  ClubeOpcao[]
> {
  return unstable_cache(fetchClubesParaSelecao, ['clubes-para-selecao'], {
    revalidate: 300,
    tags: [CLUBES_SELECAO_CACHE_TAG, TORCIDAS_SELECAO_CACHE_TAG],
  })()
})

/** Invalida o cache da lista após criar/ativar/desativar tenants. */
export function invalidateTorcidasSelecaoCache(): void {
  revalidateTag(TORCIDAS_SELECAO_CACHE_TAG, 'max')
  revalidateTag(CLUBES_SELECAO_CACHE_TAG, 'max')
}

/**
 * Torcidas onde o usuário tem vínculo de sócio APROVADO — base do seletor de
 * troca de contexto (não confundir com `listarTorcidasParaSelecao`, que lista
 * TODAS as torcidas e é exclusiva do switcher de super-admin).
 */
export async function listarVinculosAprovadosDoUsuario(userId: string): Promise<TorcidaOpcao[]> {
  const rows: { tenant: TorcidaRowComAfiliacao }[] = await db.saasMembro.findMany({
    where: { userId, status: 'APROVADO', tipo: 'SOCIO' },
    select: { tenant: { select: TORCIDA_SELECAO_SELECT } },
    orderBy: { criadoEm: 'desc' },
  })

  const vistos = new Set<string>()
  const opcoes: TorcidaOpcao[] = []
  for (const row of rows) {
    if (vistos.has(row.tenant.slug)) continue
    vistos.add(row.tenant.slug)
    opcoes.push(mapTorcidaOpcao(row.tenant))
  }
  return opcoes
}

