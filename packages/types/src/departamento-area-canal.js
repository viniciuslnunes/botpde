/**
 * Canal por área de atuação — vínculo manual a `Conversa` tipo CANAL.
 * Anti-spam: nunca auto-cria canal; uma conversa só pode apontar para um
 * dono (área XOR departamento XOR sede — validado na action).
 */

/**
 * @param {{
 *   conversaId: string | null,
 *   areaId: string,
 *   usadoPorDepartamentoId?: string | null,
 *   usadoPorAreaId?: string | null,
 *   usadoPorSedeId?: string | null,
 * }} input
 * @returns {string | null} mensagem de erro ou null se ok
 */
export function validarVinculoCanalArea(input) {
  if (input.conversaId == null) return null
  if (input.usadoPorSedeId) {
    return 'Este canal já é o canal oficial de uma unidade (sede/subsede).'
  }
  if (input.usadoPorDepartamentoId) {
    return 'Este canal já é o canal oficial de um departamento.'
  }
  if (input.usadoPorAreaId && input.usadoPorAreaId !== input.areaId) {
    return 'Este canal já está vinculado a outra área de atuação.'
  }
  return null
}
