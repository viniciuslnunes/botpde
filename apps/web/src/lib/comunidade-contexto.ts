import { cache } from 'react'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { getActiveTenant, resolveTenantLogoUrl } from '@/lib/tenant'
import { filtrarTenantsRestritos } from '@/lib/isolamento'
import { resolverTorcidaDoTorcedor } from '@/lib/tenant-context'
import {
  COR_PRIMARIA_PLATAFORMA,
  designFromPrimary,
  formatNomeAfiliacao,
  formatNomeTorcida,
  isCorPadraoPlataforma,
  nomeExibicaoAfiliacao,
  paletaDoClube,
} from '@torcida/types'
import {
  resolverEscopoComunidadePorModo,
  type EscopoComunidade,
} from '@/lib/comunidade-escopo'

export type { EscopoComunidade }
export { resolverEscopoComunidadePorModo }

export type AfiliacaoComunidade = {
  id: string
  nome: string
  apelido: string | null
  slug: string | null
  escudoUrl: string | null
}

export type TorcidaRealComunidade = {
  id: string
  nome: string
  afiliacaoId: string | null
  logoUrl: string | null
  corPrimaria: string
  balancoFinanceiroVisivel: boolean
}

function projetarAfiliacaoComunidade(a: AfiliacaoComunidade): AfiliacaoComunidade {
  return {
    ...a,
    nome: formatNomeAfiliacao(a.nome),
    apelido: a.apelido ? formatNomeAfiliacao(a.apelido) : null,
  }
}

export type ContextoComunidadePortal =
  | {
      modo: 'torcida'
      tenant: TorcidaRealComunidade
      afiliacao: AfiliacaoComunidade | null
      /** Container operacional da Comunidade Nacional do clube (get-or-create). */
      tenantSintetico?: TenantSintetico | null
      /** Sócio com tenant real — pode alternar para a aba "Minha torcida". */
      podeEscopoTorcida: boolean
      torcidaReal?: TorcidaRealComunidade | null
    }
  | {
      modo: 'nacional'
      tenant: null
      afiliacao: AfiliacaoComunidade
      tenantSintetico?: TenantSintetico | null
      /**
       * TORCEDOR com vínculo APROVADO: tem a aba "Minha torcida" (só posts
       * públicos), mas o default continua Nacional do clube.
       */
      podeEscopoTorcida: boolean
      torcidaReal?: TorcidaRealComunidade | null
    }

export function resolverEscopoComunidade(
  ctx: ContextoComunidadePortal,
  escopoParam: string | undefined,
): EscopoComunidade {
  return resolverEscopoComunidadePorModo(ctx.modo, ctx.podeEscopoTorcida, escopoParam)
}

/**
 * Resolve tenant ativo ou modo comunidade nacional (torcedor global sem torcida
 * na plataforma, mas com clube no PerfilTorcedor).
 */
