import { db } from '@torcida/db'
import { canViewRecurso, type RECURSO_SENSIBILIDADE } from '@torcida/types'

export type TenantRelation = 'self' | 'ancestor' | 'descendant' | 'unrelated'

interface SedeNode {
  id: string
  tenantId: string | null
  sedeId: string | null
}

/**
 * Verifica se atribuir `candidatoPaiId` como sede-pai de `sedeId` criaria um
 * ciclo na árvore (o candidato ser a própria sede, ou uma descendente dela).
 * Usar antes de gravar qualquer mudança em `Sede.sedeId` — sem essa
 * checagem, um ciclo trava para sempre qualquer código que percorra a
 * árvore (getTenantRelation, getTenantHierarquia).
 */
export async function wouldCreateSedeCycle(sedeId: string, candidatoPaiId: string): Promise<boolean> {
  if (sedeId === candidatoPaiId) return true

  const filhos: { id: string }[] = await db.sede.findMany({
    where: { sedeId },
    select: { id: true },
  })

  for (const filho of filhos) {
    if (await wouldCreateSedeCycle(filho.id, candidatoPaiId)) return true
  }
  return false
}

/**
 * Sobe a árvore de Sede a partir de um nó, retornando a cadeia de IDs de
 * tenant dos ancestrais (do mais próximo ao mais distante). Pula nós sem
 * tenantId (sede-mãe que ainda não aderiu à plataforma).
 */
async function ancestorTenantIds(sede: SedeNode): Promise<string[]> {
  const ids: string[] = []
  let atual: SedeNode | null = sede

  // Sedes formam uma árvore rasa na prática (sede > subsede > pde) — um
  // teto defensivo evita loop infinito caso surja um ciclo por engano.
  for (let i = 0; i < 10 && atual?.sedeId; i++) {
    const pai: SedeNode | null = await db.sede.findUnique({
      where: { id: atual.sedeId },
      select: { id: true, tenantId: true, sedeId: true },
    })
    if (!pai) break
    if (pai.tenantId) ids.push(pai.tenantId)
    atual = pai
  }

  return ids
}

/**
 * Desce a árvore de Sede a partir de um nó, retornando os IDs de tenant de
 * todos os descendentes (subsedes/PDEs), recursivamente.
 *
 * `visitados` protege contra ciclo (ex: editarSede não valida hoje que a
 * sede-pai escolhida não seja uma descendente da própria sede — ver nota em
 * ARCHITECTURE.md). Sem isso, um ciclo na árvore causaria recursão infinita.
 */
async function descendantTenantIds(sedeId: string, visitados: Set<string> = new Set()): Promise<string[]> {
  if (visitados.has(sedeId)) return []
  visitados.add(sedeId)

  const filhos: SedeNode[] = await db.sede.findMany({
    where: { sedeId },
    select: { id: true, tenantId: true, sedeId: true },
  })

  const ids: string[] = []
  for (const filho of filhos) {
    if (filho.tenantId) ids.push(filho.tenantId)
    ids.push(...(await descendantTenantIds(filho.id, visitados)))
  }
  return ids
}

/**
 * Cadeia completa de tenants ancestrais de um tenant, do mais próximo ao
 * mais distante (ex: PDE → [Subsede, Sede]). Ao contrário de
 * `getTenantHierarquia` (que só expõe o ancestral mais próximo, para a tela
 * `/admin/hierarquia`), esta função devolve a árvore inteira — necessária
 * para cascatear conteúdo institucional (comunicados/eventos) através de 2+
 * níveis de hierarquia.
 */
export async function getAncestorTenantIds(tenantId: string): Promise<string[]> {
  const sede: SedeNode | null = await db.sede.findFirst({
    where: { tenantId },
    select: { id: true, tenantId: true, sedeId: true },
  })
  if (!sede) return []

  return ancestorTenantIds(sede)
}

/**
 * Determina a relação entre dois tenants na árvore de Sede: o próprio, um
 * ancestral (sede-mãe), um descendente (subsede/PDE), ou sem relação.
 * Retorna "unrelated" também quando algum dos dois tenants não está
 * vinculado a nenhuma Sede (ex: tenant criado sem hierarquia).
 */
