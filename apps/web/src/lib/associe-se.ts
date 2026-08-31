import { cache } from 'react'
import { db } from '@torcida/db'
import {
  avaliarAssociacaoNaTorcida,
  estadoCtaAssocieSe,
  parseRegiaoOnboarding,
  MENSAGEM_BLOQUEIO_ASSOCIACAO,
} from '@torcida/types/associe-se'
import { getTorcidasPorAfiliacao, type TorcidaOnboarding } from '@/lib/onboarding'
import { getAncestorTenantIds } from '@/lib/hierarquia'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { isTenantRestrito } from '@/lib/isolamento'
import { formatNomeAfiliacao } from '@torcida/types'
import { regiaoDaUf, type RegiaoBrasilId } from '@/lib/regioes-brasil'

export { MENSAGEM_BLOQUEIO_ASSOCIACAO }

type VinculoCanonico = {
  tenantId: string
  raizId: string
  tipo: string
  status: string
  espelhado: boolean
  desligadoEm: Date | null
  tenantSlug: string
}

async function resolverRaizId(tenantId: string): Promise<string> {
  const ancestrais: string[] = await getAncestorTenantIds(tenantId)
  return ancestrais.length > 0 ? ancestrais[ancestrais.length - 1]! : tenantId
}

export const listarVinculosCanonicosDoUsuario = cache(
  async function listarVinculosCanonicosDoUsuario(userId: string): Promise<VinculoCanonico[]> {
    type Row = {
      tenantId: string
      tipo: string
      status: string
      espelhado: boolean
      desligadoEm: Date | null
      tenant: { slug: string }
    }
    const rows: Row[] = await db.saasMembro.findMany({
      where: {
        userId,
        espelhado: false,
        desligadoEm: null,
        status: { in: ['APROVADO', 'PENDENTE'] },
        tipo: { in: ['SOCIO', 'TORCEDOR'] },
      },
      select: {
        tenantId: true,
        tipo: true,
        status: true,
        espelhado: true,
        desligadoEm: true,
        tenant: { select: { slug: true } },
      },
    })

    const raizes = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        raizId: await resolverRaizId(r.tenantId),
      })),
    )
    return raizes.map((r) => ({
      tenantId: r.tenantId,
      raizId: r.raizId,
      tipo: r.tipo,
      status: r.status,
      espelhado: r.espelhado,
      desligadoEm: r.desligadoEm,
      tenantSlug: r.tenant.slug,
    }))
  },
)

export async function torcidaTemLiderancaReal(tenantId: string): Promise<boolean> {
  const owners: Array<{ user: { email: string | null } }> = await db.userRole.findMany({
    where: { tenantId, role: { isSystem: true, nome: 'owner' } },
    select: { user: { select: { email: true } } },
  })
  return owners.some((o) => !isSuperAdminEmail(o.user.email))
}

async function idsComLiderancaReal(tenantIds: string[]): Promise<Set<string>> {
  if (tenantIds.length === 0) return new Set()
  const owners: Array<{ tenantId: string; user: { email: string | null } }> =
    await db.userRole.findMany({
      where: { tenantId: { in: tenantIds }, role: { isSystem: true, nome: 'owner' } },
      select: { tenantId: true, user: { select: { email: true } } },
    })
  const comLideranca = new Set<string>()
  for (const o of owners) {
    if (!isSuperAdminEmail(o.user.email)) comLideranca.add(o.tenantId)
  }
  return comLideranca
}

export async function avaliarBloqueioNovaAssociacao(
  userId: string,
  tenantDestinoId: string,
): Promise<ReturnType<typeof avaliarAssociacaoNaTorcida>> {
  const [vinculos, destinoRaizId] = await Promise.all([
    listarVinculosCanonicosDoUsuario(userId),
    resolverRaizId(tenantDestinoId),
  ])
  return avaliarAssociacaoNaTorcida(destinoRaizId, vinculos)
}

export type CtaAssocieSeNavbar = {
  href: string
  label: string
  pendente: boolean
}

export const resolverCtaAssocieSeNavbar = cache(
  async function resolverCtaAssocieSeNavbar(userId: string): Promise<CtaAssocieSeNavbar | null> {
    const perfil: { afiliacaoId: string | null } | null = await db.perfilTorcedor.findUnique({
      where: { userId },
      select: { afiliacaoId: true },
    })
    if (!perfil?.afiliacaoId) return null
    const vinculos = await listarVinculosCanonicosDoUsuario(userId)
    const cta = estadoCtaAssocieSe(vinculos)
    if (!cta.mostrar) return null
    if (cta.modo === 'pendente') {
      const pendente = vinculos.find((v) => v.tipo === 'SOCIO' && v.status === 'PENDENTE')
      const slug = pendente?.tenantSlug
      return {
        href: slug
          ? `/onboarding/solicitado?torcida=${encodeURIComponent(slug)}`
          : '/onboarding/solicitado',
        label: 'Solicitação enviada',
        pendente: true,
      }
    }
    return { href: '/portal/associe-se', label: 'Associe-se', pendente: false }
  },
)

export type AssocieSeClube = {
  id: string
  nome: string
  apelido: string | null
  escudoUrl: string | null
}

