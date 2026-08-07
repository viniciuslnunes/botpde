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
    where: { ativo: true, sintetico: false },
    select: TORCIDA_SELECAO_SELECT,
    orderBy: { nome: 'asc' },
  })
  return rows.map(mapTorcidaOpcao)
}

/** Lista enxuta para seletores de super-admin (cache cross-request 5 min). */
export const listarTorcidasParaSelecao = cache(async function listarTorcidasParaSelecao(): Promise<
  TorcidaOpcao[]
> {
  return unstable_cache(fetchTorcidasParaSelecao, ['torcidas-para-selecao'], {
    revalidate: 300,
    tags: [TORCIDAS_SELECAO_CACHE_TAG],
  })()
})

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

