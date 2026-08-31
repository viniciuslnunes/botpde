import { cache } from 'react'
import { unstable_cache, revalidateTag } from 'next/cache'
import { db } from '@torcida/db'
import {
  aplicarIsolamento,
  canViewRecurso,
  ESCOPOS_RIVALIDADE_ISOLANTE,
  formatNomeTorcida,
  ordenarPar,
  podeDescobrirTorcida,
  recursoCascateiaParaIsolado,
  relationFromLineage,
  type RECURSO_SENSIBILIDADE,
} from '@torcida/types'
import {
  ISOLAMENTO_CACHE_TAG,
  estadoIsolamentoDoPar,
  filtrarTenantsRestritos,
  isTenantRestrito,
} from './isolamento'

export const HIERARCHY_CACHE_TAG = 'tenant-hierarchy'

export function hierarchyCacheTag(tenantId: string): string {
  return `hierarchy-${tenantId}`
}

/** Invalida cache de hierarquia após mudanças em sede ou aliança. */
export function invalidateHierarchyCache(tenantId?: string): void {
  if (tenantId) {
    revalidateTag(hierarchyCacheTag(tenantId), 'max')
  } else {
    revalidateTag(HIERARCHY_CACHE_TAG, 'max')
  }
}

export type TenantRelation = 'self' | 'ancestor' | 'descendant' | 'unrelated' | 'allied' | 'rival'

/**
 * Invalida o cache de relações após mudanças em rivalidade (clube ou torcida).
 * Rivalidade é GLOBAL (clube×clube) — as tags por tenant
 * (`hierarchyCacheTag(tenantId)`) não cobrem todos os pares afetados, então a
 * invalidação é da tag global. O CRUD de rivalidade (increment futuro) DEVE
 * chamar esta função, senão a relação 'rival' fica obsoleta por até 300s.
 */
export function invalidateRivalidadeCache(): void {
  revalidateTag(HIERARCHY_CACHE_TAG, 'max')
}

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
  // Cada `filho` já marca a si mesmo em `visitados` de forma síncrona no início
  // da chamada (antes do primeiro await), então a recursão dos irmãos pode
  // rodar em paralelo sem risco de reprocessar um nó (guarda de ciclo intacta).
  const subArvores = await Promise.all(
    filhos.map(async (filho) => descendantTenantIds(filho.id, visitados)),
  )
  filhos.forEach((filho, i) => {
    if (filho.tenantId) ids.push(filho.tenantId)
    ids.push(...subArvores[i])
  })
  return ids
}

/**
 * Nó de partida canônico para percorrer a árvore de Sede de um tenant:
 * a raiz `SEDE` e, na falta dela, a unidade mais antiga do tenant.
 *
 * Partir de um nó arbitrário quebra a derivação: uma SUBSEDE no meio da
 * árvore não alcança as unidades penduradas em outros ramos, e a Sede mãe
 * perde a relação de ancestral sobre a própria filha. O `orderBy` é o que
 * torna a escolha estável — sem ele o Postgres pode devolver linhas
 * diferentes entre execuções, e o mesmo tenant funciona numa e falha na
 * seguinte. Ver `docs/ops/auditoria-funcional-2026-07.md` §Achado 9.
 */
async function findSedeRaiz(tenantId: string): Promise<SedeNode | null> {
  const ordem = [{ criadoEm: 'asc' as const }, { id: 'asc' as const }]
  const select = { id: true, tenantId: true, sedeId: true }

  const raiz: SedeNode | null = await db.sede.findFirst({
    where: { tenantId, tipo: 'SEDE' },
    select,
    orderBy: ordem,
  })
  if (raiz) return raiz

  return db.sede.findFirst({ where: { tenantId }, select, orderBy: ordem })
}

/**
 * Cadeia completa de tenants ancestrais de um tenant, do mais próximo ao
 * mais distante (ex: PDE → [Subsede, Sede]). Ao contrário de
 * `getTenantHierarquia` (que só expõe o ancestral mais próximo, para a tela
 * `/admin/hierarquia`), esta função devolve a árvore inteira — necessária
 * para cascatear conteúdo institucional (comunicados/eventos) através de 2+
 * níveis de hierarquia.
 */
