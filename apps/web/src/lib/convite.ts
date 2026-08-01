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

export interface ConviteOnboarding {
  /** Slug opaco do link (`Tenant.conviteSlug`) — precisa sobreviver na URL do wizard. */
  conviteSlug: string
  tenantId: string
  tenantSlug: string
  /** A unidade convidada está com o canal restrito? Muda o texto da tela. */
  canalRestrito: boolean
  clube: AfiliacaoOnboarding
  torcida: TorcidaOnboarding
  /** Unidade sugerida (única do tenant convidado), quando houver só uma. */
  unidadeId: string | null
  /**
   * Onde o wizard abre. Com mais de uma unidade o passo Unidade continua
   * necessário — `solicitarVinculo` exige a escolha, e pular direto para o
   * Vínculo deixaria o usuário num beco sem saída ("Selecione sua unidade"
   * sem ter onde selecionar).
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

    // Unidade Caso B pode ter nascido sem espelhar o clube da Sede.
    const afiliacaoId = await resolverAfiliacaoIdEfetiva(tenant.id, tenant.afiliacaoId)
    if (!afiliacaoId) return null

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
      logoUrl: tenant.torcidaConhecida?.logoUrl ?? tenant.logoUrl,
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

    return {
      conviteSlug: termo,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      canalRestrito,
      clube,
      torcida,
      // Uma única unidade = escolha óbvia; várias, o usuário decide no passo.
      unidadeId: sedesOnboarding.length === 1 ? (sedesOnboarding[0]?.id ?? null) : null,
      passoInicial: sedesOnboarding.length > 1 ? 'unidade' : 'vinculo',
      uf: raiz?.estado ?? afiliacao.estado ?? '',
      cidade: raiz?.cidade ?? afiliacao.cidade ?? '',
    }
  },
)
