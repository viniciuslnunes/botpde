/** Regras de afiliação territorial: Sede → Subsede → Ponto de Encontro (PDE). */

export type TipoSede = 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'

export type SedePaiLite = {
  id: string
  tipo: TipoSede
  tenantId: string | null
}

/**
 * Valida o vínculo pai/filho conforme a hierarquia territorial.
 * - SEDE: raiz (sem pai)
 * - SUBSEDE: filha de SEDE
 * - PONTO_ENCONTRO: filho de SEDE ou SUBSEDE
 */
export function validarHierarquiaSede(
  tipo: TipoSede,
  pai: SedePaiLite | null,
): string | null {
  if (tipo === 'SEDE') {
    if (pai) {
      return 'Uma Sede principal não pode ter unidade pai — ela é a raiz da hierarquia.'
    }
    return null
  }

  if (!pai) {
    if (tipo === 'SUBSEDE') {
      return 'Subsede precisa pertencer a uma Sede.'
    }
    return 'Ponto de encontro precisa pertencer a uma Sede ou Subsede.'
  }

  if (tipo === 'SUBSEDE' && pai.tipo !== 'SEDE') {
    return 'Subsede só pode ficar sob uma Sede (não sob outra Subsede ou PDE).'
  }

  if (tipo === 'PONTO_ENCONTRO' && pai.tipo === 'PONTO_ENCONTRO') {
    return 'Ponto de encontro não pode ficar sob outro ponto de encontro.'
  }

  return null
}

/** Impede rebaixar uma unidade que ainda tem filhos incompatíveis com o novo tipo. */
export function validarRebaixamentoComFilhos(
  novoTipo: TipoSede,
  filhosTipos: TipoSede[],
): string | null {
  if (filhosTipos.length === 0) return null

  if (novoTipo === 'PONTO_ENCONTRO') {
    return 'Não é possível mudar para Ponto de encontro enquanto houver unidades filhas. Remova ou reatribua os filhos antes.'
  }

  if (novoTipo === 'SUBSEDE' && filhosTipos.some((t) => t === 'SUBSEDE' || t === 'SEDE')) {
    return 'Subsede não pode ter outra Subsede ou Sede como filha. Reatribua esses locais antes.'
  }

  return null
}

/** Tipos de pai permitidos no select do formulário, dado o tipo escolhido. */
export function tiposPaiPermitidos(tipoFilho: TipoSede): TipoSede[] | null {
  if (tipoFilho === 'SEDE') return null // sem pai
  if (tipoFilho === 'SUBSEDE') return ['SEDE']
  return ['SEDE', 'SUBSEDE']
}
