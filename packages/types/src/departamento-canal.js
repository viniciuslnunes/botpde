/**
 * Canais internos de departamento e área de atuação.
 *
 * Cada `Departamento` e cada `DepartamentoArea` tem um `Conversa` tipo CANAL
 * (`canalConversaId`), privado, listado só para quem é `MembroConversa` ATIVO.
 * Roster é derivado da equipe — não é canal temático aberto da Comunidade.
 *
 * - Canal do departamento: `UserDepartamento` (MEMBRO) + `DepartamentoGestor`
 *   (ADMIN) + liderança do tenant (`owner`/`admin`/`vice`) (ADMIN)
 * - Canal da área: `DepartamentoAreaMembro` (MEMBRO) + gestores do dept pai
 *   (ADMIN) + mesma liderança do tenant (ADMIN)
 *
 * Liderança no roster espelha o oversight do hub (`roles:manage`): presidente,
 * vice, admin e owner de unidade Caso B veem **todos** os canais de depto/área
 * do **próprio** tenant — não cruza para a mãe.
 */

/**
 * @param {{
 *   membros: Iterable<string>,
 *   gestores: Iterable<string>,
 *   lideranca?: Iterable<string>,
 * }} input
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
  for (const userId of input.lideranca ?? []) {
    if (userId) desired.set(userId, 'ADMIN')
  }
  return desired
}

/**
 * @param {{
 *   membrosArea: Iterable<string>,
 *   gestoresDepartamento: Iterable<string>,
 *   lideranca?: Iterable<string>,
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
  for (const userId of input.lideranca ?? []) {
    if (userId) desired.set(userId, 'ADMIN')
  }
  return desired
}

/**
 * Canal de depto/área não é vitrine aberta — só membro ATIVO e **só no tenant
 * dono** (não vaza para PDE/subsede Caso B da worktree). Categoria na listagem
 * da Comunidade: Departamento (nunca Temático); sem pedido de entrada.
 *
 * Super-admin: `leituraSuperAdmin` libera listagem no tenant ativo sem
 * `MembroConversa` (oversight de plataforma — não escreve roster).
 * SA em modo operador (sem `SaasMembro` local) **não** entra em
 * `idsLiderancaTenant` / roster — ver `filtrarLiderancaOperadorPlataforma`.
 *
 * @param {{
 *   ehCanalDepartamentoOuArea: boolean,
 *   souMembroAtivo: boolean,
 *   tenantIdCanal?: string | null,
 *   viewerTenantId?: string | null,
 *   leituraSuperAdmin?: boolean,
 * }} input
 */
export function deveListarCanalDepartamentoNaComunidade(input) {
  if (!input.ehCanalDepartamentoOuArea) return true
  if (
    input.tenantIdCanal &&
    input.viewerTenantId &&
    input.tenantIdCanal !== input.viewerTenantId
  ) {
    return false
  }
  if (input.leituraSuperAdmin === true) return true
  if (input.souMembroAtivo !== true) return false
  return true
}

/**
 * Nome canônico do canal da frente.
 * @param {string} departamentoNome
 * @param {string} areaNome
 */
export function nomeCanalArea(departamentoNome, areaNome) {
  return `${departamentoNome} · ${areaNome}`
}

/**
 * Remove super-admins em modo operador do roster de liderança.
 * Dual-hat (SA + `SaasMembro` APROVADO não-espelhado no tenant) permanece.
 *
 * @param {{
 *   liderancaIds: Iterable<string>,
 *   superAdminUserIds: Iterable<string>,
 *   userIdsComVinculoLocal: Iterable<string>,
 * }} input
 * @returns {string[]}
 */
export function filtrarLiderancaOperadorPlataforma(input) {
  const sa = new Set(
    [...(input.superAdminUserIds ?? [])].filter(Boolean),
  )
  if (sa.size === 0) {
    return [...new Set([...(input.liderancaIds ?? [])].filter(Boolean))]
  }
  const comVinculo = new Set(
    [...(input.userIdsComVinculoLocal ?? [])].filter(Boolean),
  )
  const out = []
  const seen = new Set()
  for (const id of input.liderancaIds ?? []) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (sa.has(id) && !comVinculo.has(id)) continue
    out.push(id)
  }
  return out
}

/**
 * Inbox de Mensagens: canal de depto/área só fica se o viewer tem voz local
 * no tenant dono. SA operador (sem vínculo) não herda esses grupos ao
 * visitar a unidade — alinhar a `leituraSuperAdmin` (lê sem roster).
 *
 * @param {{
 *   ehCanalDepartamentoOuArea: boolean,
 *   tenantIdCanal?: string | null,
 *   tenantIdsComVinculoLocal: Iterable<string>,
 * }} input
 */
export function deveManterCanalDeptoNoInbox(input) {
  if (!input.ehCanalDepartamentoOuArea) return true
  const tenantId = input.tenantIdCanal
  if (!tenantId) return true
  const comVinculo = input.tenantIdsComVinculoLocal
  if (comVinculo instanceof Set) return comVinculo.has(tenantId)
  for (const id of comVinculo ?? []) {
    if (id === tenantId) return true
  }
  return false
}
