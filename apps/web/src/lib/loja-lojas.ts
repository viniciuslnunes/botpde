import { cache } from 'react'
import { db } from '@torcida/db'
import {
  calculateEffectivePermissions,
  formatNomeTorcida,
  hasPermission,
  PERMISSIONS,
  resolveLojaVitrine,
  resolverCapaLoja,
} from '@torcida/types'
import {
  getAlliedTenantIds,
  getAncestorTenantIds,
  getDescendantTenantIds,
  getVisibleTenantIds,
} from '@/lib/hierarquia'
import { getTenantsRestritos } from '@/lib/isolamento'
import { getUserPermissionsInTenant, resolveTenantLogoUrl, getActiveTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import { escoparLojaAoPortalAtivo, blocoLoja, compararLojasListagem, type EscopoLoja } from '@/lib/loja-escopo'

/**
 * Tenants com vínculo APROVADO que liberam a loja: sócio (qualquer registro,
 * incl. espelho) **ou** torcedor canônico (`espelhado: false` — unidade/sede
 * do convite). Não reusa `listarVinculosAprovadosDoUsuario` (só SOCIO / seletor
 * de contexto).
 */
const listarTenantIdsComAcessoLoja = cache(async function listarTenantIdsComAcessoLoja(
  userId: string,
): Promise<string[]> {
  const rows: { tenantId: string }[] = await db.saasMembro.findMany({
    where: {
      userId,
      status: 'APROVADO',
      OR: [{ tipo: 'SOCIO' }, { tipo: 'TORCEDOR', espelhado: false }],
      tenant: { ativo: true, sintetico: false },
    },
    select: { tenantId: true },
    orderBy: { criadoEm: 'desc' },
  })
  const vistos = new Set<string>()
  const ids: string[] = []
  for (const row of rows) {
    if (vistos.has(row.tenantId)) continue
    vistos.add(row.tenantId)
    ids.push(row.tenantId)
  }
  return ids
})

/**
 * União de vínculos + ponte da Sede (`lojaVisivelNasUnidades`). Só usada
 * quando não há portal ativo (torcedor na Comunidade Nacional).
 */
async function tenantsPorVinculo(userId: string): Promise<Set<string>> {
  const [vinculoIds, restritos]: [string[], Set<string>] = await Promise.all([
    listarTenantIdsComAcessoLoja(userId),
    getTenantsRestritos(),
  ])

  const ids = new Set<string>()
  const raizesPendentes = new Set<string>()

  for (const tenantId of vinculoIds) {
    if (restritos.has(tenantId)) {
      ids.add(tenantId)
      continue
    }
    ids.add(tenantId)
    const ancestrais = await getAncestorTenantIds(tenantId)
    const raiz = ancestrais.length > 0 ? ancestrais[ancestrais.length - 1] : tenantId
    if (raiz !== tenantId && !restritos.has(raiz)) {
      raizesPendentes.add(raiz)
    }
  }

  if (raizesPendentes.size > 0) {
    const liberadas: { id: string }[] = await db.tenant.findMany({
      where: {
        id: { in: [...raizesPendentes] },
        lojaVisivelNasUnidades: true,
      },
      select: { id: true },
    })
    for (const t of liberadas) ids.add(t.id)
  }

  return ids
}

const resolverEscopoLoja = cache(async function resolverEscopoLoja(
  userId: string,
  email?: string | null,
): Promise<EscopoLoja & { raizId: string | null; worktreeIds: Set<string>; aliadosIds: Set<string> }> {
  const [vinculoIds, ativo]: [string[], Awaited<ReturnType<typeof getActiveTenant>>] =
    await Promise.all([listarTenantIdsComAcessoLoja(userId), getActiveTenant(userId, email)])

  if (!ativo) {
    const porVinculo = await tenantsPorVinculo(userId)
    return {
      visiveis: porVinculo,
      comprar: new Set(porVinculo),
      raizId: null,
      worktreeIds: new Set(),
      aliadosIds: new Set(),
    }
  }

  const [ancestrais, descendentes, visiveisDoAtivo, aliadosDoAtivo]: [
    string[],
    string[],
    string[],
    string[],
  ] = await Promise.all([
    getAncestorTenantIds(ativo.id),
    getDescendantTenantIds(ativo.id),
    getVisibleTenantIds(ativo.id, 'loja'),
    getAlliedTenantIds(ativo.id),
  ])

  const raizDaCadeia = ancestrais[ancestrais.length - 1]
  const raizId = raizDaCadeia ?? ativo.id
  const worktreeIds = new Set([ativo.id, ...ancestrais, ...descendentes])

  const [socioRow, raizRow]: [{ id: string } | null, { lojaVisivelNasUnidades: boolean } | null] =
    await Promise.all([
      db.saasMembro.findFirst({
        where: {
          userId,
          status: 'APROVADO',
          tipo: 'SOCIO',
          tenantId: { in: [...worktreeIds] },
        },
        select: { id: true },
      }),
      db.tenant.findFirst({
        where: { id: raizId },
        select: { lojaVisivelNasUnidades: true },
      }),
    ])
  const socioNaWorktree = socioRow !== null

  const escopo = escoparLojaAoPortalAtivo({
    vinculoIds,
    ativoId: ativo.id,
    worktreeIds: [...worktreeIds],
    visiveisDoAtivo,
    aliadosDoAtivo,
    raizId,
    socioNaWorktree,
    isSuperAdmin: isSuperAdminEmail(email),
    lojaVisivelNasUnidades: raizRow?.lojaVisivelNasUnidades !== false,
  })

  return { ...escopo, raizId, worktreeIds, aliadosIds: new Set(aliadosDoAtivo) }
})

/**
 * IDs de tenant onde o usuário pode **comprar**: vínculo na família do portal
 * ativo (ou ponte da Sede). Super-admin operador lê o catálogo sem comprar.
 */
export const tenantsPermitidosLoja = cache(async function tenantsPermitidosLoja(
  userId: string,
  email?: string | null,
): Promise<Set<string>> {
  return (await resolverEscopoLoja(userId, email)).comprar
})

/**
 * IDs de tenant cuja vitrine o portal pode **mostrar**: worktree do tenant
 * ativo + aliados se sócio. Super-admin no modo operador vê a família que
 * está operando, nunca a união de vínculos de outras torcidas.
 */
export const tenantsVisiveisLoja = cache(async function tenantsVisiveisLoja(
  userId: string,
  email?: string | null,
): Promise<Set<string>> {
  return (await resolverEscopoLoja(userId, email)).visiveis
})

/**
 * Leitura da vitrine no portal. Recorte pelo tenant ativo — Super Admin
 * troca de canal, mas não leva o catálogo da torcida-casa junto.
 */
export async function podeVerLojaTenant(
  userId: string,
  tenantId: string,
  email?: string | null,
): Promise<boolean> {
  const visiveis = await tenantsVisiveisLoja(userId, email)
  return visiveis.has(tenantId)
}

export interface LojaResumo {
  tenantId: string
  nome: string
  tipo: string
  cidade: string | null
  logoUrl: string | null
  corPrimaria: string
  principal: boolean
  totalProdutos: number
  /** Capa visível (banner próprio ou fallback do produto em destaque). */
  capaUrl: string | null
  /** True quando `design.loja.bannerUrl` está gravado — dá para excluir no hover. */
  capaCustom: boolean
}

/**
 * Quem pode editar a vitrine desta loja: `store:manage` efetivo no tenant
 * (gestor de Materiais/Loja, owner/admin/vice, override) ou super-admin
 * **no portal que está operando** (não em rival listada por engano).
 * Nunca por nome de cargo. Não exige `SaasMembro` — Super Admin em torcida
 * sem presidente (Camisa 12 e similares) gerencia a capa/produtos da loja.
 */
export async function podeGerirLoja(
  userId: string,
  tenantId: string,
  email?: string | null,
): Promise<boolean> {
  const visiveis = await tenantsVisiveisLoja(userId, email)
  if (!visiveis.has(tenantId)) return false
  if (isSuperAdminEmail(email)) return true
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)
  return hasPermission(effective, PERMISSIONS.STORE_MANAGE)
}

