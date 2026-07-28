import { cache } from 'react'
import { db } from '@torcida/db'
import { getActiveTenant, resolveTenantLogoUrl } from '@/lib/tenant'
import {
  COR_PRIMARIA_PLATAFORMA,
  designFromPrimary,
  isCorPadraoPlataforma,
  paletaDoClube,
} from '@torcida/types'

export type AfiliacaoComunidade = {
  id: string
  nome: string
  apelido: string | null
  slug: string | null
  escudoUrl: string | null
}

/** Escopo de leitura/publicação escolhido dentro da Comunidade (query `?escopo=`). */
export type EscopoComunidade = 'nacional' | 'torcida'

export type ContextoComunidadePortal =
  | {
      modo: 'torcida'
      tenant: {
        id: string
        nome: string
        afiliacaoId: string | null
        logoUrl: string | null
        corPrimaria: string
        balancoFinanceiroVisivel: boolean
      }
      afiliacao: AfiliacaoComunidade | null
      /** Container operacional da Comunidade Nacional do clube (get-or-create). */
      tenantSintetico?: TenantSintetico | null
      /** Sócio com tenant real — pode alternar para a aba "Minha torcida". */
      podeEscopoTorcida: boolean
    }
  | {
      modo: 'nacional'
      tenant: null
      afiliacao: AfiliacaoComunidade
      tenantSintetico?: TenantSintetico | null
      podeEscopoTorcida: boolean
    }

/**
 * Resolve o escopo efetivo a partir do parâmetro de query e do contexto do
 * usuário. Torcedor (sem tenant real) é sempre forçado a `nacional`; sócio
 * aprovado tem as duas abas e cai em `torcida` por padrão.
 */
export function resolverEscopoComunidade(
  ctx: ContextoComunidadePortal,
  escopoParam: string | undefined,
): EscopoComunidade {
  if (!ctx.podeEscopoTorcida) return 'nacional'
  return escopoParam === 'nacional' ? 'nacional' : 'torcida'
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
        afiliacao = await db.afiliacao.findUnique({
          where: { id: tenant.afiliacaoId },
          select: { id: true, nome: true, apelido: true, slug: true, escudoUrl: true },
        })
      }

      // Subsede/PDE promovida a tenant próprio: sem logo de marca definido,
      // usa a foto da Sede raiz do tenant (ou o avatar do canal oficial) —
      // senão a topbar mostra a inicial da unidade mesmo com foto já cadastrada.
      const logoUrl = await resolveTenantLogoUrl(tenant.id, tenant.logoUrl)

      const tenantSintetico = tenant.afiliacaoId
        ? await getOrCreateComunidadeNacionalTenant(tenant.afiliacaoId)
        : null

      return {
        modo: 'torcida',
        tenant: {
          id: tenant.id,
          nome: tenant.nome,
          afiliacaoId: tenant.afiliacaoId,
          logoUrl,
          corPrimaria: tenant.corPrimaria,
          balancoFinanceiroVisivel: tenant.balancoFinanceiroVisivel,
        },
        afiliacao,
        tenantSintetico,
        podeEscopoTorcida: true,
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

    const afiliacao: AfiliacaoComunidade | null = await db.afiliacao.findUnique({
      where: { id: perfil.afiliacaoId },
      select: { id: true, nome: true, apelido: true, slug: true, escudoUrl: true },
    })
    if (!afiliacao) return null

    const tenantSintetico = await getOrCreateComunidadeNacionalTenant(afiliacao.id)

    return { modo: 'nacional', tenant: null, afiliacao, tenantSintetico, podeEscopoTorcida: false }
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
        nome: `${afiliacao.apelido ?? afiliacao.nome} — Comunidade Nacional`,
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

/** IDs de tenants ativos do mesmo clube (feed nacional agregado). */
export const getTenantIdsPorAfiliacao = cache(async (afiliacaoId: string): Promise<string[]> => {
  const tenants: { id: string }[] = await db.tenant.findMany({
    where: { afiliacaoId, ativo: true },
    select: { id: true },
    orderBy: { nome: 'asc' },
  })
  return tenants.map((t) => t.id)
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