export type TorcidaAssocieSe = TorcidaOnboarding & { temLideranca: boolean }

export type AssocieSePagina = {
  clube: AssocieSeClube
  uf: string
  cidade: string
  regiaoId: RegiaoBrasilId | null
  torcidas: TorcidaAssocieSe[]
  podeAssociar: boolean
  modo: 'descobrir' | 'upgrade' | 'vitrine'
  torcidaTravadaId: string | null
  aviso: string | null
}

export const carregarPaginaAssocieSe = cache(
  async function carregarPaginaAssocieSe(userId: string): Promise<AssocieSePagina | null> {
    const perfil: {
      afiliacaoId: string | null
      regiao: string | null
      afiliacao: {
        id: string
        nome: string
        apelido: string | null
        escudoUrl: string | null
      } | null
    } | null = await db.perfilTorcedor.findUnique({
      where: { userId },
      select: {
        afiliacaoId: true,
        regiao: true,
        afiliacao: { select: { id: true, nome: true, apelido: true, escudoUrl: true } },
      },
    })
    if (!perfil?.afiliacaoId || !perfil.afiliacao) return null

    const { cidade, uf } = parseRegiaoOnboarding(perfil.regiao)
    const vinculos = await listarVinculosCanonicosDoUsuario(userId)
    const cta = estadoCtaAssocieSe(vinculos)

    const todas = await getTorcidasPorAfiliacao(perfil.afiliacaoId)
    const lideranca = await idsComLiderancaReal(todas.map((t) => t.id))
    const comFlag: TorcidaAssocieSe[] = todas
      .map((t) => ({
        ...t,
        temLideranca: lideranca.has(t.id),
      }))
      .sort((a, b) => Number(b.temLideranca) - Number(a.temLideranca))

    const torcidaTravadaId =
      cta.modo === 'upgrade' || cta.modo === 'pendente' ? cta.raizId : null
    const torcidas =
      torcidaTravadaId != null
        ? comFlag.filter((t) => t.id === torcidaTravadaId)
        : comFlag

    const podeAssociar = cta.modo === 'descobrir' || cta.modo === 'upgrade'
    let aviso: string | null = null
    if (cta.modo === 'oculto') {
      aviso = 'Você já é sócio. Dá para ver as organizadas do seu clube, sem novo pedido.'
    } else if (cta.modo === 'pendente') {
      aviso = MENSAGEM_BLOQUEIO_ASSOCIACAO.pendente
    } else if (cta.modo === 'upgrade') {
      aviso = 'Você já tem canal nesta torcida pelo convite. Aqui é o pedido de associação (sócio).'
    }

    return {
      clube: {
        id: perfil.afiliacao.id,
        nome: formatNomeAfiliacao(perfil.afiliacao.nome),
        apelido: perfil.afiliacao.apelido
          ? formatNomeAfiliacao(perfil.afiliacao.apelido)
          : null,
        escudoUrl: perfil.afiliacao.escudoUrl,
      },
      uf,
      cidade,
      regiaoId: uf ? regiaoDaUf(uf) : null,
      torcidas,
      podeAssociar,
      modo:
        cta.modo === 'descobrir' || cta.modo === 'upgrade' ? cta.modo : 'vitrine',
      torcidaTravadaId,
      aviso,
    }
  },
)

/**
 * Resolve o deep-link do mapa → ficha de sócio. Falha se a torcida não é
 * do clube da pessoa, não é elegível, ou a associação está bloqueada.
 */
export async function resolverDeepLinkAssocieSe(
  userId: string,
  tenantId: string,
  sedeId: string | null,
): Promise<{ ok: true; dados: { torcida: TorcidaOnboarding; unidadeId: string | null; uf: string; cidade: string; clubeId: string } } | { ok: false; message: string }> {
  const pagina = await carregarPaginaAssocieSe(userId)
  if (!pagina) return { ok: false, message: 'Conclua o onboarding do clube antes de se associar.' }

  const torcida = pagina.torcidas.find((t) => t.id === tenantId)
  if (!torcida) {
    return { ok: false, message: 'Esta torcida não está disponível para associação no seu clube.' }
  }

  const bloqueio = await avaliarBloqueioNovaAssociacao(userId, tenantId)
  if (!bloqueio.ok) {
    return { ok: false, message: MENSAGEM_BLOQUEIO_ASSOCIACAO[bloqueio.motivo] }
  }

  const temLideranca = await torcidaTemLiderancaReal(tenantId)
  if (!temLideranca) {
    return { ok: false, message: MENSAGEM_BLOQUEIO_ASSOCIACAO.sem_lideranca }
  }

  if (await isTenantRestrito(tenantId)) {
    return { ok: false, message: 'Esta unidade entra só pelo link de convite.' }
  }

  let unidadeId = sedeId
  if (unidadeId && !torcida.sedes.some((s) => s.id === unidadeId)) {
    return { ok: false, message: 'Unidade inválida para esta torcida.' }
  }
  if (!unidadeId && torcida.sedes.length === 1) {
    unidadeId = torcida.sedes[0]!.id
  }

  return {
    ok: true,
    dados: {
      torcida,
      unidadeId,
      uf: pagina.uf,
      cidade: pagina.cidade,
      clubeId: pagina.clube.id,
    },
  }
}