/**
 * Lojas visíveis no portal ativo: worktree da torcida (sede + unidades) e
 * aliadas se sócio. `principal: true` marca a raiz **do portal**, não a
 * torcida-casa de outro vínculo.
 */
export const listLojasDoSocio = cache(async function listLojasDoSocio(
  userId: string,
  email?: string | null,
): Promise<LojaResumo[]> {
  const escopo = await resolverEscopoLoja(userId, email)
  const tenantIds = [...escopo.visiveis]
  if (tenantIds.length === 0) return []

  const [tenants, sedes, produtosPorTenant, destaques]: [
    Array<{
      id: string
      nome: string
      logoUrl: string | null
      corPrimaria: string
      design: unknown
    }>,
    Array<{
      id: string
      tenantId: string | null
      sedeId: string | null
      tipo: string
      cidade: string | null
    }>,
    Array<{ tenantId: string; _count: { _all: number } }>,
    Array<{ tenantId: string; imagensUrl: string[] }>,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: tenantIds }, ativo: true },
      select: { id: true, nome: true, logoUrl: true, corPrimaria: true, design: true },
    }),
    db.sede.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { id: true, tenantId: true, sedeId: true, tipo: true, cidade: true },
    }),
    db.saasProduto.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: tenantIds }, ativo: true },
      _count: { _all: true },
    }),
    db.saasProduto.findMany({
      where: { tenantId: { in: tenantIds }, ativo: true, destaque: true },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
      select: { tenantId: true, imagensUrl: true },
    }),
  ])

  const logos = await Promise.all(
    tenants.map((t) => resolveTenantLogoUrl(t.id, t.logoUrl)),
  )
  const logoPorTenant = new Map(tenants.map((t, i) => [t.id, logos[i] ?? null]))

  const sedeMap = new Map<string, { tipo: string; cidade: string | null }>()
  const sedesPorTenant = new Map<string, typeof sedes>()
  for (const s of sedes) {
    if (!s.tenantId) continue
    const list = sedesPorTenant.get(s.tenantId) ?? []
    list.push(s)
    sedesPorTenant.set(s.tenantId, list)
  }
  for (const [tenantId, list] of sedesPorTenant) {
    const ids = new Set(list.map((s) => s.id))
    const raiz = list.find((s) => !s.sedeId || !ids.has(s.sedeId)) ?? list[0]
    if (raiz) sedeMap.set(tenantId, { tipo: raiz.tipo, cidade: raiz.cidade })
  }

  const produtosMap = new Map(produtosPorTenant.map((p) => [p.tenantId, p._count._all]))

  const destaqueImgPorTenant = new Map<string, string>()
  for (const p of destaques) {
    if (destaqueImgPorTenant.has(p.tenantId)) continue
    const url = firstProdutoImagemUrl(p.imagensUrl)
    if (url) destaqueImgPorTenant.set(p.tenantId, url)
  }

  const resumos: LojaResumo[] = tenants.map((t) => {
    const sede = sedeMap.get(t.id)
    const vitrine = resolveLojaVitrine(t.design, t.corPrimaria)
    const capa = resolverCapaLoja(vitrine, destaqueImgPorTenant.get(t.id) ?? null)
    return {
      tenantId: t.id,
      nome: formatNomeTorcida(t.nome),
      tipo: sede?.tipo ?? 'SEDE',
      cidade: sede?.cidade ?? null,
      logoUrl: logoPorTenant.get(t.id) ?? null,
      corPrimaria: t.corPrimaria,
      principal: escopo.raizId === t.id,
      totalProdutos: produtosMap.get(t.id) ?? 0,
      capaUrl: capa.capaUrl,
      capaCustom: capa.capaCustom,
    }
  })

  const blocoPorTenant = new Map(
    resumos.map((l) => [
      l.tenantId,
      blocoLoja({
        tenantId: l.tenantId,
        raizId: escopo.raizId,
        worktreeIds: escopo.worktreeIds,
        aliadosIds: escopo.aliadosIds,
      }),
    ]),
  )

  resumos.sort((a, b) =>
    compararLojasListagem(
      {
        tenantId: a.tenantId,
        nome: a.nome,
        tipo: a.tipo,
        bloco: blocoPorTenant.get(a.tenantId) ?? 'unidade',
      },
      {
        tenantId: b.tenantId,
        nome: b.nome,
        tipo: b.tipo,
        bloco: blocoPorTenant.get(b.tenantId) ?? 'unidade',
      },
    ),
  )

  return resumos
})
