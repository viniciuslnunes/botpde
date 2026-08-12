import 'server-only'

import { cache } from 'react'

import { db } from '@torcida/db'

/**
 * Hierarquia torcida-raiz × portal de unidade (Caso B) na plataforma.
 *
 * Um portal Caso B é a Sede da unidade cujo `tenant_id` difere do
 * `tenant_id` da Sede mãe (`sede_id`). Tenant que aparece como `filho` NÃO
 * é torcida — é unidade promovida. Leitura estrutural: nunca gateada por
 * canal restrito (ARCHITECTURE §5.13).
 */

export type PortalMaeRow = { filho: string; mae: string }

/**
 * Mapa `tenantId do portal (filho) → tenantId da torcida-mãe`.
 * Um par por portal Caso B; leitura leve (só ids).
 */
export async function carregarMapaPortalMae(): Promise<Map<string, string>> {
  const rows: PortalMaeRow[] = await db.$queryRaw`
    SELECT DISTINCT s.tenant_id AS filho, pai.tenant_id AS mae
    FROM saas_sedes s
    INNER JOIN saas_sedes pai ON pai.id = s.sede_id
    WHERE s.tenant_id IS NOT NULL
      AND pai.tenant_id IS NOT NULL
      AND s.tenant_id <> pai.tenant_id
  `
  return new Map(rows.map((r) => [r.filho, r.mae]))
}

/**
 * Ids que NÃO estão no mapa como filho — torcidas-raiz (ou tenants sem
 * promoção Caso B). Preserva a ordem de `ids`.
 */
export function filtrarTenantsRaiz(
  ids: string[],
  maePorFilho: Map<string, string>,
): string[] {
  return ids.filter((id) => !maePorFilho.has(id))
}

/**
 * Torcidas do clube na plataforma — **fonte única** de "quantas torcidas há".
 *
 * Uma torcida é um tenant que, ao mesmo tempo:
 * - é **raiz** (portal de unidade Caso B é unidade de uma torcida, não torcida);
 * - **não** é sintético (o container da Comunidade Nacional não é torcida);
 * - está **ativo** (tenant suspenso/erro de registro não conta).
 *
 * Nunca contar `tenant.findMany({ afiliacaoId })` cru: o resultado infla com
 * unidades promovidas, com o container da CN e com tenants suspensos.
 */
export const listarTorcidasDoClube = cache(async function listarTorcidasDoClube(
  afiliacaoId: string,
): Promise<string[]> {
  const [tenants, maePorFilho]: [{ id: string }[], Map<string, string>] = await Promise.all([
    db.tenant.findMany({
      where: { afiliacaoId, ativo: true, sintetico: false },
      select: { id: true },
      orderBy: { nome: 'asc' },
    }),
    carregarMapaPortalMae(),
  ])
  return filtrarTenantsRaiz(
    tenants.map((t) => t.id),
    maePorFilho,
  )
})

/** Resolve a raiz de um tenant (ele próprio se não for portal filho). */
export function paraTenantRaiz(
  tenantId: string,
  maePorFilho: Map<string, string>,
): string {
  return maePorFilho.get(tenantId) ?? tenantId
}
