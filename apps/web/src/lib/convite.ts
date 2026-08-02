import 'server-only'
import { cache } from 'react'
import { db } from '@torcida/db'
import { formatNomeAfiliacao, formatNomeTorcida } from '@torcida/types'
import { torcidaAcessivelNoHost } from '@/lib/tenant'
import { calcularStatsClubesOnboarding } from '@/lib/onboarding-clube-stats'
import { calcularStatsTorcidasOnboarding } from '@/lib/onboarding-torcida-stats'
import { getAncestorTenantIds } from '@/lib/hierarquia'
import type {
  AfiliacaoOnboarding,
  SedeOnboarding,
  SerieCampeonato,
  TorcidaOnboarding,
} from '@/lib/onboarding'
import { isTenantRestrito } from '@/lib/isolamento'

/**
 * Afiliação efetiva do tenant: a própria, ou a do ancestral mais próximo
 * (unidade Caso B promovida sem espelhar `afiliacaoId` da Sede).
 *
 * Sem isso o convite da unidade resolve `null` e o usuário cai no passo Clube
 * mesmo com link válido — exatamente o sintoma de
 * `pde-fiel-baixada-praia-grande-praia-grande`.
 */
export async function resolverAfiliacaoIdEfetiva(
  tenantId: string,
  afiliacaoIdDireto: string | null,
): Promise<string | null> {
  if (afiliacaoIdDireto) return afiliacaoIdDireto

  const ancestrais = await getAncestorTenantIds(tenantId)
  if (ancestrais.length === 0) return null

  const comAfiliacao: { id: string; afiliacaoId: string | null }[] = await db.tenant.findMany({
    where: { id: { in: ancestrais }, afiliacaoId: { not: null } },
    select: { id: true, afiliacaoId: true },
  })
  const porId = new Map(comAfiliacao.map((t) => [t.id, t.afiliacaoId]))

  // `getAncestorTenantIds` devolve do mais próximo ao mais distante.
  for (const id of ancestrais) {
    const afiliacaoId = porId.get(id)
    if (afiliacaoId) return afiliacaoId
  }
  return null
}

type AncestralTorcidaRow = {
  id: string
  nome: string
  logoUrl: string | null
  afiliacaoId: string | null
  torcidaConhecida: { logoUrl: string | null; titulo: string | null } | null
}

/** Ancestrais ordenados do mais próximo ao mais distante, com logo/nome. */
async function carregarAncestraisTorcida(tenantId: string): Promise<AncestralTorcidaRow[]> {
  const ancestrais = await getAncestorTenantIds(tenantId)
  if (ancestrais.length === 0) return []

  const rows: AncestralTorcidaRow[] = await db.tenant.findMany({
    where: { id: { in: ancestrais }, ativo: true, sintetico: false },
    select: {
      id: true,
      nome: true,
      logoUrl: true,
      afiliacaoId: true,
      torcidaConhecida: { select: { logoUrl: true, titulo: true } },
    },
  })
  const porId = new Map(rows.map((r) => [r.id, r]))
  return ancestrais.map((id) => porId.get(id)).filter((r): r is AncestralTorcidaRow => Boolean(r))
}

/**
 * Convite direto: link da própria torcida/unidade que adianta as etapas de
 * clube, torcida e unidade no onboarding e leva o usuário direto à pergunta
 * "você é torcedor ou sócio?".
 *
 * Para uma unidade com canal restrito este é o ÚNICO caminho de entrada — ela
 * não aparece na vitrine pública. Por isso o carregamento aqui NÃO passa pelos
 * filtros de isolamento de `lib/onboarding.ts`: quem tem o link foi convidado.
 *
 * O que o convite NÃO pula: criação de conta, e-mail e apelido (`@`). Esses
 * dados são a identidade na plataforma inteira — o gate continua sendo o
 * mesmo `usuarioPrecisaNickname` do onboarding normal.
 */

/** Sede/mãe da unidade convidada (Caso B) — logo e copy da malha aberta. */
export interface TorcidaMaeConvite {
  id: string
  nome: string
  logoUrl: string | null
}

