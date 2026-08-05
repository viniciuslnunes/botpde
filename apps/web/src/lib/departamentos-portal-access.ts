/**
 * Regras do hub `/portal/departamentos`:
 * - Membro vê só áreas em que atua (UserDepartamento).
 * - Membro da Diretoria (ou super-admin em modo operador) vê todas as áreas
 *   do tenant.
 * - Visão de administrador (gestão/operação na UI): `DepartamentoGestor` da
 *   área **ou** `roles:manage` no tenant (Presidência / Liderança / Admin /
 *   Vice). Super-admin **sem** cargo no tenant continua oversight de leitura —
 *   o bypass da plataforma sozinho não concede gestão.
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
  /** Gestor da área (row) ou gestão global via `roles:manage`. */
  isGestor: boolean
  isAtuacao: boolean
  /**
   * Visível por oversight da Diretoria/SA, sem `UserDepartamento` nesta área.
   * Não implica só-leitura: com `roles:manage` (`isGestor`) a UI é de admin.
   */
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
  /**
   * Presidência / Liderança / Admin / Vice (`roles:manage`): visão de gestor
   * em todos os departamentos visíveis — espelha `canManageDepartamento`.
   */
  podeGerirGlobal?: boolean
}): DeptoHubItem[] {
  const membershipIds = asSet(input.membershipIds)
  const gestorIds = asSet(input.gestorIds)
  const isSuperAdmin = Boolean(input.isSuperAdmin)
  const podeGerirGlobal = Boolean(input.podeGerirGlobal)
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
      // Gestão: row de DepartamentoGestor OU cargo com roles:manage no tenant.
      isGestor: podeGerirGlobal || gestorIds.has(d.id),
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
  canalAvatarUrl?: string | null
}

export type AreaAcesso = AreaBase & {
  isMembro: boolean
  isResponsavel: boolean
  /** Gestão da área = gestão do departamento — NUNCA deriva de isResponsavel nem de SA. */
  podeGerir: boolean
}

/**
 * Resolve as áreas de um departamento sob o ponto de vista de quem está
 * olhando: minhas áreas primeiro, depois ativas, depois `ordem`/nome.
 * `RESPONSAVEL` de área é rótulo de accountability — não concede gestão.
 * `podeGerir` vem de `isGestorDepartamento` (row **ou** `roles:manage` no
 * call site). Super-admin sem cargo no tenant não recebe gestão — o parâmetro
 * `isSuperAdmin` é ignorado (legado).
 */
export function resolverAreasDepartamento(input: {
  areas: AreaBase[]
  membroAreaIds: Set<string> | string[]
  responsavelAreaIds: Set<string> | string[]
  isGestorDepartamento: boolean
  /** @deprecated Não concede gestão — mantido só por compatibilidade de call sites. */
  isSuperAdmin?: boolean
}): AreaAcesso[] {
  const membroAreaIds = asSet(input.membroAreaIds)
  const responsavelAreaIds = asSet(input.responsavelAreaIds)
  void input.isSuperAdmin
  const podeGerir = Boolean(input.isGestorDepartamento)

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