async function getAncestorTenantIdsImpl(tenantId: string): Promise<string[]> {
  const sede = await findSedeRaiz(tenantId)
  if (!sede) return []

  return ancestorTenantIds(sede)
}

export const getAncestorTenantIds = cache(async (tenantId: string): Promise<string[]> => {
  return unstable_cache(
    () => getAncestorTenantIdsImpl(tenantId),
    ['ancestor-tenants', tenantId],
    { revalidate: 300, tags: [HIERARCHY_CACHE_TAG, hierarchyCacheTag(tenantId)] },
  )()
})

/**
 * IDs de tenant de TODOS os descendentes na árvore de Sede (subsedes/PDEs,
 * recursivo). Usado pelo console global do Presidente (/admin/torcida) para
 * agregar afiliados da torcida inteira. Retorna [] se o tenant não tem Sede.
 */
async function getDescendantTenantIdsImpl(tenantId: string): Promise<string[]> {
  const sede = await findSedeRaiz(tenantId)
  if (!sede) return []

  return descendantTenantIds(sede.id)
}

export const getDescendantTenantIds = cache(async (tenantId: string): Promise<string[]> => {
  return unstable_cache(
    () => getDescendantTenantIdsImpl(tenantId),
    ['descendant-tenants', tenantId],
    { revalidate: 300, tags: [HIERARCHY_CACHE_TAG, hierarchyCacheTag(tenantId)] },
  )()
})

/**
 * IDs de tenant da mesma torcida organizacional (worktree): o próprio +
 * ancestrais + descendentes na árvore de Sede (Subsede/PDE).
 * Usado para herdar aliança ATIVA da sede principal às sub-unidades.
 */
export async function getTorcidaLineageTenantIds(tenantId: string): Promise<string[]> {
  const [ancestrais, descendentes] = await Promise.all([
    getAncestorTenantIds(tenantId),
    getDescendantTenantIds(tenantId),
  ])
  return Array.from(new Set([tenantId, ...ancestrais, ...descendentes]))
}

/**
 * IDs de tenants com aliança ATIVA em relação ao tenant indicado.
 * Herda a ideologia da sede: se a raiz (ou qualquer unidade da worktree)
 * tem aliança ATIVA com B, todas as unidades da worktree enxergam o
 * lineage de B como aliado (decisão #3 — aliança nível torcida).
 */
async function getAlliedTenantIdsImpl(tenantId: string): Promise<string[]> {
  // R5 — canal restrito: a unidade isolada não tem aliados enquanto o canal
  // estiver fechado. As linhas de `Alianca` continuam gravadas e ATIVAS — só
  // ficam inertes, e voltam sozinhas quando o canal reabre.
  if (await isTenantRestrito(tenantId)) return []

  const lineage = await getTorcidaLineageTenantIds(tenantId)
  if (lineage.length === 0) return []

  const aliancas: { tenantOrigemId: string; tenantAliadoId: string }[] =
    await db.alianca.findMany({
      where: {
        status: 'ATIVA',
        OR: [{ tenantOrigemId: { in: lineage } }, { tenantAliadoId: { in: lineage } }],
      },
      select: { tenantOrigemId: true, tenantAliadoId: true },
    })

  if (aliancas.length === 0) return []

  const lineageSet = new Set(lineage)
  const counterpartRoots = new Set<string>()
  for (const a of aliancas) {
    if (lineageSet.has(a.tenantOrigemId)) counterpartRoots.add(a.tenantAliadoId)
    if (lineageSet.has(a.tenantAliadoId)) counterpartRoots.add(a.tenantOrigemId)
  }

  const allied = new Set<string>()
  await Promise.all(
    Array.from(counterpartRoots).map(async (counterpartId) => {
      const counterpartLineage = await getTorcidaLineageTenantIds(counterpartId)
      for (const id of counterpartLineage) {
        if (!lineageSet.has(id)) allied.add(id)
      }
    }),
  )
  // A contraparte também pode ter fechado o próprio canal — aliança com uma
  // unidade isolada fica inerte nos dois sentidos.
  return filtrarTenantsRestritos(Array.from(allied))
}

