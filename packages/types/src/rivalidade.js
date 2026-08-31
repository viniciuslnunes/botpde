/**
 * Regras puras de rivalidade entre torcidas — ver docs/data/spec-onboarding.md §1.3/§3.2.
 *
 * Regra derivada (montada em SQL por hierarquia.ts, decidida aqui):
 * dois tenants são rivais se existe RivalidadeTorcida(t1,t2) OU
 * RivalidadeClube(afiliacao(t1), afiliacao(t2)), E NÃO existe Alianca ATIVA
 * entre eles — a aliança explícita neutraliza a rivalidade herdada do clube.
 * Na prática a neutralização é garantida por PRECEDÊNCIA em getTenantRelation
 * (apps/web/src/lib/hierarquia.ts): self > ancestor/descendant > allied >
 * rival > unrelated — só se cai em 'rival' quando não há aliança ativa.
 */

/**
 * Normaliza um par de IDs para a forma canônica `[menor, maior]` (comparação
 * lexical de string). O banco NÃO força simetria em RivalidadeClube /
 * RivalidadeTorcida — o invariante `aId < bId` vale para GRAVAR e CONSULTAR,
 * sempre via este helper (lição da Alianca, cujo par não é canônico).
 *
 * @param {string} aId
 * @param {string} bId
 * @returns {[string, string]} par ordenado [menor, maior]
 */
export function ordenarPar(aId, bId) {
  return aId < bId ? [aId, bId] : [bId, aId]
}

/**
 * Regra pura: a relação já resolvida entre dois tenants indica rivalidade?
 * A resolução de QUAL é a relação (hierarquia, aliança, rivalidade) fica em
 * getTenantRelation (apps/web/src/lib/hierarquia.ts); aqui só a decisão.
 *
 * @param {import('./visibility.js').TenantRelation} relation
 * @returns {boolean}
 */
export function saoRivais(relation) {
  return relation === 'rival'
}

/**
 * Escopos de `RivalidadeClube` que ISOLAM (par some do universo de interação).
 *
 * Por que não é todo par gravado: clássico interestadual (Flamengo x São Paulo,
 * Corinthians x Cruzeiro) é rivalidade de calendário e de mídia — tratá-lo como
 * isolamento apagaria boa parte da malha nacional entre torcidas sem ganho
 * nenhum de segurança. `INTERESTADUAL` fica gravado como contexto (rotular
 * jogo, moderação) e não entra na conta.
 *
 * Decisão de 2026-08-27, medida em `docs/data/auditoria-catalogo-clubes.md` §4.
 * Para voltar atrás, basta incluir 'INTERESTADUAL' aqui.
 *
 * @type {readonly ('MUNICIPAL'|'ESTADUAL'|'INTERESTADUAL')[]}
 */
export const ESCOPOS_RIVALIDADE_ISOLANTE = ['MUNICIPAL', 'ESTADUAL']

/**
 * @param {string | null | undefined} escopo
 * @returns {boolean}
 */
export function escopoIsola(escopo) {
  return ESCOPOS_RIVALIDADE_ISOLANTE.includes(/** @type {never} */ (escopo))
}