export const resolverContextoComunidade = cache(
  async (userId: string, email?: string | null): Promise<ContextoComunidadePortal | null> => {
    const tenant = await getActiveTenant(userId, email)
    if (tenant) {
      let afiliacao: AfiliacaoComunidade | null = null
      if (tenant.afiliacaoId) {
        const raw = await db.afiliacao.findUnique({
          where: { id: tenant.afiliacaoId },
          select: { id: true, nome: true, apelido: true, slug: true, escudoUrl: true },
        })
        afiliacao = raw ? projetarAfiliacaoComunidade(raw) : null
      }

      // Subsede/PDE promovida a tenant próprio: sem logo de marca definido,
      // usa a foto da Sede raiz do tenant (ou o avatar do canal oficial) —
      // senão a topbar mostra a inicial da unidade mesmo com foto já cadastrada.
      const logoUrl = await resolveTenantLogoUrl(tenant.id, tenant.logoUrl)

      const tenantSintetico = tenant.afiliacaoId
        ? await getOrCreateComunidadeNacionalTenant(tenant.afiliacaoId)
        : null

      const torcidaReal: TorcidaRealComunidade = {
        id: tenant.id,
        nome: formatNomeTorcida(tenant.nome),
        afiliacaoId: tenant.afiliacaoId,
        logoUrl,
        corPrimaria: tenant.corPrimaria,
        balancoFinanceiroVisivel: tenant.balancoFinanceiroVisivel,
      }

      return {
        modo: 'torcida',
        tenant: torcidaReal,
        afiliacao,
        tenantSintetico,
        podeEscopoTorcida: true,
        torcidaReal,
      }
    }

    const perfil: {
      onboardingConcluidoEm: Date | null
      afiliacaoId: string | null
    } | null = await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { onboardingConcluidoEm: true, afiliacaoId: true },
    })
    if (!perfil?.onboardingConcluidoEm || !perfil.afiliacaoId) return null

    const afiliacaoRaw: AfiliacaoComunidade | null = await db.afiliacao.findUnique({
      where: { id: perfil.afiliacaoId },
      select: { id: true, nome: true, apelido: true, slug: true, escudoUrl: true },
    })
    if (!afiliacaoRaw) return null

    const afiliacao = projetarAfiliacaoComunidade(afiliacaoRaw)
    const [tenantSintetico, torcidaVinculo] = await Promise.all([
      getOrCreateComunidadeNacionalTenant(afiliacaoRaw.id),
      resolverTorcidaDoTorcedor(userId),
    ])

    let torcidaReal: TorcidaRealComunidade | null = null
    if (torcidaVinculo) {
      const logoUrl = await resolveTenantLogoUrl(torcidaVinculo.id, torcidaVinculo.logoUrl)
      torcidaReal = {
        ...torcidaVinculo,
        nome: formatNomeTorcida(torcidaVinculo.nome),
        logoUrl,
      }
    }

    return {
      modo: 'nacional',
      tenant: null,
      afiliacao,
      tenantSintetico,
      podeEscopoTorcida: Boolean(torcidaReal),
      torcidaReal,
    }
  },
)

export type TenantSintetico = { id: string; corPrimaria: string; design: unknown }

/**
 * Get-or-create do tenant sintético da Comunidade Nacional do clube — container
 * de posts de torcedores globais (sem Sede/Role/SaasMembro). Unicidade garantida
 * pelo slug reservado `{slug}-nacional` (slug é @unique no Tenant).
 */
export async function getOrCreateComunidadeNacionalTenant(
  afiliacaoId: string,
): Promise<TenantSintetico> {
  const afiliacao: {
    nome: string
    apelido: string | null
    slug: string | null
    escudoUrl: string | null
  } | null = await db.afiliacao.findUnique({
    where: { id: afiliacaoId },
    select: { nome: true, apelido: true, slug: true, escudoUrl: true },
  })
  if (!afiliacao) throw new Error('Clube não encontrado')

  const slugReservado = `${afiliacao.slug ?? afiliacaoId}-nacional`

  const existente: TenantSintetico | null = await db.tenant.findFirst({
    where: { slug: slugReservado },
    select: { id: true, corPrimaria: true, design: true },
  })
  if (existente) {
    // Backfill: tenants sintéticos criados antes da paleta do clube existir
    // ficaram travados no roxo de fábrica sem design algum — corrige na hora.
    if (isCorPadraoPlataforma(existente.corPrimaria) && !existente.design) {
      const paletaBackfill = paletaDoClube(afiliacao.nome, afiliacao.apelido)
      if (paletaBackfill) {
        const corPrimaria = paletaBackfill.primary
        const design = designFromPrimary(corPrimaria, paletaBackfill.secondary)
        await db.tenant.update({ where: { id: existente.id }, data: { corPrimaria, design } })
        return { id: existente.id, corPrimaria, design }
      }
    }
    return existente
  }

  // Sem cor própria configurável ainda — herda a paleta curada do clube
  // (torcida→escudo→clube, ver docs/data/modulo-design.md) em vez do roxo
  // de fábrica da plataforma.
  const paleta = paletaDoClube(afiliacao.nome, afiliacao.apelido)
  const corPrimaria = paleta?.primary ?? COR_PRIMARIA_PLATAFORMA
  const design = designFromPrimary(corPrimaria, paleta?.secondary ?? null)

  try {
    const criado: TenantSintetico = await db.tenant.create({
      data: {
        nome: `${nomeExibicaoAfiliacao(afiliacao)} — Comunidade Nacional`,
        slug: slugReservado,
        afiliacaoId,
        logoUrl: afiliacao.escudoUrl,
        corPrimaria,
        design,
        ativo: true,
        sintetico: true,
      },
      select: { id: true, corPrimaria: true, design: true },
    })
    return criado
  } catch (error) {
    // Corrida rara: outro torcedor global criou o tenant no mesmo instante e o
    // create bateu no slug @unique — recupera o registro vencedor.
    const vencedor: TenantSintetico | null = await db.tenant.findFirst({
      where: { slug: slugReservado },
      select: { id: true, corPrimaria: true, design: true },
    })
    if (vencedor) return vencedor
    throw error
  }
}

