import { db } from '@torcida/db'
import { formatNomeTorcida } from '@torcida/types'
import { getAncestorTenantIds, getTorcidaWorktree } from '@/lib/hierarquia'
import type { UnidadeOpcao } from '@/lib/torcida-labels'

function logoTenantRow(
  row: { logoUrl: string | null; torcidaConhecida: { logoUrl: string | null } | null },
): string | null {
  return row.torcidaConhecida?.logoUrl ?? row.logoUrl
}

/**
 * Worktree da raiz organizacional do tenant ativo, com slugs para o 3º select
 * do switcher de super-admin.
 */
export async function listarUnidadesParaSelecao(tenantId: string): Promise<UnidadeOpcao[]> {
  const ancestrais: string[] = await getAncestorTenantIds(tenantId)
  const rootTenantId = ancestrais.length > 0 ? ancestrais[ancestrais.length - 1] : tenantId
  const worktree = await getTorcidaWorktree(rootTenantId)

  if (worktree.length === 0) {
    const root: {
      slug: string
      nome: string
      logoUrl: string | null
      torcidaConhecida: { logoUrl: string | null } | null
    } | null = await db.tenant.findUnique({
      where: { id: rootTenantId },
      select: {
        slug: true,
        nome: true,
        logoUrl: true,
        torcidaConhecida: { select: { logoUrl: true } },
      },
    })
    if (!root) return []
    return [
      {
        id: `tenant-root:${rootTenantId}`,
        sedeId: null,
        tenantId: rootTenantId,
        tenantSlug: root.slug,
        nome: formatNomeTorcida(root.nome),
        tipo: 'SEDE',
        cidade: null,
        depth: 0,
        origem: 'tenant',
        logoUrl: logoTenantRow(root),
      },
    ]
  }

  const tenantIds = Array.from(new Set(worktree.map((n) => n.tenantId)))
  const sedeIds = Array.from(
    new Set(worktree.map((n) => n.sedeId).filter((id): id is string => Boolean(id))),
  )

  const [tenants, sedes]: [
    Array<{
      id: string
      slug: string
      logoUrl: string | null
      torcidaConhecida: { logoUrl: string | null } | null
    }>,
    Array<{ id: string; fotoUrl: string | null }>,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: {
        id: true,
        slug: true,
        logoUrl: true,
        torcidaConhecida: { select: { logoUrl: true } },
      },
    }),
    sedeIds.length > 0
      ? db.sede.findMany({
          where: { id: { in: sedeIds } },
          select: { id: true, fotoUrl: true },
        })
      : Promise.resolve([]),
  ])

  const slugPorId = new Map(tenants.map((t) => [t.id, t.slug]))
  const logoTenantPorId = new Map(tenants.map((t) => [t.id, logoTenantRow(t)]))
  const fotoSedePorId = new Map(sedes.map((s) => [s.id, s.fotoUrl]))

  const opcoes: UnidadeOpcao[] = []
  for (const n of worktree) {
    const slug = slugPorId.get(n.tenantId)
    if (!slug) continue
    const logoTenant = logoTenantPorId.get(n.tenantId) ?? null
    const logoUrl =
      n.origem === 'sede' && n.sedeId
        ? (fotoSedePorId.get(n.sedeId) ?? logoTenant)
        : logoTenant
    opcoes.push({
      id: n.key,
      sedeId: n.sedeId,
      tenantId: n.tenantId,
      tenantSlug: slug,
      // Worktree mistura Sede.nome (unidade física) e Tenant.nome (portal).
      nome: n.origem === 'tenant' ? formatNomeTorcida(n.nome) : n.nome,
      tipo: n.tipo,
      cidade: n.cidade,
      depth: n.depth,
      origem: n.origem,
      logoUrl,
    })
  }
  return opcoes
}
