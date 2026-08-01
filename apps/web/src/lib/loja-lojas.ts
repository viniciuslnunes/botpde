import { cache } from 'react'
import { db } from '@torcida/db'
import { formatNomeTorcida } from '@torcida/types'
import { listarVinculosAprovadosDoUsuario, type TorcidaOpcao } from '@/lib/tenant-context'
import { getAncestorTenantIds } from '@/lib/hierarquia'
import { getTenantsRestritos } from '@/lib/isolamento'

/**
 * IDs de tenant onde o usuário pode comprar: torcidas onde é `SaasMembro`
 * `APROVADO`/`SOCIO` (via `listarVinculosAprovadosDoUsuario`) mais a torcida
 * raiz de cada vínculo (a torcida principal sempre tem loja visível, mesmo
 * sem vínculo direto na Sede raiz — ex.: sócio de uma Subsede/PDE que também
 * é tenant próprio).
 */
export const tenantsPermitidosLoja = cache(async function tenantsPermitidosLoja(
  userId: string,
): Promise<Set<string>> {
  const [vinculos, restritos]: [TorcidaOpcao[], Set<string>] = await Promise.all([
    listarVinculosAprovadosDoUsuario(userId),
    getTenantsRestritos(),
  ])

  const ids = new Set<string>()
  for (const v of vinculos) {
    // R5 — a loja da unidade isolada continua para os membros dela; o que o
    // isolamento corta é a ponte com a loja da Sede (e a dela com o resto).
    if (restritos.has(v.id)) {
      ids.add(v.id)
      continue
    }
    ids.add(v.id)
    const ancestrais = await getAncestorTenantIds(v.id)
    const raiz = ancestrais.length > 0 ? ancestrais[ancestrais.length - 1] : v.id
    if (!restritos.has(raiz)) ids.add(raiz)
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
 * Lojas visíveis ao sócio: uma por tenant onde `tenantsPermitidosLoja` libera
 * acesso. `principal: true` marca a torcida raiz de algum vínculo do usuário
 * (destacada na listagem). Sem `unstable_cache` — depende de membership em
 * tempo real; dedup só via `cache()` do React por request.
 */
export const listLojasDoSocio = cache(async function listLojasDoSocio(
  userId: string,
): Promise<LojaResumo[]> {
  const [vinculos, permitidos] = await Promise.all([
    listarVinculosAprovadosDoUsuario(userId),
    tenantsPermitidosLoja(userId),
  ])

  const raizes = new Set<string>()
  for (const v of vinculos) {
    const ancestrais = await getAncestorTenantIds(v.id)
    raizes.add(ancestrais.length > 0 ? ancestrais[ancestrais.length - 1] : v.id)
  }

  const tenantIds = [...permitidos]
  if (tenantIds.length === 0) return []

  const [tenants, sedes, produtosPorTenant]: [
    Array<{ id: string; nome: string; logoUrl: string | null; corPrimaria: string }>,
    Array<{ tenantId: string | null; tipo: string; cidade: string | null }>,
    Array<{ tenantId: string; _count: { _all: number } }>,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: tenantIds }, ativo: true },
      select: { id: true, nome: true, logoUrl: true, corPrimaria: true },
    }),
    db.sede.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { tenantId: true, tipo: true, cidade: true },
    }),
    db.saasProduto.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: tenantIds }, ativo: true },
      _count: { _all: true },
    }),
  ])

  const sedeMap = new Map(sedes.filter((s) => s.tenantId).map((s) => [s.tenantId!, s]))
  const produtosMap = new Map(produtosPorTenant.map((p) => [p.tenantId, p._count._all]))

  const resumos: LojaResumo[] = tenants.map((t) => {
    const sede = sedeMap.get(t.id)
    return {
      tenantId: t.id,
      nome: formatNomeTorcida(t.nome),
      tipo: sede?.tipo ?? 'SEDE',
      cidade: sede?.cidade ?? null,
      logoUrl: t.logoUrl,
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