/**
 * IDs de tenants ativos do mesmo clube (feed nacional agregado).
 *
 * R5 — unidades com canal restrito ficam de fora: este conjunto é a base da
 * Comunidade Nacional (feed nacional, grupos nacionais, busca), e o isolamento
 * corta justamente a interação com quem está fora da unidade. Filtro aplicado
 * aqui, no ponto único, em vez de espalhado por cada consumidor.
 */
export const getTenantIdsPorAfiliacao = cache(async (afiliacaoId: string): Promise<string[]> => {
  const tenants: { id: string }[] = await db.tenant.findMany({
    where: { afiliacaoId, ativo: true },
    select: { id: true },
    orderBy: { nome: 'asc' },
  })
  return filtrarTenantsRestritos(tenants.map((t) => t.id))
})

/**
 * Tenant operacional do portal na Comunidade: torcida ativa do sócio ou container
 * sintético da CN para torcedor global (sem `SaasMembro`). Usado por navbar,
 * notificações, busca e APIs que antes dependiam só de `getTenantFromHost()`.
 */
export const resolveTenantIdPortalComunidade = cache(
  async (userId: string, email?: string | null): Promise<string | null> => {
    const ativo = await getActiveTenant(userId, email)
    if (ativo) return ativo.id

    const perfil: { onboardingConcluidoEm: Date | null; afiliacaoId: string | null } | null =
      await db.perfilTorcedor.findUnique({
        where: { userId },
        select: { onboardingConcluidoEm: true, afiliacaoId: true },
      })
    if (!perfil?.onboardingConcluidoEm || !perfil.afiliacaoId) return null

    const sintetico = await getOrCreateComunidadeNacionalTenant(perfil.afiliacaoId)
    return sintetico.id
  },
)

/**
 * Tenant da aba "Minha torcida" (sócio ativo ou TORCEDOR APROVADO na unidade).
 *
 * **Nunca** usa `getTenantFromHost()` / `TENANT_SLUG` — em single-tenant o
 * deploy (ex.: Gaviões) vazava posts de rivais no refetch do feed do TORCEDOR
 * de outra torcida (Tricolor, Mancha, Fúria…).
 */
export const resolveTenantMinhaTorcida = cache(
  async (userId: string, email?: string | null): Promise<Tenant | null> => {
    const ativo = await getActiveTenant(userId, email)
    if (ativo) return ativo

    const torcida = await resolverTorcidaDoTorcedor(userId)
    if (!torcida) return null

    const row: Tenant | null = await db.tenant.findFirst({
      where: { id: torcida.id, ativo: true, sintetico: false },
    })
    if (!row) return null
    return { ...row, nome: formatNomeTorcida(row.nome) }
  },
)
