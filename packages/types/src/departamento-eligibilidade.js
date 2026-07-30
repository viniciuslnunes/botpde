/**
 * Regra única para acesso efetivo a departamentos.
 *
 * `SaasMembro.departamentoId` é somente preferência. A elegibilidade exige o
 * vínculo canônico do próprio tenant; espelhos nunca recebem RBAC de área.
 *
 * @param {{
 *   tenantId: string,
 *   tipo: string,
 *   status: string,
 *   desligadoEm: Date | string | null,
 *   espelhado: boolean,
 *   membroOrigemId?: string | null,
 * } | null | undefined} membro
 * @param {string} tenantId
 */
export function isMembroElegivelDepartamento(membro, tenantId) {
  return Boolean(
    membro
      && membro.tenantId === tenantId
      && membro.tipo === 'SOCIO'
      && membro.status === 'APROVADO'
      && membro.desligadoEm === null
      && membro.espelhado === false
      && !membro.membroOrigemId,
  )
}
