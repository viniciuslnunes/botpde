import {
  PAPEL_DEPARTAMENTO,
  PERMISSION_GROUPS,
  permissionsOfRole,
  rotuloCargoSistema,
} from '@torcida/types'

/** Linha do formato `alteracoes` que a aba Histórico do cadastro renderiza. */
export type AlteracaoAuditoria = { campo: string; de: string; para: string }

export interface AcessoRoleLite {
  id: string
  nome: string
  isSystem: boolean
  permissions: string[]
  permissionsExtras: string[]
  departamentoId: string | null
  papelNoDepartamento: string | null
}

export interface AcessoDepartamentoLite {
  id: string
  nome: string
  permissions: string[]
  permissionsGestor: string[]
}

export interface AcessoOverrideLite {
  permission: string
  granted: boolean
}

/** Rótulo humano de uma permissão (fallback: a própria chave). */
export function rotuloPermissao(chave: string): string {
  for (const grupo of PERMISSION_GROUPS) {
    const item = grupo.items.find((i: { key: string }) => i.key === chave)
    if (item) return item.label
  }
  return chave
}

/** Lista curta e legível — sem despejar 40 permissões numa linha do histórico. */
export function listaLegivel(valores: string[], max = 8): string {
  if (valores.length === 0) return '—'
  const ordenados = [...valores].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  if (ordenados.length <= max) return ordenados.join(', ')
  return `${ordenados.slice(0, max).join(', ')} +${ordenados.length - max}`
}

export interface DiffAcessoInput {
  rolesTenant: AcessoRoleLite[]
  deptoById: Map<string, AcessoDepartamentoLite>
  tipoSede: string
  perfilIdsAntes: Set<string>
  perfilIdsDepois: Set<string>
  overridesAntes: AcessoOverrideLite[]
  permissoesDepois: Set<string>
  /** Permissões cobertas pelos perfis DEPOIS da mudança. */
  cobertoDepois: Set<string>
}

/**
 * O que mudou no acesso de uma pessoa, em português, para o `AuditLog`.
 *
 * Existe porque o log guardava só `perfilIds`/`permissoesEfetivas` — ids crus,
 * sem estado anterior: dava para saber que alguém mexeu, nunca o que entrou ou
 * saiu, nem quem perdeu o quê. Cargo de sistema sai com o rótulo da unidade
 * (Presidente/Liderança), não com o nome interno do papel.
 */
export function diffAcessoUsuario(input: DiffAcessoInput): AlteracaoAuditoria[] {
  const { rolesTenant, deptoById, tipoSede } = input

  const rotuloRole = (role: AcessoRoleLite): string =>
    role.isSystem ? rotuloCargoSistema(role.nome, tipoSede) : role.nome

  const rolesDe = (ids: Set<string>): AcessoRoleLite[] =>
    rolesTenant.filter((r) => ids.has(r.id))

  /** Áreas derivadas dos perfis — gestor prevalece sobre colaborador. */
  const areasDe = (ids: Set<string>): string[] => {
    const porDepto = new Map<string, boolean>()
    for (const role of rolesDe(ids)) {
      if (!role.departamentoId) continue
      const gestor = role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR
      porDepto.set(role.departamentoId, (porDepto.get(role.departamentoId) ?? false) || gestor)
    }
    return [...porDepto.entries()].flatMap(([id, gestor]) => {
      const depto = deptoById.get(id)
      return depto ? [`${depto.nome}${gestor ? ' · gestor' : ''}`] : []
    })
  }

  const coberturaDe = (ids: Set<string>): Set<string> => {
    const saida = new Set<string>()
    for (const role of rolesDe(ids)) {
      const depto = role.departamentoId ? (deptoById.get(role.departamentoId) ?? null) : null
      for (const p of permissionsOfRole(role, depto)) saida.add(p)
    }
    return saida
  }

  const cobertoAntes = coberturaDe(input.perfilIdsAntes)

  const linhas: AlteracaoAuditoria[] = []
  const comparar = (campo: string, antes: string[], depois: string[]) => {
    const de = listaLegivel(antes)
    const para = listaLegivel(depois)
    if (de !== para) linhas.push({ campo, de, para })
  }

  comparar(
    'Cargos',
    rolesDe(input.perfilIdsAntes).map(rotuloRole),
    rolesDe(input.perfilIdsDepois).map(rotuloRole),
  )
  comparar('Áreas', areasDe(input.perfilIdsAntes), areasDe(input.perfilIdsDepois))
  comparar(
    'Permissões adicionais',
    input.overridesAntes
      .filter((p) => p.granted && !cobertoAntes.has(p.permission))
      .map((p) => rotuloPermissao(p.permission)),
    [...input.permissoesDepois].filter((p) => !input.cobertoDepois.has(p)).map(rotuloPermissao),
  )
  comparar(
    'Permissões revogadas do cargo',
    input.overridesAntes
      .filter((p) => !p.granted && cobertoAntes.has(p.permission))
      .map((p) => rotuloPermissao(p.permission)),
    [...input.cobertoDepois].filter((p) => !input.permissoesDepois.has(p)).map(rotuloPermissao),
  )

  return linhas
}
