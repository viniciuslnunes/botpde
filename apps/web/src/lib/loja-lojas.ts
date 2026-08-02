import { cache } from 'react'
import { db } from '@torcida/db'
import { formatNomeTorcida } from '@torcida/types'
import { getAncestorTenantIds } from '@/lib/hierarquia'
import { getTenantsRestritos } from '@/lib/isolamento'
import { resolveTenantLogoUrl } from '@/lib/tenant'

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
 * IDs de tenant onde o usuário pode comprar: vínculos APROVADO (sócio ou
 * torcedor do convite) mais a torcida raiz de cada vínculo — **só** quando a
 * Sede liberou `lojaVisivelNasUnidades` (default true). Canal restrito: só a
 * própria unidade.
 */
export const tenantsPermitidosLoja = cache(async function tenantsPermitidosLoja(
  userId: string,
): Promise<Set<string>> {
  const [vinculoIds, restritos]: [string[], Set<string>] = await Promise.all([
    listarTenantIdsComAcessoLoja(userId),
    getTenantsRestritos(),
  ])

  const ids = new Set<string>()
  const raizesPendentes = new Set<string>()

  for (const tenantId of vinculoIds) {
    // R5 — a loja da unidade isolada continua para os membros dela; o que o
    // isolamento corta é a ponte com a loja da Sede (e a dela com o resto).
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
})

export interface LojaResumo {
  tenantId: string
  nome: string
  tipo: string
  cidade: string | null
  logoUrl: string | null
  corPrimaria: string
  principal: boolean
  totalProdutos: number
}

/**
 * Lojas visíveis ao membro (sócio ou torcedor do convite): uma por tenant onde
 * `tenantsPermitidosLoja` libera acesso. `principal: true` marca a torcida raiz
 * de algum vínculo. Sem `unstable_cache` — depende de membership em tempo real;
 * dedup só via `cache()` do React por request.
 */
export const listLojasDoSocio = cache(async function listLojasDoSocio(
  userId: string,
): Promise<LojaResumo[]> {
  const [vinculoIds, permitidos] = await Promise.all([
    listarTenantIdsComAcessoLoja(userId),
    tenantsPermitidosLoja(userId),
  ])

  const raizes = new Set<string>()
  for (const tenantId of vinculoIds) {
    const ancestrais = await getAncestorTenantIds(tenantId)
    raizes.add(ancestrais.length > 0 ? ancestrais[ancestrais.length - 1] : tenantId)
  }

  const tenantIds = [...permitidos]
  if (tenantIds.length === 0) return []

  const [tenants, sedes, produtosPorTenant]: [
    Array<{ id: string; nome: string; logoUrl: string | null; corPrimaria: string }>,
    Array<{
      id: string
      tenantId: string | null
      sedeId: string | null
      tipo: string
      cidade: string | null
    }>,
    Array<{ tenantId: string; _count: { _all: number } }>,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: tenantIds }, ativo: true },
      select: { id: true, nome: true, logoUrl: true, corPrimaria: true },
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
  ])

  // PDE/subsede: logo vive em Sede.fotoUrl / canal — não em Tenant.logoUrl.
  const logos = await Promise.all(
    tenants.map((t) => resolveTenantLogoUrl(t.id, t.logoUrl)),
  )
  const logoPorTenant = new Map(tenants.map((t, i) => [t.id, logos[i] ?? null]))

  // Preferir a sede raiz do tenant (mesma regra de resolveTenantLogoUrl).
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

  const resumos: LojaResumo[] = tenants.map((t) => {
    const sede = sedeMap.get(t.id)
    return {
      tenantId: t.id,
      nome: formatNomeTorcida(t.nome),
      tipo: sede?.tipo ?? 'SEDE',
      cidade: sede?.cidade ?? null,
      logoUrl: logoPorTenant.get(t.id) ?? null,
      corPrimaria: t.corPrimaria,
      principal: raizes.has(t.id),
      totalProdutos: produtosMap.get(t.id) ?? 0,
    }
  })

  resumos.sort((a, b) => {
    if (a.principal !== b.principal) return a.principal ? -1 : 1
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })

  return resumos
})
