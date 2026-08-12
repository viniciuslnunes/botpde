import { cache } from 'react'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import { getActiveTenant, resolveTenantLogoUrl } from '@/lib/tenant'
import { filtrarTenantsRestritos } from '@/lib/isolamento'
import { getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import { isSuperAdminEmail, resolverTorcidaDoTorcedor } from '@/lib/tenant-context'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import { listarTorcidasDoClube } from '@/lib/tenant-hierarquia-plataforma'
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
  type EscoposDisponiveis,
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
  slug: string
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

/**
 * Aba "Minha unidade": a subsede/PDE de vínculo — a que emitiu o convite.
 *
 * É definida por um **canal**, não por um tenant. Unidade Caso A (subsede no
 * tenant da Sede) não tem tenant próprio, só `Sede.canalConversaId`; Caso B
 * (promovida) tem os dois. Ancorar no canal cobre as duas sem ramo especial —
 * e é o que a liderança de fato controla.
 */
export type UnidadeComunidade = {
  canalId: string
  /** Tenant dono do canal — Caso A é o da Sede; Caso B, o da própria unidade. */
  tenantId: string
  /** Slug do tenant dono — troca de sessão nas abas-escudo. */
  tenantSlug: string
  nome: string
  /** Foto da unidade (`Sede.fotoUrl`) — escudo da aba "Minha unidade". */
  logoUrl: string | null
}

export type ContextoComunidadePortal =
  | {
      modo: 'torcida'
      tenant: TorcidaRealComunidade
      afiliacao: AfiliacaoComunidade | null
      /** Container operacional da Comunidade Nacional do clube (get-or-create). */
      tenantSintetico?: TenantSintetico | null
      /** Sócio: tem a aba da organizada inteira (Sede + hierarquia). */
      escopos: EscoposDisponiveis
      torcidaReal?: TorcidaRealComunidade | null
      unidade?: UnidadeComunidade | null
      /**
       * Tenant ativo é uma unidade promovida (Caso B), não a Sede raiz —
       * default do escopo vira `unidade`. Ver `resolverEscopoComunidadePorModo`.
       */
      tenantAtivoEhUnidade?: boolean
      /**
       * **Modo operador**: super-admin navegando um tenant onde não tem
       * `SaasMembro` APROVADO. Lê tudo (canais, perfis, posts, sem solicitar
       * entrada) e **não** escreve nada — publicar/reagir/comentar/salvar/
       * seguir ficam bloqueados no servidor por `assertVozComunidade` e
       * `resolverContextoEngajamento`. Super-admin **com** vínculo (o
       * presidente na própria torcida) não é operador: publica normalmente.
       */
      operador?: boolean
    }
  | {
      modo: 'nacional'
      tenant: null
      afiliacao: AfiliacaoComunidade
      tenantSintetico?: TenantSintetico | null
      /**
       * TORCEDOR APROVADO ou SOCIO PENDENTE: tem a aba "Minha unidade" (o canal
       * da unidade que o convidou) — **nunca** a aba da torcida, que é de sócio
       * aprovado. O default continua Nacional do clube.
       */
      escopos: EscoposDisponiveis
      torcidaReal?: TorcidaRealComunidade | null
      unidade?: UnidadeComunidade | null
    }

export function resolverEscopoComunidade(
  ctx: ContextoComunidadePortal,
  escopoParam: string | undefined,
): EscopoComunidade {
  return resolverEscopoComunidadePorModo(ctx.modo, ctx.escopos, escopoParam, {
    tenantAtivoEhUnidade: ctx.modo === 'torcida' && ctx.tenantAtivoEhUnidade,
  })
}

/**
 * Canal oficial da unidade de vínculo da pessoa (`SaasMembro.sedeId`).
 *
 * Leitura pura — nada de `getOrCreateCanalOficial` aqui: esta função roda em
 * GET, e write-on-GET já gerou órfãos neste repo. Unidade sem canal ainda
 * provisionado simplesmente não ganha a aba.
 *
 * Só devolve unidade quando ela é SUBSEDE/PONTO_ENCONTRO: quem está vinculado
 * à SEDE raiz não precisa de uma aba que repete a da torcida.
 *
 * **Caso B:** o canônico (`espelhado: false`) vive no tenant da PDE; na Sede
 * há só o espelho (`espelhado: true`, sem `sedeId`). Por isso `tenantIds` tem
 * que ser a **worktree** (raiz + descendentes), não só o portal ativo —
 * senão sócio aprovado na PDE, logado na Sede, perde a terceira aba.
 */
const resolverUnidadeDoVinculo = cache(
  async (userId: string, tenantIds: string[]): Promise<UnidadeComunidade | null> => {
    if (tenantIds.length === 0) return null

    const vinculo: {
      tenantId: string
      tenant: { slug: string }
      sede: {
        nome: string
        tipo: string
        canalConversaId: string | null
        fotoUrl: string | null
      } | null
    } | null = await db.saasMembro.findFirst({
      where: {
        userId,
        espelhado: false,
        tenantId: { in: tenantIds },
        // TORCEDOR/SOCIO aprovados; SOCIO PENDENTE também — até a aprovação
        // ele usa a unidade do convite como torcedor (sem aba da Sede).
        OR: [
          { status: 'APROVADO' },
          { status: 'PENDENTE', tipo: 'SOCIO' },
        ],
        sede: { tipo: { in: ['SUBSEDE', 'PONTO_ENCONTRO'] }, canalConversaId: { not: null } },
      },
      orderBy: { criadoEm: 'desc' },
      select: {
        tenantId: true,
        tenant: { select: { slug: true } },
        sede: { select: { nome: true, tipo: true, canalConversaId: true, fotoUrl: true } },
      },
    })

    const canalId = vinculo?.sede?.canalConversaId
    if (!vinculo || !canalId) return null

    const sede = vinculo.sede!
    let logoUrl = sede.fotoUrl
    // Sem foto da unidade: avatar do canal — NÃO cair no logo do tenant
    // (Caso A compartilha tenant com a Sede e duplicaria o escudo da
    // aba "Minha torcida").
    if (!logoUrl) {
      const canal: { avatarUrl: string | null } | null = await db.conversa.findFirst({
        where: { id: canalId },
        select: { avatarUrl: true },
      })
      logoUrl = canal?.avatarUrl ?? null
    }

    return {
      canalId,
      tenantId: vinculo.tenantId,
      tenantSlug: vinculo.tenant.slug,
      nome: sede.nome,
      logoUrl,
    }
  },
)

/**
 * Unidade do **tenant ativo** — quando o portal está numa subsede/PDE promovida
 * (Caso B), a aba "Minha unidade" é essa, com ou sem `SaasMembro.sedeId`.
 *
 * O vínculo sozinho não basta: liderança da unidade cujo membro está gravado na
 * Sede, e o operador da plataforma (super-admin sem vínculo), ficavam sem a aba
 * — e a Comunidade caía no canal da raiz, contradizendo o tenant selecionado no
 * `/admin`. Leitura pura, sem write-on-GET (mesma regra de
 * `resolverUnidadeDoVinculo`).
 */
const resolverUnidadeDoTenantAtivo = cache(
  async (tenantId: string, tenantSlug: string): Promise<UnidadeComunidade | null> => {
    const sede: {
      nome: string
      canalConversaId: string | null
      fotoUrl: string | null
    } | null = await db.sede.findFirst({
      where: {
        tenantId,
        tipo: { in: ['SUBSEDE', 'PONTO_ENCONTRO'] },
        canalConversaId: { not: null },
      },
      orderBy: { criadoEm: 'asc' },
      select: { nome: true, canalConversaId: true, fotoUrl: true },
    })

    const canalId = sede?.canalConversaId
    if (!sede || !canalId) return null

    let logoUrl = sede.fotoUrl
    if (!logoUrl) {
      const canal: { avatarUrl: string | null } | null = await db.conversa.findFirst({
        where: { id: canalId },
        select: { avatarUrl: true },
      })
      logoUrl = canal?.avatarUrl ?? null
    }

    return { canalId, tenantId, tenantSlug, nome: sede.nome, logoUrl }
  },
)

/**
 * Organizada (Sede principal) a partir de qualquer tenant da worktree.
 * Liderança de PDE/subsede Caso B tem portal na unidade — "Minha torcida"
 * é sempre a raiz (ex.: Gaviões), não a PDE (ex.: Fiel Cubatão).
 */
async function projetarTorcidaOrganizada(tenant: {
  id: string
  slug: string
  nome: string
  afiliacaoId: string | null
  logoUrl: string | null
  corPrimaria: string
  balancoFinanceiroVisivel: boolean
}): Promise<TorcidaRealComunidade> {
  const raizId = await resolverTenantRaizId(tenant.id)
  if (raizId === tenant.id) {
    const logoUrl = await resolveTenantLogoUrl(tenant.id, tenant.logoUrl)
    return {
      id: tenant.id,
      slug: tenant.slug,
      nome: formatNomeTorcida(tenant.nome),
      afiliacaoId: tenant.afiliacaoId,
      logoUrl,
      corPrimaria: tenant.corPrimaria,
      balancoFinanceiroVisivel: tenant.balancoFinanceiroVisivel,
    }
  }

  const raiz: {
    id: string
    slug: string
    nome: string
    afiliacaoId: string | null
    logoUrl: string | null
    corPrimaria: string
    balancoFinanceiroVisivel: boolean
  } | null = await db.tenant.findFirst({
    where: { id: raizId, ativo: true, sintetico: false },
    select: {
      id: true,
      slug: true,
      nome: true,
      afiliacaoId: true,
      logoUrl: true,
      corPrimaria: true,
      balancoFinanceiroVisivel: true,
    },
  })
  if (!raiz) {
    const logoUrl = await resolveTenantLogoUrl(tenant.id, tenant.logoUrl)
    return {
      id: tenant.id,
      slug: tenant.slug,
      nome: formatNomeTorcida(tenant.nome),
      afiliacaoId: tenant.afiliacaoId,
      logoUrl,
      corPrimaria: tenant.corPrimaria,
      balancoFinanceiroVisivel: tenant.balancoFinanceiroVisivel,
    }
  }

  const logoUrl = await resolveTenantLogoUrl(raiz.id, raiz.logoUrl)
  return {
    id: raiz.id,
    slug: raiz.slug,
    nome: formatNomeTorcida(raiz.nome),
    afiliacaoId: raiz.afiliacaoId,
    logoUrl,
    corPrimaria: raiz.corPrimaria,
    balancoFinanceiroVisivel: raiz.balancoFinanceiroVisivel,
  }
}

/**
 * Resolve tenant ativo ou modo comunidade nacional (torcedor global sem torcida
 * na plataforma, mas com clube no PerfilTorcedor).
 */
export const resolverContextoComunidade = cache(
  async (userId: string, email?: string | null): Promise<ContextoComunidadePortal | null> => {
    const tenant = await getActiveTenant(userId, email)
    if (tenant) {
      // Modo "Minha torcida" (aba da Sede) exige SOCIO APROVADO na worktree.
      // getActiveTenant já barra subdomínio/cookie sem APROVADO; este probe é
      // defesa em profundidade se o host ainda devolver um tenant.
      const lineageProbe = await getTorcidaLineageTenantIds(tenant.id)
      const socioAprovado: { id: string } | null = await db.saasMembro.findFirst({
        where: {
          userId,
          status: 'APROVADO',
          tipo: 'SOCIO',
          espelhado: false,
          tenantId: { in: lineageProbe },
        },
        select: { id: true },
      })

      // Operador da plataforma: super-admin sem SOCIO APROVADO na worktree do
      // tenant ativo (presidente na própria torcida não é operador). TORCEDOR
      // APROVADO no mesmo tenant NÃO bloqueia — senão o SA fica sem CN (sem
      // onboarding) e sem modo torcida. Entra na comunidade DESSE tenant (o
      // mesmo do /admin) em leitura; escrita via `assertVozComunidade`.
      const superAdmin = isSuperAdminEmail(email)
      const operador = superAdmin && !socioAprovado

      if (socioAprovado || operador) {
        let afiliacao: AfiliacaoComunidade | null = null
        if (tenant.afiliacaoId) {
          const raw = await db.afiliacao.findUnique({
            where: { id: tenant.afiliacaoId },
            select: { id: true, nome: true, apelido: true, slug: true, escudoUrl: true },
          })
          afiliacao = raw ? projetarAfiliacaoComunidade(raw) : null
        }

        // Portal ativo (pode ser PDE Caso B) × organizada (sempre a Sede raiz).
        // Sem essa distinção, as abas de escudo duplicavam o logo da unidade.
        const [logoPortal, torcidaReal, tenantSintetico] = await Promise.all([
          resolveTenantLogoUrl(tenant.id, tenant.logoUrl),
          projetarTorcidaOrganizada(tenant),
          tenant.afiliacaoId
            ? getOrCreateComunidadeNacionalTenant(tenant.afiliacaoId)
            : Promise.resolve(null),
        ])

        const portalAtivo: TorcidaRealComunidade = {
          id: tenant.id,
          slug: tenant.slug,
          nome: formatNomeTorcida(tenant.nome),
          afiliacaoId: tenant.afiliacaoId,
          logoUrl: logoPortal,
          corPrimaria: tenant.corPrimaria,
          balancoFinanceiroVisivel: tenant.balancoFinanceiroVisivel,
        }

        // Tenant ativo é uma unidade promovida? Então a aba "Minha unidade" é a
        // dele — é o que a pessoa selecionou. Só quando o portal está na raiz a
        // unidade vem do vínculo (worktree inteira: o canônico Caso B mora no
        // tenant da PDE e na Sede o sócio só tem espelho, sem sedeId).
        const tenantAtivoEhUnidade = torcidaReal.id !== portalAtivo.id
        const lineageIds = await getTorcidaLineageTenantIds(torcidaReal.id)
        const unidade = tenantAtivoEhUnidade
          ? ((await resolverUnidadeDoTenantAtivo(portalAtivo.id, portalAtivo.slug)) ??
            (await resolverUnidadeDoVinculo(userId, lineageIds)))
          : await resolverUnidadeDoVinculo(userId, lineageIds)

        return {
          modo: 'torcida',
          tenant: portalAtivo,
          afiliacao,
          tenantSintetico,
          // Sócio vê a torcida inteira; a aba da unidade quando ele está
          // vinculado a uma subsede/PDE com canal — ou quando o portal ativo
          // já é essa unidade.
          escopos: { torcida: true, unidade: Boolean(unidade) },
          torcidaReal,
          unidade,
          tenantAtivoEhUnidade,
          operador,
        }
      }
      // Sem sócio aprovado: cai no ramo nacional (Timão + PDE) abaixo.
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

    // Torcedor: a aba dele é a da UNIDADE que o convidou — nunca a da
    // torcida, que é de sócio. Sem canal da unidade, sobra só a Nacional.
    // Worktree: convite pode ter sido na PDE Caso B com canônico lá.
    const unidade = torcidaReal
      ? await resolverUnidadeDoVinculo(
          userId,
          await getTorcidaLineageTenantIds(torcidaReal.id),
        )
      : null

    return {
      modo: 'nacional',
      tenant: null,
      afiliacao,
      tenantSintetico,
      escopos: { torcida: false, unidade: Boolean(unidade) },
      torcidaReal,
      unidade,
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
 * Quantas torcidas o clube tem na plataforma — metadado do banner da CN.
 *
 * **Não** é `getTenantIdsPorAfiliacao().length`: aquele conjunto é o *escopo do
 * feed* (inclui o container sintético da CN e os portais de unidade Caso B, que
 * publicam no nacional mas não são torcidas). Contagem vem de
 * `listarTorcidasDoClube` (raiz + ativa + não sintética), com o mesmo corte R5
 * do feed para não anunciar uma unidade que saiu da malha de interação.
 */
export const contarTorcidasDoClubeNaCN = cache(async (afiliacaoId: string): Promise<number> => {
  const torcidas = await listarTorcidasDoClube(afiliacaoId)
  const visiveis = await filtrarTenantsRestritos(torcidas)
  return visiveis.length
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
