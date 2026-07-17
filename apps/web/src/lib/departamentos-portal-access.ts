/**
 * Regras do hub `/portal/departamentos`:
 * - Membro vê só áreas em que atua (UserDepartamento).
 * - Membro da Diretoria (ou super-admin) vê todas as áreas do tenant.
 * - Gestão/Operação só se for DepartamentoGestor daquela área (ou SA) —
 *   Diretoria não herda “gestor de tudo” só por ver o hub.
 */

export type DeptoHubBase = {
  id: string
  nome: string
  slug: string
  cor: string
  permissions: string[]
  permissionsGestor: string[]
  moduloPortal: string | null
  ordem: number
}

export type DeptoHubItem = DeptoHubBase & {
  isGestor: boolean
  isAtuacao: boolean
  /** Visível só porque é Diretoria — sem membership na área. */
  visaoDiretoria: boolean
}

function asSet(ids: Set<string> | string[]): Set<string> {
  return ids instanceof Set ? ids : new Set(ids)
}

export function resolverDepartamentosHub(input: {
  todos: DeptoHubBase[]
  membershipIds: Set<string> | string[]
  gestorIds: Set<string> | string[]
  diretoriaId: string | null
  isSuperAdmin?: boolean
}): DeptoHubItem[] {
  const membershipIds = asSet(input.membershipIds)
  const gestorIds = asSet(input.gestorIds)
  const isSuperAdmin = Boolean(input.isSuperAdmin)
  const isDiretoria =
    isSuperAdmin ||
    (input.diretoriaId != null && membershipIds.has(input.diretoriaId))

  const visibles = isDiretoria
    ? [...input.todos]
    : input.todos.filter((d) => membershipIds.has(d.id))

  visibles.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))

  return visibles.map((d) => {
    const isAtuacao = membershipIds.has(d.id)
    return {
      ...d,
      isGestor: isSuperAdmin || gestorIds.has(d.id),
      isAtuacao,
      visaoDiretoria: isDiretoria && !isAtuacao,
    }
  })
}

/** Pode abrir `/portal/departamentos/[slug]`? Atuação, Diretoria ou SA. */
export function podeAbrirDepartamentoPortal(input: {
  departamentoId: string
  membershipIds: Set<string> | string[]
  diretoriaId: string | null
  isSuperAdmin?: boolean
}): boolean {
  if (input.isSuperAdmin) return true
  const membershipIds = asSet(input.membershipIds)
  if (membershipIds.has(input.departamentoId)) return true
  if (input.diretoriaId && membershipIds.has(input.diretoriaId)) return true
  return false
}