export interface ConviteOnboarding {
  /** Slug opaco do link (`Tenant.conviteSlug`) — precisa sobreviver na URL do wizard. */
  conviteSlug: string
  tenantId: string
  tenantSlug: string
  /** A unidade convidada está com o canal restrito? Muda o texto da tela. */
  canalRestrito: boolean
  /**
   * Ancestral imediato com identidade de torcida (ex.: Gaviões). Null quando
   * o próprio link é da Sede — aí `torcida` já é a organizada.
   */
  torcidaMae: TorcidaMaeConvite | null
  clube: AfiliacaoOnboarding
  torcida: TorcidaOnboarding
  /** Unidade pré-selecionada pelo convite (sede do link ou única do tenant). */
  unidadeId: string | null
  /**
   * Onde o wizard abre. Convite da Sede (raiz) ou com uma única unidade vai
   * direto ao Vínculo. Só pede Unidade quando o tenant convidado tem várias
   * sedes e não é a Sede raiz (caso raro em unidade Caso B).
   */
  passoInicial: 'unidade' | 'vinculo'
  uf: string
  cidade: string
}

interface TenantConviteRow {
  id: string
  slug: string
  nome: string
  logoUrl: string | null
  corPrimaria: string
  exigirDocumentosCadastro: boolean
  afiliacaoId: string | null
  torcidaConhecida: { logoUrl: string | null; titulo: string | null } | null
  _count: { membros: number }
}

const SEDE_CONVITE_SELECT = {
  id: true,
  nome: true,
  tipo: true,
  cidade: true,
  estado: true,
  endereco: true,
  sedeId: true,
  tenantId: true,
  lat: true,
  lng: true,
  fotoUrl: true,
  streetViewHeading: true,
  streetViewPitch: true,
  streetViewFov: true,
} as const

type SedeConviteRow = {
  id: string
  nome: string
  tipo: string
  cidade: string
  estado: string
  endereco: string | null
  sedeId: string | null
  tenantId: string | null
  lat: number | null
  lng: number | null
  fotoUrl: string | null
  streetViewHeading: number | null
  streetViewPitch: number | null
  streetViewFov: number | null
}

function mapSede(s: SedeConviteRow): SedeOnboarding {
  return {
    id: s.id,
    nome: s.nome,
    tipo: s.tipo as SedeOnboarding['tipo'],
    cidade: s.cidade,
    estado: s.estado,
    endereco: s.endereco,
    sedePaiId: s.sedeId,
    tenantId: s.tenantId,
    lat: s.lat,
    lng: s.lng,
    fotoUrl: s.fotoUrl,
    streetViewHeading: s.streetViewHeading,
    streetViewPitch: s.streetViewPitch,
    streetViewFov: s.streetViewFov,
  }
}

/**
 * Decide unidade pré-selecionada e passo inicial do wizard a partir do
 * convite. Pura — coberta por teste sem DB.
 *
 * - 0/1 sede → vínculo (com id quando houver uma)
 * - Convite da Sede raiz (sem torcidaMae) com várias sedes → vínculo na sede
 *   territorial `tipo === 'SEDE'` (não força o usuário a escolher Campinas etc.)
 * - Unidade Caso B com várias sedes locais → ainda pede Unidade
 */
export function decidirPassoInicialConvite(opts: {
  sedes: Array<{ id: string; tipo: string }>
  /** `true` quando o tenant do link é a Sede (sem ancestral de torcida). */
  conviteDaSedeRaiz: boolean
}): { unidadeId: string | null; passoInicial: 'unidade' | 'vinculo' } {
  const { sedes, conviteDaSedeRaiz } = opts
  if (sedes.length === 0) {
    return { unidadeId: null, passoInicial: 'vinculo' }
  }
  if (sedes.length === 1) {
    return { unidadeId: sedes[0]!.id, passoInicial: 'vinculo' }
  }
  if (conviteDaSedeRaiz) {
    const raiz = sedes.find((s) => s.tipo === 'SEDE') ?? sedes[0]!
    return { unidadeId: raiz.id, passoInicial: 'vinculo' }
  }
  return { unidadeId: null, passoInicial: 'unidade' }
}

/**
 * Resolve o convite e monta o estado inicial do wizard. Retorna `null` quando
 * o slug não existe, o convite foi desativado, a torcida está inativa ou
 * nenhum clube é resolvível (próprio nem ancestral).
 */
