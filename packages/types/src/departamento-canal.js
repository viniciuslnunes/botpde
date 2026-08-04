/**
 * Canais internos de departamento e área de atuação.
 *
 * Cada `Departamento` e cada `DepartamentoArea` tem um `Conversa` tipo CANAL
 * (`canalConversaId`), privado, listado só para quem é `MembroConversa` ATIVO.
 * Roster é derivado da equipe — não é canal temático aberto da Comunidade.
 *
 * - Canal do departamento: `UserDepartamento` (MEMBRO) + `DepartamentoGestor` (ADMIN)
 * - Canal da área: `DepartamentoAreaMembro` (MEMBRO) + gestores do dept pai (ADMIN)
 */

/**
 * @param {{ membros: Iterable<string>, gestores: Iterable<string> }} input
 * @returns {Map<string, 'ADMIN' | 'MEMBRO'>}
 */
export function rosterCanalDepartamento(input) {
  /** @type {Map<string, 'ADMIN' | 'MEMBRO'>} */
  const desired = new Map()
  for (const userId of input.membros) {
    if (userId) desired.set(userId, 'MEMBRO')
  }
  for (const userId of input.gestores) {
    if (userId) desired.set(userId, 'ADMIN')
  }
  return desired
}

/**
 * @param {{
 *   membrosArea: Iterable<string>,
 *   gestoresDepartamento: Iterable<string>,
 * }} input
 * @returns {Map<string, 'ADMIN' | 'MEMBRO'>}
 */
export function rosterCanalArea(input) {
  /** @type {Map<string, 'ADMIN' | 'MEMBRO'>} */
  const desired = new Map()
  for (const userId of input.membrosArea) {
    if (userId) desired.set(userId, 'MEMBRO')
  }
  for (const userId of input.gestoresDepartamento) {
    if (userId) desired.set(userId, 'ADMIN')
  }
  return desired
}

/**
 * Canal de depto/área não aparece na vitrine da Comunidade — só para membro ATIVO.
 *
 * @param {{ ehCanalDepartamentoOuArea: boolean, souMembroAtivo: boolean }} input
 */
export function deveListarCanalDepartamentoNaComunidade(input) {
  if (!input.ehCanalDepartamentoOuArea) return true
  return input.souMembroAtivo === true
}

/**
 * Nome canônico do canal da frente.
 * @param {string} departamentoNome
 * @param {string} areaNome
 */
export function nomeCanalArea(departamentoNome, areaNome) {
  return `${departamentoNome} · ${areaNome}`
}