export const getAlliedTenantIds = cache(async (tenantId: string): Promise<string[]> => {
  return unstable_cache(
    () => getAlliedTenantIdsImpl(tenantId),
    ['allied-tenants', tenantId],
    {
      revalidate: 300,
      tags: [HIERARCHY_CACHE_TAG, hierarchyCacheTag(tenantId), ISOLAMENTO_CACHE_TAG],
    },
  )()
})

/**
 * Verifica se dois tenants têm aliança ATIVA (simétrico), incluindo
 * herança worktree (PDE/subsede ↔ torcida aliada da sede).
 */
export async function tenantsAreAllied(tenantAId: string, tenantBId: string): Promise<boolean> {
  if (tenantAId === tenantBId) return true

  // R5 — canal restrito de qualquer um dos lados suspende a aliança.
  const { atorRestrito, alvoRestrito } = await estadoIsolamentoDoPar(tenantAId, tenantBId)
  if (atorRestrito || alvoRestrito) return false

  const [lineageA, lineageB] = await Promise.all([
    getTorcidaLineageTenantIds(tenantAId),
    getTorcidaLineageTenantIds(tenantBId),
  ])

  const count = await db.alianca.count({
    where: {
      status: 'ATIVA',
      OR: [
        { tenantOrigemId: { in: lineageA }, tenantAliadoId: { in: lineageB } },
        { tenantOrigemId: { in: lineageB }, tenantAliadoId: { in: lineageA } },
      ],
    },
  })
  return count > 0
}

/**
 * Verifica se dois tenants são rivais (simétrico): existe RivalidadeTorcida
 * entre eles (override torcida×torcida) OU RivalidadeClube entre as
 * Afiliacoes dos dois (rivalidade herdada do clube). Pares gravados na forma
 * canônica `aId < bId` — a consulta normaliza via `ordenarPar` (@torcida/types).
 *
 * NÃO checa aliança aqui: a neutralização "rival E NÃO aliancaAtiva" é
 * garantida pela PRECEDÊNCIA em getTenantRelationImpl (allied vem antes).
 */
export async function tenantsAreRivais(tenantAId: string, tenantBId: string): Promise<boolean> {
  if (tenantAId === tenantBId) return false

  const [torcidaA, torcidaB] = ordenarPar(tenantAId, tenantBId)
  const rivalTorcida: number = await db.rivalidadeTorcida.count({
    where: { tenantAId: torcidaA, tenantBId: torcidaB },
  })
  if (rivalTorcida > 0) return true

  const tenants: { id: string; afiliacaoId: string | null }[] = await db.tenant.findMany({
    where: { id: { in: [tenantAId, tenantBId] } },
    select: { id: true, afiliacaoId: true },
  })
  const afiliacaoA = tenants.find((t) => t.id === tenantAId)?.afiliacaoId
  const afiliacaoB = tenants.find((t) => t.id === tenantBId)?.afiliacaoId
  // Tenant sem afiliação não herda rivalidade de clube; mesmo clube nunca é rival.
  if (!afiliacaoA || !afiliacaoB || afiliacaoA === afiliacaoB) return false

  const [clubeA, clubeB] = ordenarPar(afiliacaoA, afiliacaoB)
  // `escopo` filtra clássico interestadual: ele fica gravado como contexto, mas
  // não isola (ver ESCOPOS_RIVALIDADE_ISOLANTE em @torcida/types).
  const rivalClube: number = await db.rivalidadeClube.count({
    where: {
      afiliacaoAId: clubeA,
      afiliacaoBId: clubeB,
      escopo: { in: [...ESCOPOS_RIVALIDADE_ISOLANTE] },
    },
  })
  return rivalClube > 0
}

/**
 * Quais desses `candidatoIds` são rivais de `tenantId` (torcida×torcida ou
 * clube×clube). Não considera aliança — quem já é aliado continua no set;
 * o caller decide se ATIVA sobrevive (listagem) ou some (proposta nova).
 *
 * Uma query por tipo, não N× `tenantsAreRivais`.
 */
