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
 * As duas condições de coluna que um tenant precisa cumprir para ser torcida —
 * a terceira (ser raiz) não cabe num `where` e sai de `filtrarTenantsRaiz`.
 *
 * Existe como constante para que **contar** e **listar** nunca divirjam: o card
 * "Uso do clube" do super-admin chegou a mostrar 7 nomes sob um KPI de 6 porque
 * a página remontou o filtro à mão e deixou passar o tenant suspenso
 * ("FIEL CUBATÃO", erro de registro do Corinthians).
 */
export const WHERE_TENANT_E_TORCIDA = { ativo: true, sintetico: false } as const

/**
 * Torcidas do clube na plataforma — **fonte única** de "quantas torcidas há".
 *
 * Uma torcida é um tenant que, ao mesmo tempo:
 * - é **raiz** (portal de unidade Caso B é unidade de uma torcida, não torcida);
 * - **não** é sintético (o container da Comunidade Nacional não é torcida);
 * - está **ativo** (tenant suspenso/erro de registro não é torcida do clube —
 *   não conta no KPI **e não aparece na lista**).
 *
 * Nunca contar `tenant.findMany({ afiliacaoId })` cru: o resultado infla com
 * unidades promovidas, com o container da CN e com tenants suspensos.
 */
export const listarTorcidasDoClube = cache(async function listarTorcidasDoClube(
  afiliacaoId: string,
): Promise<string[]> {
  const [tenants, maePorFilho]: [{ id: string }[], Map<string, string>] = await Promise.all([
    db.tenant.findMany({
      where: { afiliacaoId, ...WHERE_TENANT_E_TORCIDA },
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

/**
 * Ids dos tenants que **não** são torcida por serem portal de unidade (Caso B).
 *
 * Existe para que a regra "ser raiz" — a única das três que não cabia num
 * `where` — passe a caber: `{ id: { notIn: await listarTenantsNaoRaiz() } }`.
 * Sem isso, listar torcidas exige carregar TODOS os tenants para filtrar em
 * memória, e paginar no banco fica impossível.
 *
 * O conjunto é pequeno por construção (um id por promoção Caso B na
 * plataforma inteira), então o `notIn` não vira consulta patológica.
 */
export const listarTenantsNaoRaiz = cache(async function listarTenantsNaoRaiz(): Promise<
  string[]
> {
  const maePorFilho = await carregarMapaPortalMae()
  return [...maePorFilho.keys()]
})

/**
 * `where` completo de "este tenant é uma torcida" — **fonte única** de contar e
 * de listar, agora também para quem pagina no banco.
 *
 * Junta as duas condições de coluna (`WHERE_TENANT_E_TORCIDA`) com a terceira
 * (ser raiz). Quem monta o filtro à mão reproduz o bug do KPI que mostrava 557
 * onde a lista trazia 554: os portais Caso B contados como torcida.
 *
 * Devolve objeto **novo** a cada chamada de propósito — quem monta um `where`
 * costuma espalhar e completar o resultado, e um literal compartilhado por
 * `cache` viraria estado global de requisição. A consulta cara já está
 * memoizada em `listarTenantsNaoRaiz`.
 */
export async function whereTenantEhTorcida(): Promise<{
  ativo: true
  sintetico: false
  id?: { notIn: string[] }
}> {
  const naoRaiz = await listarTenantsNaoRaiz()
  return naoRaiz.length > 0
    ? { ...WHERE_TENANT_E_TORCIDA, id: { notIn: naoRaiz } }
    : { ...WHERE_TENANT_E_TORCIDA }
}
