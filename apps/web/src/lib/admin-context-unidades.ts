import { db } from '@torcida/db'
import { getAncestorTenantIds, getTorcidaWorktree } from '@/lib/hierarquia'
import type { UnidadeOpcao } from '@/lib/torcida-labels'

/**
 * Worktree da raiz organizacional do tenant ativo, com slugs para o 3º select
 * do switcher de super-admin.
 */
export async function listarUnidadesParaSelecao(tenantId: string): Promise<UnidadeOpcao[]> {
  const ancestrais: string[] = await getAncestorTenantIds(tenantId)
  const rootTenantId = ancestrais.length > 0 ? ancestrais[ancestrais.length - 1] : tenantId
  const worktree = await getTorcidaWorktree(rootTenantId)

  if (worktree.length === 0) {
    const root: { slug: string; nome: string } | null = await db.tenant.findUnique({
      where: { id: rootTenantId },
      select: { slug: true, nome: true },
    })
    if (!root) return []
    return [
      {
        id: `tenant-root:${rootTenantId}`,
        sedeId: null,
        tenantId: rootTenantId,
        tenantSlug: root.slug,
        nome: root.nome,
        tipo: 'SEDE',
        cidade: null,
        depth: 0,
        origem: 'tenant',
      },
    ]
  }

  const tenantIds = Array.from(new Set(worktree.map((n) => n.tenantId)))
  const tenants: { id: string; slug: string }[] = await db.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, slug: true },
  })
  const slugPorId = new Map(tenants.map((t) => [t.id, t.slug]))

  const opcoes: UnidadeOpcao[] = []
  for (const n of worktree) {
    const slug = slugPorId.get(n.tenantId)
    if (!slug) continue
    opcoes.push({
      id: n.key,
      sedeId: n.sedeId,
      tenantId: n.tenantId,
      tenantSlug: slug,
      nome: n.nome,
      tipo: n.tipo,
      cidade: n.cidade,
      depth: n.depth,
      origem: n.origem,
    })
  }
  return opcoes
}