export async function carregarIdsRivaisDe(
  tenantId: string,
  candidatoIds: string[],
): Promise<Set<string>> {
  const ids = candidatoIds.filter((id) => id !== tenantId)
  if (ids.length === 0) return new Set()

  const rivais = new Set<string>()

  const paresTorcida: { tenantAId: string; tenantBId: string }[] = await db.rivalidadeTorcida.findMany({
    where: {
      OR: [
        { tenantAId: tenantId, tenantBId: { in: ids } },
        { tenantBId: tenantId, tenantAId: { in: ids } },
      ],
    },
    select: { tenantAId: true, tenantBId: true },
  })
  for (const par of paresTorcida) {
    rivais.add(par.tenantAId === tenantId ? par.tenantBId : par.tenantAId)
  }

  const tenants: { id: string; afiliacaoId: string | null }[] = await db.tenant.findMany({
    where: { id: { in: [tenantId, ...ids] } },
    select: { id: true, afiliacaoId: true },
  })
  const afiliacaoViewer = tenants.find((t) => t.id === tenantId)?.afiliacaoId ?? null
  if (!afiliacaoViewer) return rivais

  const candidatos = tenants.filter((t) => t.id !== tenantId)
  const outrosClubes = [
    ...new Set(
      candidatos
        .map((t) => t.afiliacaoId)
        .filter((id): id is string => Boolean(id) && id !== afiliacaoViewer),
    ),
  ]
  if (outrosClubes.length === 0) return rivais

  const paresClube: { afiliacaoAId: string; afiliacaoBId: string }[] = await db.rivalidadeClube.findMany({
    where: {
      escopo: { in: [...ESCOPOS_RIVALIDADE_ISOLANTE] },
      OR: [
        { afiliacaoAId: afiliacaoViewer, afiliacaoBId: { in: outrosClubes } },
        { afiliacaoBId: afiliacaoViewer, afiliacaoAId: { in: outrosClubes } },
      ],
    },
    select: { afiliacaoAId: true, afiliacaoBId: true },
  })
  const clubesRivais = new Set<string>()
  for (const par of paresClube) {
    clubesRivais.add(par.afiliacaoAId === afiliacaoViewer ? par.afiliacaoBId : par.afiliacaoAId)
  }
  for (const candidato of candidatos) {
    if (candidato.afiliacaoId && clubesRivais.has(candidato.afiliacaoId)) {
      rivais.add(candidato.id)
    }
  }
  return rivais
}

/**
 * Determina o papel do tenant ATOR em relação ao tenant alvo — hierarquia
 * de Sede, aliança ATIVA ou rivalidade entre torcidas.
 * Precedência: self > ancestor/descendant > allied > rival > unrelated
 * (aliança explícita ATIVA vence rivalidade herdada do clube).
 */
async function getTenantRelationImpl(
  actorTenantId: string,
  targetTenantId: string,
): Promise<TenantRelation> {
  if (actorTenantId === targetTenantId) return 'self'

  // R5 — canal restrito: a relação CRUA é calculada normal e depois rebaixada
  // por `aplicarIsolamento` (pura, testada em @torcida/types). Manter a ordem
  // importa: quem é ancestral continua ancestral na ESTRUTURA (governança,
  // espelho de membro, console do Presidente) — o que muda é só a malha de
  // interação derivada desta relação.
  const [crua, estado] = await Promise.all([
    getTenantRelationCrua(actorTenantId, targetTenantId),
    estadoIsolamentoDoPar(actorTenantId, targetTenantId),
  ])
  return aplicarIsolamento(crua, estado)
}

async function getTenantRelationCrua(
  actorTenantId: string,
  targetTenantId: string,
): Promise<TenantRelation> {
  const actorSede = await findSedeRaiz(actorTenantId)

  if (actorSede) {
    const [ancestrais, descendentes] = await Promise.all([
      ancestorTenantIds(actorSede),
      descendantTenantIds(actorSede.id),
    ])

    const lineageRelation = relationFromLineage(
      ancestrais.includes(targetTenantId),
      descendentes.includes(targetTenantId),
    )
    if (lineageRelation !== 'unrelated') return lineageRelation
  }

  // Aliança e rivalidade são independentes; o caso comum ('unrelated') precisa
  // das duas respostas, então rodam em paralelo. A PRECEDÊNCIA é aplicada
  // depois: aliança ATIVA vence rivalidade herdada do clube (spec-onboarding §3.2).
  const [aliado, rival] = await Promise.all([
    tenantsAreAllied(actorTenantId, targetTenantId),
    tenantsAreRivais(actorTenantId, targetTenantId),
  ])
  if (aliado) return 'allied'
  if (rival) return 'rival'

  return 'unrelated'
}

