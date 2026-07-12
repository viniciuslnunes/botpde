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
  loja: SENSIBILIDADE.PUBLICO,
  sedes: SENSIBILIDADE.PUBLICO,
  eventos: SENSIBILIDADE.PUBLICO,
  comunidade: SENSIBILIDADE.PUBLICO,
})

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
