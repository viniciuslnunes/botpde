/**
 * Classificação de sensibilidade por recurso — ver ARCHITECTURE.md seção 3.2.
 * "publico": visível para ancestrais E descendentes na árvore de Sede.
 * "restrito": visível apenas para o próprio tenant e seus ANCESTRAIS
 * (sede vê tudo da subsede/PDE; subsede/PDE não vê o restrito da sede
 * nem de outros nós — só o público).
 */
export const SENSIBILIDADE = /** @type {const} */ ({
  PUBLICO: 'publico',
  RESTRITO: 'restrito',
})

/** Sensibilidade padrão por recurso do domínio. */
export const RECURSO_SENSIBILIDADE = /** @type {const} */ ({
  membros: SENSIBILIDADE.RESTRITO,
  socios: SENSIBILIDADE.RESTRITO,
  pedidos: SENSIBILIDADE.RESTRITO,
  financeiro: SENSIBILIDADE.RESTRITO,
  patrimonio: SENSIBILIDADE.RESTRITO,
  loja: SENSIBILIDADE.PUBLICO,
  sedes: SENSIBILIDADE.PUBLICO,
  eventos: SENSIBILIDADE.PUBLICO,
  comunidade: SENSIBILIDADE.PUBLICO,
  /**
   * Comunicado oficial (`Announcement`). Mesma sensibilidade de `comunidade`,
   * mas recurso PRÓPRIO de propósito: com canal restrito (R5) a unidade deixa
   * de ver o FEED da Sede e continua recebendo os COMUNICADOS dela. Sem essa
   * separação as duas coisas cairiam juntas — ver RECURSOS_CASCATA_INSTITUCIONAL.
   */
  comunicados: SENSIBILIDADE.PUBLICO,
})

/**
 * R5 — recursos que atravessam o canal restrito de cima para baixo.
 *
 * Isolar o canal corta a INTERAÇÃO, não a comunicação institucional: a unidade
 * some do feed, das salas, das lojas e das conversas, mas continua recebendo
 * comunicado e evento da Sede. Qualquer recurso fora desta lista deixa de
 * cascatear para a unidade isolada.
 */
export const RECURSOS_CASCATA_INSTITUCIONAL = /** @type {const} */ ([
  'comunicados',
  'eventos',
])

/**
 * O ancestral continua alcançando a unidade isolada neste recurso?
 * @param {keyof typeof RECURSO_SENSIBILIDADE} recurso
 * @returns {boolean}
 */
export function recursoCascateiaParaIsolado(recurso) {
  return RECURSOS_CASCATA_INSTITUCIONAL.includes(
    /** @type {'comunicados' | 'eventos'} */ (recurso),
  )
}

/**
 * Relação entre dois tenants na árvore de Sede — computada por quem tem
 * acesso ao banco (ver getTenantRelation em apps/web/src/lib/hierarquia.ts),
 * consumida aqui de forma pura.
 * @typedef {'self' | 'ancestor' | 'descendant' | 'unrelated' | 'allied' | 'rival'} TenantRelation
 */

/**
 * Decide se um tenant "ator" pode ver um recurso de um tenant "alvo",
 * dada a relação entre eles na hierarquia e a sensibilidade do recurso.
 *
 * Regra: você sempre vê o seu próprio; um ancestral vê tudo dos
 * descendentes (público + restrito); um descendente só vê o público dos
 * ancestrais; aliado vê só o público; tenants sem relação não veem nada.
 *
 * @param {import('./visibility.js').TenantRelation} relation
 * @param {string} sensibilidade - um valor de SENSIBILIDADE
 * @returns {boolean}
 */
export function resolveVisibility(relation, sensibilidade) {
  if (relation === 'self' || relation === 'ancestor') return true
  if (relation === 'descendant' || relation === 'allied') {
    return sensibilidade === SENSIBILIDADE.PUBLICO
  }
  // Rival nunca vê NADA — nem o público. Caso explícito (e não só o fallback)
  // para a segregação sobreviver a mudanças no return final: rivalidade é o
  // mecanismo anti-infiltração entre torcidas (spec-onboarding §3.2).
  if (relation === 'rival') return false
  return false
}

/**
 * R5 — canal restrito: rebaixa a relação entre dois tenants quando um dos lados
 * isolou o próprio canal. Função pura; quem lê o estado é `lib/isolamento.ts`.
 *
 * A regra é ASSIMÉTRICA de propósito:
 * - alvo restrito → ninguém de fora enxerga a unidade ('unrelated'), nem o
 *   ancestral no fluxo social (o monitoramento da Sede é um caminho separado,
 *   por permissão de usuário: `assertPresidentePodeLerUnidade`);
 * - ator restrito → a unidade perde aliados, coirmãs, a comunidade nacional
 *   E o feed da Sede: fechar o canal é deixar de participar da praça social,
 *   nos dois sentidos. Continua 'ancestor' das próprias sub-unidades — isolar-se
 *   para fora não pode cegá-la para dentro.
 *   A comunicação institucional descendente (comunicado, evento) NÃO passa por
 *   aqui: ela é resolvida por recurso em `getVisibleTenantIds`, via
 *   `RECURSOS_CASCATA_INSTITUCIONAL`;
 * - 'self' nunca é afetado: a comunidade e a administração internas seguem
 *   intactas para quem pertence à unidade.
 *
 * @param {import('./visibility.js').TenantRelation} relation
 * @param {{ atorRestrito?: boolean, alvoRestrito?: boolean }} estado
 * @returns {import('./visibility.js').TenantRelation}
 */
export function aplicarIsolamento(relation, estado) {
  const atorRestrito = estado?.atorRestrito === true
  const alvoRestrito = estado?.alvoRestrito === true

  if (!atorRestrito && !alvoRestrito) return relation
  if (relation === 'self') return 'self'
  // Alvo restrito vence: é o corte que protege a unidade isolada.
  if (alvoRestrito) return 'unrelated'
  // Ator restrito: só a visão para BAIXO (suas próprias sub-unidades) sobrevive.
  return relation === 'ancestor' ? 'ancestor' : 'unrelated'
}

/**
 * Atalho: visibilidade por nome de recurso (usa RECURSO_SENSIBILIDADE).
 * @param {import('./visibility.js').TenantRelation} relation
 * @param {keyof typeof RECURSO_SENSIBILIDADE} recurso
 * @returns {boolean}
 */
export function canViewRecurso(relation, recurso) {
  return resolveVisibility(relation, RECURSO_SENSIBILIDADE[recurso])
}

/**
 * Converte a posição do ALVO na linhagem do ator para a TenantRelation no
 * contrato de resolveVisibility — que descreve o papel do ATOR em relação ao
 * alvo. Sutil e fácil de inverter: se o alvo é ancestral do ator, o ator é
 * DESCENDENTE dele (vê só o público); se o alvo é descendente do ator, o
 * ator é ANCESTRAL dele (vê tudo). Função pura, coberta por teste — quem
 * percorre a árvore (getTenantRelation em apps/web) delega a decisão aqui.
 *
 * @param {boolean} targetIsAncestorOfActor - alvo está entre os ancestrais do ator
 * @param {boolean} targetIsDescendantOfActor - alvo está entre os descendentes do ator
 * @returns {import('./visibility.js').TenantRelation}
 */
export function relationFromLineage(targetIsAncestorOfActor, targetIsDescendantOfActor) {
  if (targetIsAncestorOfActor) return 'descendant'
  if (targetIsDescendantOfActor) return 'ancestor'
  return 'unrelated'
}