export const getTenantRelation = cache(
  async (actorTenantId: string, targetTenantId: string): Promise<TenantRelation> => {
    // Chave DIRECIONAL: a relação é assimétrica (ancestor ≠ descendant) —
    // chave simétrica servia a 1ª direção cacheada para as duas, deixando
    // um descendente ver RESTRITO do ancestral.
    const pairKey = `${actorTenantId}:${targetTenantId}`
    return unstable_cache(
      () => getTenantRelationImpl(actorTenantId, targetTenantId),
      ['tenant-relation', pairKey],
      {
        revalidate: 300,
        tags: [
          HIERARCHY_CACHE_TAG,
          hierarchyCacheTag(actorTenantId),
          hierarchyCacheTag(targetTenantId),
          // Sem esta tag, ligar/desligar o canal restrito levaria até 300s
          // para refletir na relação — o toggle precisa ser imediato.
          ISOLAMENTO_CACHE_TAG,
        ],
      },
    )()
  },
)

/**
 * Preview / descoberta: rival e canal restrito do alvo são inexistentes (404).
 * Unrelated não-rival pode ver posts públicos — é o caminho para avaliar aliança.
 * Checa a raiz da worktree para PDE/subsede sem `afiliacaoId` próprio.
 */
export async function podeVerPreviewPublicoTorcida(
  viewerTenantId: string,
  targetTenantId: string,
): Promise<boolean> {
  const relation = await getTenantRelation(viewerTenantId, targetTenantId)
  if (relation === 'self' || relation === 'ancestor' || relation === 'descendant' || relation === 'allied') {
    return true
  }
  if (!podeDescobrirTorcida(relation)) return false

  if (await isTenantRestrito(targetTenantId)) return false

  const [viewerAncestrais, targetAncestrais]: [string[], string[]] = await Promise.all([
    getAncestorTenantIds(viewerTenantId),
    getAncestorTenantIds(targetTenantId),
  ])
  const viewerRoot = viewerAncestrais[viewerAncestrais.length - 1] ?? viewerTenantId
  const targetRoot = targetAncestrais[targetAncestrais.length - 1] ?? targetTenantId
  if (await tenantsAreRivais(viewerRoot, targetRoot)) return false
  if (viewerRoot !== viewerTenantId || targetRoot !== targetTenantId) {
    if (await tenantsAreRivais(viewerTenantId, targetTenantId)) return false
  }
  return true
}

/**
 * IDs de tenant cujo conteúdo do recurso indicado é visível para o tenant
 * ator: sempre o próprio, sempre os descendentes (ancestor vê TUDO do
 * descendente, público ou restrito — `resolveVisibility`), e os ancestrais
 * só quando o recurso é PÚBLICO (o ator é descendente deles — só enxerga o
 * público). Centraliza a regra que antes estava implícita e duplicada em
 * eventos, comunidade e loja.
 *
 * Gancho de alianças: tenants com aliança ATIVA (e suas worktrees —
 * PDEs/subsedes herdando a sede) entram via getAlliedTenantIds.
 */
async function getVisibleTenantIdsImpl(
  tenantId: string,
  recurso: keyof typeof RECURSO_SENSIBILIDADE,
): Promise<string[]> {
  const descendentes = await getDescendantTenantIds(tenantId)

  if (!canViewRecurso('descendant', recurso)) {
    return filtrarTenantsRestritos([...new Set([tenantId, ...descendentes])], tenantId)
  }

  const [ancestrais, aliados, atorRestrito] = await Promise.all([
    getAncestorTenantIds(tenantId),
    getAlliedTenantIds(tenantId),
    isTenantRestrito(tenantId),
  ])

  // R5 — a unidade com canal restrito sai da praça social nos DOIS sentidos:
  // não é vista e também não vê. O que continua descendo do ancestral é só a
  // comunicação institucional (comunicado, evento) — daí o corte ser por
  // recurso, e não uma regra única de hierarquia.
  const ancestraisVisiveis =
    atorRestrito && !recursoCascateiaParaIsolado(recurso) ? [] : ancestrais

  const ids = new Set([tenantId, ...ancestraisVisiveis, ...descendentes, ...aliados])
  // Nenhuma unidade restrita entra no conjunto de ninguém. `manter = tenantId`
  // preserva o próprio: a comunidade interna dela segue intacta.
  return filtrarTenantsRestritos(Array.from(ids), tenantId)
}

