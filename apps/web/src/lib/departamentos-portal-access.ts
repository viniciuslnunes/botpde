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

export type AreaBase = {
  id: string
  nome: string
  slug: string
  descricao: string | null
  icone: string | null
  ordem: number
  ativa: boolean
  sazonal: boolean
  /** Checklist leve (`meta.checklist`) — serializável JSON. */
  meta?: unknown
  /** Canal da frente (opcional). */
  canalConversaId?: string | null
  canalNome?: string | null
}

export type AreaAcesso = AreaBase & {
  isMembro: boolean
  isResponsavel: boolean
  /** Gestão da área = gestão do departamento (ou SA) — NUNCA deriva de isResponsavel. */
  podeGerir: boolean
}

/**
 * Resolve as áreas de um departamento sob o ponto de vista de quem está
 * olhando: minhas áreas primeiro, depois ativas, depois `ordem`/nome.
 * `RESPONSAVEL` de área é rótulo de accountability — não concede gestão.
 */
export function resolverAreasDepartamento(input: {
  areas: AreaBase[]
  membroAreaIds: Set<string> | string[]
  responsavelAreaIds: Set<string> | string[]
  isGestorDepartamento: boolean
  isSuperAdmin?: boolean
}): AreaAcesso[] {
  const membroAreaIds = asSet(input.membroAreaIds)
  const responsavelAreaIds = asSet(input.responsavelAreaIds)
  const podeGerir = Boolean(input.isGestorDepartamento || input.isSuperAdmin)

  const resolved = input.areas.map((area) => ({
    ...area,
    isMembro: membroAreaIds.has(area.id),
    isResponsavel: responsavelAreaIds.has(area.id),
    podeGerir,
  }))

  resolved.sort((a, b) => {
    if (a.isMembro !== b.isMembro) return a.isMembro ? -1 : 1
    if (a.ativa !== b.ativa) return a.ativa ? -1 : 1
    if (a.ordem !== b.ordem) return a.ordem - b.ordem
    return a.nome.localeCompare(b.nome)
  })

  return resolved
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