export async function getTenantRelation(
  actorTenantId: string,
  targetTenantId: string,
): Promise<TenantRelation> {
  if (actorTenantId === targetTenantId) return 'self'

  const actorSede: SedeNode | null = await db.sede.findFirst({
    where: { tenantId: actorTenantId },
    select: { id: true, tenantId: true, sedeId: true },
  })
  if (!actorSede) return 'unrelated'

  const [ancestrais, descendentes] = await Promise.all([
    ancestorTenantIds(actorSede),
    descendantTenantIds(actorSede.id),
  ])

  if (ancestrais.includes(targetTenantId)) return 'ancestor'
  if (descendentes.includes(targetTenantId)) return 'descendant'
  return 'unrelated'
}

/**
 * Atalho: `actorTenantId` pode ver o recurso `recurso` de `targetTenantId`?
 * Combina a relação na árvore de Sede com a sensibilidade do recurso
 * (ver RECURSO_SENSIBILIDADE em packages/types/src/visibility.js).
 */
export async function resolveVisibility(
  actorTenantId: string,
  targetTenantId: string,
  recurso: keyof typeof RECURSO_SENSIBILIDADE,
): Promise<boolean> {
  const relation = await getTenantRelation(actorTenantId, targetTenantId)
  return canViewRecurso(relation, recurso)
}

export interface TenantHierarquiaNode {
  tenantId: string
  nome: string
  tipo: string
  cidade: string | null
  ativa: boolean
}

/**
 * Retorna o tenant ancestral mais próximo (se houver) e a lista de tenants
 * descendentes diretos+indiretos, já com os dados básicos (sempre
 * públicos) prontos para exibição — usado pela página /admin/hierarquia.
 */
export async function getTenantHierarquia(tenantId: string): Promise<{
  ancestral: TenantHierarquiaNode | null
  descendentes: TenantHierarquiaNode[]
}> {
  const sede: SedeNode | null = await db.sede.findFirst({
    where: { tenantId },
    select: { id: true, tenantId: true, sedeId: true },
  })
  if (!sede) return { ancestral: null, descendentes: [] }

  const [ancestraisIds, descendentesIds] = await Promise.all([
    ancestorTenantIds(sede),
    descendantTenantIds(sede.id),
  ])

  const idsRelevantes = [...ancestraisIds.slice(0, 1), ...descendentesIds]
  if (idsRelevantes.length === 0) return { ancestral: null, descendentes: [] }

  interface TenantRow {
    id: string
    nome: string
    ativo: boolean
  }
  interface SedeInfoRow {
    tenantId: string | null
    tipo: string
    cidade: string | null
  }

  const tenants: TenantRow[] = await db.tenant.findMany({
    where: { id: { in: idsRelevantes } },
    select: { id: true, nome: true, ativo: true },
  })

  const sedesPorTenant: SedeInfoRow[] = await db.sede.findMany({
    where: { tenantId: { in: idsRelevantes } },
    select: { tenantId: true, tipo: true, cidade: true },
  })
  const sedeInfoMap = new Map(sedesPorTenant.map((s) => [s.tenantId, s]))

  function toNode(tenantRow: { id: string; nome: string; ativo: boolean }): TenantHierarquiaNode {
    const sedeInfo = sedeInfoMap.get(tenantRow.id)
    return {
      tenantId: tenantRow.id,
      nome: tenantRow.nome,
      tipo: sedeInfo?.tipo ?? 'PONTO_ENCONTRO',
      cidade: sedeInfo?.cidade ?? null,
      ativa: tenantRow.ativo,
    }
  }

  const ancestralId = ancestraisIds[0]
  const ancestral = ancestralId ? (tenants.find((t) => t.id === ancestralId) ?? null) : null
  const descendentes = tenants.filter((t) => descendentesIds.includes(t.id))

  return {
    ancestral: ancestral ? toNode(ancestral) : null,
    descendentes: descendentes.map(toNode),
  }
}