export const getVisibleTenantIds = cache(
  async (
    tenantId: string,
    recurso: keyof typeof RECURSO_SENSIBILIDADE,
  ): Promise<string[]> => {
    return unstable_cache(
      () => getVisibleTenantIdsImpl(tenantId, recurso),
      ['visible-tenants', tenantId, recurso],
      {
        revalidate: 300,
        tags: [HIERARCHY_CACHE_TAG, hierarchyCacheTag(tenantId), ISOLAMENTO_CACHE_TAG],
      },
    )()
  },
)

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
  // Preferir a Sede raiz (tipo SEDE) — evita pegar PDE co-tenant.
  const sede = await findSedeRaiz(tenantId)
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

  const [tenants, sedesPorTenant]: [TenantRow[], SedeInfoRow[]] = await Promise.all([
    db.tenant.findMany({
      where: { id: { in: idsRelevantes } },
      select: { id: true, nome: true, ativo: true },
    }),
    db.sede.findMany({
      where: { tenantId: { in: idsRelevantes } },
      select: { tenantId: true, tipo: true, cidade: true },
    }),
  ])
  const sedeInfoMap = new Map(sedesPorTenant.map((s) => [s.tenantId, s]))

  function toNode(tenantRow: { id: string; nome: string; ativo: boolean }): TenantHierarquiaNode {
    const sedeInfo = sedeInfoMap.get(tenantRow.id)
    return {
      tenantId: tenantRow.id,
      nome: formatNomeTorcida(tenantRow.nome),
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

/** Nó da worktree da Visão da torcida (Sede intra-tenant + Tenants filhos). */
export interface TorcidaWorktreeNode {
  /** Chave estável para React / map (sedeId ou `tenant:${id}`). */
  key: string
  /** Sede local (Caso A) — null quando o nó é só Tenant filho promovido. */
  sedeId: string | null
  /** Tenant dono desta unidade (próprio ou filho). */
  tenantId: string
  nome: string
  tipo: string
  cidade: string | null
  ativa: boolean
  /** Profundidade na árvore (0 = raiz SEDE). */
  depth: number
  /** Origem: sede do mesmo tenant vs tenant descendente na hierarquia. */
  origem: 'sede' | 'tenant'
}

interface SedeWorktreeRow {
  id: string
  nome: string
  tipo: string
  cidade: string | null
  ativa: boolean
  sedeId: string | null
  tenantId: string | null
}

/**
 * Worktree híbrida da torcida para o console do Presidente:
 * 1. Todas as Sede ativas do tenant (ligadas por sedeId) — Caso A / onboarding.
 * 2. Tenants descendentes (Caso B / promoção) anexados sob a SEDE raiz.
 *
 * Ordem: DFS pré-ordem a partir da raiz tipo SEDE (ou primeira sede sem pai).
 */
export async function getTorcidaWorktree(tenantId: string): Promise<TorcidaWorktreeNode[]> {
  const sedes: SedeWorktreeRow[] = await db.sede.findMany({
    where: { tenantId, ativa: true },
    select: {
      id: true,
      nome: true,
      tipo: true,
      cidade: true,
      ativa: true,
      sedeId: true,
      tenantId: true,
    },
    orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
  })

  const idsNoTenant = new Set(sedes.map((s) => s.id))
  const filhosPorPai = new Map<string | null, SedeWorktreeRow[]>()
  for (const s of sedes) {
    const paiKey =
      s.sedeId && idsNoTenant.has(s.sedeId) ? s.sedeId : null
    const lista = filhosPorPai.get(paiKey) ?? []
    lista.push(s)
    filhosPorPai.set(paiKey, lista)
  }

  const raizPreferida =
    sedes.find((s) => s.tipo === 'SEDE' && !s.sedeId) ??
    sedes.find((s) => s.tipo === 'SEDE') ??
    sedes.find((s) => !s.sedeId || !idsNoTenant.has(s.sedeId ?? '')) ??
    null

  const nodes: TorcidaWorktreeNode[] = []
  const visitados = new Set<string>()

  function walkSede(sede: SedeWorktreeRow, depth: number) {
    if (visitados.has(sede.id)) return
    visitados.add(sede.id)
    nodes.push({
      key: `sede:${sede.id}`,
      sedeId: sede.id,
      tenantId,
      nome: sede.nome,
      tipo: sede.tipo,
      cidade: sede.cidade,
      ativa: sede.ativa,
      depth,
      origem: 'sede',
    })
    const filhos = filhosPorPai.get(sede.id) ?? []
    for (const filho of filhos) walkSede(filho, depth + 1)
  }

  if (raizPreferida) {
    walkSede(raizPreferida, 0)
    // Órfãos / raízes alternativas (ex.: várias SEDE sem pai) — anexa ao fim depth 0.
    for (const s of sedes) {
      if (!visitados.has(s.id) && (!s.sedeId || !idsNoTenant.has(s.sedeId))) {
        walkSede(s, 0)
      }
    }
    for (const s of sedes) {
      if (!visitados.has(s.id)) walkSede(s, 1)
    }
  }

  // Caso B: Tenants filhos via árvore de Sede (promovidos).
  const { descendentes } = await getTenantHierarquia(tenantId)
  const tenantFilhos = descendentes.filter((d) => d.tenantId !== tenantId)
  for (const d of tenantFilhos) {
    nodes.push({
      key: `tenant:${d.tenantId}`,
      sedeId: null,
      tenantId: d.tenantId,
      nome: d.nome,
      tipo: d.tipo,
      cidade: d.cidade,
      ativa: d.ativa,
      depth: 1,
      origem: 'tenant',
    })
  }

  return nodes
}

/**
 * R3 — toggle da raiz SEDE: descendentes podem ver a hierarquia completa?
 * Leitura por PK de `Tenant.hierarquiaVisivelParaFilhos`. Só a raiz SEDE
 * consome este toggle; alterá-lo exige `invalidateHierarchyCache(rootTenantId)`.
 */
async function getHierarquiaVisivelParaFilhosImpl(rootTenantId: string): Promise<boolean> {
  const tenant: { hierarquiaVisivelParaFilhos: boolean } | null = await db.tenant.findUnique({
    where: { id: rootTenantId },
    select: { hierarquiaVisivelParaFilhos: true },
  })
  return tenant?.hierarquiaVisivelParaFilhos ?? false
}

export const getHierarquiaVisivelParaFilhos = cache(
  async (rootTenantId: string): Promise<boolean> => {
    return unstable_cache(
      () => getHierarquiaVisivelParaFilhosImpl(rootTenantId),
      ['hierarquia-visivel-filhos', rootTenantId],
      { revalidate: 300, tags: [HIERARCHY_CACHE_TAG, hierarchyCacheTag(rootTenantId)] },
    )()
  },
)

/**
 * R3 — worktree visível para um tenant DESCENDENTE (subsede/PDE Caso B).
 * Resolve a raiz pela cadeia de ancestrais (último elemento; se não há
 * ancestral, o próprio ator é a raiz) e lê o toggle da raiz:
 * - `false` (padrão) → o descendente vê só a própria worktree
 *   (`getTorcidaWorktree(actorTenantId)`: a unidade em si + suas sub-unidades
 *   locais — nunca irmãos nem a árvore da Sede).
 * - `true` → delega a `getTorcidaWorktree(root)` (árvore inteira da torcida).
 * O console do Presidente (R1) NÃO passa por aqui — usa `getTorcidaWorktree`
 * direto, independente do toggle.
 */
export async function getWorktreeParaDescendente(
  actorTenantId: string,
): Promise<TorcidaWorktreeNode[]> {
  const ancestrais: string[] = await getAncestorTenantIds(actorTenantId)
  const rootTenantId = ancestrais.length > 0 ? ancestrais[ancestrais.length - 1] : actorTenantId

  if (rootTenantId === actorTenantId) {
    return getTorcidaWorktree(actorTenantId)
  }

  const visivel = await getHierarquiaVisivelParaFilhos(rootTenantId)
  if (!visivel) {
    return getTorcidaWorktree(actorTenantId)
  }
  return getTorcidaWorktree(rootTenantId)
}