export const resolverConvite = cache(
  async (slug: string): Promise<ConviteOnboarding | null> => {
    const termo = slug.trim()
    if (!termo) return null

    const tenant: TenantConviteRow | null = await db.tenant.findFirst({
      where: { conviteSlug: termo, conviteAtivo: true, ativo: true, sintetico: false },
      select: {
        id: true,
        slug: true,
        nome: true,
        logoUrl: true,
        corPrimaria: true,
        exigirDocumentosCadastro: true,
        afiliacaoId: true,
        torcidaConhecida: { select: { logoUrl: true, titulo: true } },
        _count: { select: { membros: { where: { status: 'APROVADO' } } } },
      },
    })
    if (!tenant) return null

    const ancestrais = await carregarAncestraisTorcida(tenant.id)
    const afiliacaoId =
      tenant.afiliacaoId ??
      ancestrais.find((a) => a.afiliacaoId)?.afiliacaoId ??
      null
    if (!afiliacaoId) return null

    const ancestralComLogo = ancestrais.find(
      (a) => a.torcidaConhecida?.logoUrl || a.logoUrl,
    )
    const torcidaMaeRow = ancestrais[0] ?? null
    const torcidaMae: TorcidaMaeConvite | null = torcidaMaeRow
      ? {
          id: torcidaMaeRow.id,
          nome: formatNomeTorcida(
            torcidaMaeRow.torcidaConhecida?.titulo ?? torcidaMaeRow.nome,
          ),
          logoUrl:
            torcidaMaeRow.torcidaConhecida?.logoUrl ?? torcidaMaeRow.logoUrl ?? null,
        }
      : null

    const [afiliacao, sedes, statsTorcida, statsClube, canalRestrito] = await Promise.all([
      db.afiliacao.findUnique({
        where: { id: afiliacaoId },
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
        },
      }),
      db.sede.findMany({
        where: { tenantId: tenant.id, ativa: true },
        select: SEDE_CONVITE_SELECT,
        orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      }) as Promise<SedeConviteRow[]>,
      calcularStatsTorcidasOnboarding([tenant.id]),
      calcularStatsClubesOnboarding([
        { canonicalId: afiliacaoId, afiliacaoIds: [afiliacaoId] },
      ]),
      isTenantRestrito(tenant.id),
    ])
    if (!afiliacao) return null

    const sedesOnboarding = sedes.map(mapSede)
    const raiz = sedesOnboarding.find((s) => s.tipo === 'SEDE') ?? sedesOnboarding[0] ?? null

    // Unidade Caso B quase nunca tem logo própria — usa a da Sede no card.
    const logoPropria = tenant.torcidaConhecida?.logoUrl ?? tenant.logoUrl
    const logoHerdada =
      ancestralComLogo?.torcidaConhecida?.logoUrl ?? ancestralComLogo?.logoUrl ?? null

    const clube: AfiliacaoOnboarding = {
      id: afiliacao.id,
      nome: formatNomeAfiliacao(afiliacao.nome),
      apelido: afiliacao.apelido,
      escudoUrl: afiliacao.escudoUrl,
      cidade: afiliacao.cidade,
      estado: afiliacao.estado,
      serie: afiliacao.serie as SerieCampeonato | null,
      torcedoresEstimados: afiliacao.torcedoresEstimados,
      torcedoresEstimadosFonte: afiliacao.torcedoresEstimadosFonte,
      torcedoresEstimadosTipo: afiliacao.torcedoresEstimadosTipo,
      stats: statsClube.get(afiliacao.id) ?? {
        sociosTotal: 0,
        sociosOnline: 0,
        torcedoresTotal: 0,
        torcedoresOnline: 0,
      },
    }

    const torcida: TorcidaOnboarding = {
      id: tenant.id,
      nome: formatNomeTorcida(tenant.torcidaConhecida?.titulo ?? tenant.nome),
      slug: tenant.slug,
      logoUrl: logoPropria ?? logoHerdada,
      corPrimaria: tenant.corPrimaria,
      membrosAprovados: tenant._count.membros,
      sedes: sedesOnboarding,
      stats: statsTorcida.get(tenant.id) ?? {
        sociosTotal: 0,
        sociosOnline: 0,
        torcedoresTotal: 0,
        torcedoresOnline: 0,
      },
      acessivelNoHost: torcidaAcessivelNoHost(tenant.slug),
      exigirDocumentosCadastro: tenant.exigirDocumentosCadastro,
    }

    const { unidadeId, passoInicial } = decidirPassoInicialConvite({
      sedes: sedesOnboarding,
      conviteDaSedeRaiz: torcidaMae === null,
    })

    return {
      conviteSlug: termo,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      canalRestrito,
      torcidaMae,
      clube,
      torcida,
      unidadeId,
      passoInicial,
      uf: raiz?.estado ?? afiliacao.estado ?? '',
      cidade: raiz?.cidade ?? afiliacao.cidade ?? '',
    }
  },
)
