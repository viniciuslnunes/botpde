'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  Loader2,
  Check,
  X,
  ShieldCheck,
  UserRound,
  ArrowLeft,
  Save,
  Pencil,
  Trash2,
} from 'lucide-react'
import {
  calculateEffectivePermissions,
  rotuloCargoSistema,
  PAPEL_DEPARTAMENTO,
  permissionsOfRole,
} from '@torcida/types'
import { salvarAcessoUsuario, salvarPerfilComposto } from '@/app/admin/acessos/actions'
import { atualizarRole, excluirRole } from '@/app/admin/configuracoes/actions'
import { AccessPermissionCompare } from '@/components/admin/access-permission-preview'
import { AccessPermissionWorktree, type PermissaoOrigem } from '@/components/admin/access-permission-worktree'
import { runPersistAction } from '@/lib/toast-action'

export interface AccessRoleOpt {
  id: string
  nome: string
  cor: string
  isSystem: boolean
  /** Já efetivas (pacote do depto + extras) — resolvidas na page. */
  permissions: string[]
  permissionsExtras?: string[]
  departamentoId?: string | null
  papelNoDepartamento?: string | null
}

export interface AccessDepartamentoOpt {
  id: string
  nome: string
  cor: string
  permissions: string[]
  permissionsGestor: string[]
}

export interface AccessUsuario {
  id: string
  nome: string | null
  email: string | null
  avatarUrl: string | null
  perfilIds: string[]
  departamentoIds: string[]
  gestorDepartamentoIds: string[]
  permissoesAdicionais: { permission: string; granted: boolean }[]
}

type PainelAba = 'perfis' | 'departamentos' | 'adicionais'

function roleLabel(role: AccessRoleOpt, tipoSede: string): string {
  return role.isSystem ? rotuloCargoSistema(role.nome, tipoSede) : role.nome
}

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function coberturaDePerfis(roles: AccessRoleOpt[], perfilIds: Set<string>): Set<string> {
  return new Set(roles.filter((r) => perfilIds.has(r.id)).flatMap((r) => r.permissions))
}

function diffCoberturaEfetiva(
  cobertura: Set<string>,
  efetivas: Iterable<string>,
): { extras: Set<string>; revogadas: Set<string> } {
  const efetivasSet = new Set(efetivas)
  const extras = new Set<string>()
  const revogadas = new Set<string>()
  for (const p of efetivasSet) {
    if (!cobertura.has(p)) extras.add(p)
  }
  for (const p of cobertura) {
    if (!efetivasSet.has(p)) revogadas.add(p)
  }
  return { extras, revogadas }
}

function efetivasDe(
  cobertura: Set<string>,
  extras: Set<string>,
  revogadas: Set<string>,
): Set<string> {
  const next = new Set(cobertura)
  for (const p of revogadas) next.delete(p)
  for (const p of extras) next.add(p)
  return next
}

export function AccessUserPanel({
  usuario,
  roles: rolesProp,
  departamentos,
  tipoSede,
  onClose,
}: {
  usuario: AccessUsuario
  roles: AccessRoleOpt[]
  departamentos: AccessDepartamentoOpt[]
  tipoSede: string
  onClose: () => void
}) {
  const [aba, setAba] = useState<PainelAba>('perfis')
  const [pending, startTransition] = useTransition()
  const [roles, setRoles] = useState<AccessRoleOpt[]>(rolesProp)
  const [perfilIds, setPerfilIds] = useState<Set<string>>(() => new Set(usuario.perfilIds))
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [novoPerfilNome, setNovoPerfilNome] = useState('')
  const [gerenciandoRoleId, setGerenciandoRoleId] = useState<string | null>(null)

  const [overridesUi, setOverridesUi] = useState(() => {
    const cob = coberturaDePerfis(rolesProp, new Set(usuario.perfilIds))
    const efetivas = calculateEffectivePermissions([...cob], usuario.permissoesAdicionais)
    return diffCoberturaEfetiva(cob, efetivas)
  })

  const coberturaBase = useMemo(
    () => coberturaDePerfis(roles, perfilIds),
    [roles, perfilIds],
  )

  const permissoes = useMemo(
    () => efetivasDe(coberturaBase, overridesUi.extras, overridesUi.revogadas),
    [coberturaBase, overridesUi],
  )

  const deptoById = useMemo(
    () => new Map(departamentos.map((d) => [d.id, d])),
    [departamentos],
  )

  const roleGerenciando = useMemo(
    () => (gerenciandoRoleId ? roles.find((r) => r.id === gerenciandoRoleId) ?? null : null),
    [roles, gerenciandoRoleId],
  )

  const areasDerivadas = useMemo(() => {
    const map = new Map<string, { nome: string; cor: string; gestor: boolean }>()
    for (const role of roles) {
      if (!perfilIds.has(role.id) || !role.departamentoId) continue
      const depto = deptoById.get(role.departamentoId)
      if (!depto) continue
      const gestor = role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR
      const atual = map.get(depto.id)
      map.set(depto.id, {
        nome: depto.nome,
        cor: depto.cor,
        gestor: Boolean(atual?.gestor || gestor),
      })
    }
    return [...map.values()]
  }, [roles, perfilIds, deptoById])

  const gruposPerfil = useMemo(() => {
    const groups: { key: string; label: string; cor?: string; items: AccessRoleOpt[] }[] = []
    const byDepto = new Map<string, AccessRoleOpt[]>()
    const transversais: AccessRoleOpt[] = []

    for (const role of roles) {
      if (role.departamentoId && deptoById.has(role.departamentoId)) {
        const list = byDepto.get(role.departamentoId) ?? []
        list.push(role)
        byDepto.set(role.departamentoId, list)
      } else {
        transversais.push(role)
      }
    }

    for (const depto of departamentos) {
      const items = byDepto.get(depto.id)
      if (items?.length) {
        groups.push({ key: depto.id, label: depto.nome, cor: depto.cor, items })
      }
    }
    if (transversais.length > 0) {
      groups.unshift({ key: '_transversal', label: 'Transversais / Governança', items: transversais })
    }
    return groups
  }, [roles, departamentos, deptoById])

  const nomeExibicao = usuario.nome ?? usuario.email ?? 'Usuário sem nome'
  const totalPerms = permissoes.size
  const totalPerfis = perfilIds.size
  const totalExtras = overridesUi.extras.size

  function aplicarMudancaPerfis(nextPerfis: Set<string>) {
    const prev = coberturaBase
    const next = coberturaDePerfis(roles, nextPerfis)
    setOverridesUi((cur) => {
      const extras = new Set(cur.extras)
      const revogadas = new Set(cur.revogadas)
      for (const p of next) {
        if (!prev.has(p)) {
          revogadas.delete(p)
          extras.delete(p)
        }
      }
      for (const p of prev) {
        if (!next.has(p)) revogadas.delete(p)
      }
      for (const p of extras) {
        if (next.has(p)) extras.delete(p)
      }
      return { extras, revogadas }
    })
  }

  function togglePerfil(roleId: string) {
    const next = new Set(perfilIds)
    if (next.has(roleId)) next.delete(roleId)
    else next.add(roleId)
    aplicarMudancaPerfis(next)
    setPerfilIds(next)
  }

  /** Alterna perfil Membro/Gestor da área — mesma fonte de verdade da aba Perfis. */
  function setPapelDepartamento(departamentoId: string, papel: 'MEMBRO' | 'GESTOR' | null) {
    const roleMembro = roles.find(
      (r) =>
        r.departamentoId === departamentoId &&
        r.papelNoDepartamento === PAPEL_DEPARTAMENTO.MEMBRO,
    )
    const roleGestor = roles.find(
      (r) =>
        r.departamentoId === departamentoId &&
        r.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR,
    )
    const next = new Set(perfilIds)
    if (roleMembro) next.delete(roleMembro.id)
    if (roleGestor) next.delete(roleGestor.id)
    if (papel === 'MEMBRO' && roleMembro) next.add(roleMembro.id)
    if (papel === 'GESTOR' && roleGestor) next.add(roleGestor.id)
    aplicarMudancaPerfis(next)
    setPerfilIds(next)
  }

  function papelAtualDepartamento(departamentoId: string): 'MEMBRO' | 'GESTOR' | null {
    const temGestor = roles.some(
      (r) =>
        perfilIds.has(r.id) &&
        r.departamentoId === departamentoId &&
        r.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR,
    )
    if (temGestor) return 'GESTOR'
    const temMembro = roles.some(
      (r) =>
        perfilIds.has(r.id) &&
        r.departamentoId === departamentoId &&
        r.papelNoDepartamento === PAPEL_DEPARTAMENTO.MEMBRO,
    )
    return temMembro ? 'MEMBRO' : null
  }

  function origemBadge(permission: string): PermissaoOrigem {
    const coberta = coberturaBase.has(permission)
    if (!permissoes.has(permission) && coberta) return 'revogada'
    if (permissoes.has(permission) && !coberta) return 'extra'
    if (coberta) return 'via perfil'
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    perfilIds.forEach((id) => fd.append('perfilIds', id))
    permissoes.forEach((p) => fd.append('permissoes', p))

    startTransition(async () => {
      await runPersistAction(() => salvarAcessoUsuario(usuario.id, fd), {
        success: 'Acesso atualizado.',
      })
      onClose()
    })
  }

  async function handleSalvarComoPerfil() {
    const nome = novoPerfilNome.trim()
    if (nome.length < 2) return

    const deptoRole = roles.find((r) => perfilIds.has(r.id) && r.departamentoId)
    const extrasList = [...overridesUi.extras]
    const fd = new FormData()
    fd.set('nome', nome)
    fd.set('cor', deptoRole?.cor ?? '#6b7280')
    fd.set('userId', usuario.id)
    if (deptoRole?.departamentoId && deptoRole.papelNoDepartamento) {
      fd.set('departamentoId', deptoRole.departamentoId)
      fd.set('papelNoDepartamento', deptoRole.papelNoDepartamento)
    }
    for (const p of extrasList) fd.append('permissionsExtras', p)

    setSalvandoPerfil(true)
    try {
      const box: { current: Awaited<ReturnType<typeof salvarPerfilComposto>> | null } = {
        current: null,
      }
      const ok = await runPersistAction(async () => {
        box.current = await salvarPerfilComposto(fd)
        return box.current
      }, {
        success: 'Novo perfil criado e atribuído a esta pessoa.',
      })
      const result = box.current
      if (!ok || !result) return

      const depto = result.departamentoId ? deptoById.get(result.departamentoId) : null
      const novoRole: AccessRoleOpt = {
        id: result.id,
        nome: result.nome,
        cor: result.cor,
        isSystem: result.isSystem,
        permissionsExtras: result.permissionsExtras,
        departamentoId: result.departamentoId,
        papelNoDepartamento: result.papelNoDepartamento,
        permissions: permissionsOfRole(
          {
            permissions: result.departamentoId ? [] : extrasList,
            permissionsExtras: result.departamentoId ? extrasList : result.permissionsExtras,
            departamentoId: result.departamentoId,
            papelNoDepartamento: result.papelNoDepartamento,
          },
          depto
            ? { permissions: depto.permissions, permissionsGestor: depto.permissionsGestor }
            : null,
        ),
      }

      setRoles((prev) => [...prev, novoRole])
      const nextPerfis = new Set(perfilIds)
      nextPerfis.add(result.id)
      setOverridesUi((cur) => {
        const extras = new Set(cur.extras)
        for (const p of extrasList) extras.delete(p)
        return { extras, revogadas: cur.revogadas }
      })
      setPerfilIds(nextPerfis)
      setNovoPerfilNome('')
      setAba('perfis')
      setGerenciandoRoleId(result.id)
    } finally {
      setSalvandoPerfil(false)
    }
  }

  async function handleAtualizarPerfil(
    roleId: string,
    data: { nome: string; cor: string; extras: string[] },
  ) {
    const role = roles.find((r) => r.id === roleId)
    if (!role || role.isSystem) return false

    const fd = new FormData()
    fd.set('nome', data.nome)
    fd.set('cor', data.cor)
    if (role.departamentoId && role.papelNoDepartamento) {
      fd.set('departamentoId', role.departamentoId)
      fd.set('papelNoDepartamento', role.papelNoDepartamento)
    }
    for (const p of data.extras) fd.append('permissionsExtras', p)
    if (!role.departamentoId) {
      for (const p of data.extras) fd.append('permissions', p)
    }

    const ok = await runPersistAction(() => atualizarRole(roleId, fd), {
      success: 'Perfil atualizado.',
    })
    if (!ok) return false

    const depto = role.departamentoId ? deptoById.get(role.departamentoId) : null
    const permissions = permissionsOfRole(
      {
        permissions: role.departamentoId ? [] : data.extras,
        permissionsExtras: role.departamentoId ? data.extras : [],
        departamentoId: role.departamentoId,
        papelNoDepartamento: role.papelNoDepartamento,
      },
      depto
        ? { permissions: depto.permissions, permissionsGestor: depto.permissionsGestor }
        : null,
    )

    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? {
              ...r,
              nome: data.nome,
              cor: data.cor,
              permissionsExtras: data.extras,
              permissions,
            }
          : r,
      ),
    )
    return true
  }

  async function handleExcluirPerfil(roleId: string) {
    const role = roles.find((r) => r.id === roleId)
    if (!role || role.isSystem) return false

    const fd = new FormData()
    if (perfilIds.has(roleId)) fd.set('liberarUserId', usuario.id)

    const ok = await runPersistAction(() => excluirRole(roleId, fd), {
      success: 'Perfil excluído.',
    })
    if (!ok) return false

    const nextPerfis = new Set(perfilIds)
    nextPerfis.delete(roleId)
    aplicarMudancaPerfis(nextPerfis)
    setPerfilIds(nextPerfis)
    setRoles((prev) => prev.filter((r) => r.id !== roleId))
    setGerenciandoRoleId(null)
    return true
  }

  const abas: { id: PainelAba; label: string; count: number }[] = [
    { id: 'perfis', label: 'Perfis', count: totalPerfis },
    { id: 'departamentos', label: 'Departamentos', count: areasDerivadas.length },
    { id: 'adicionais', label: 'Permissões adicionais', count: totalExtras },
  ]

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm"
    >
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={onClose}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar à lista
        </button>
        <div className="flex items-start gap-3 sm:gap-4">
          {usuario.avatarUrl ? (
            <img
              src={usuario.avatarUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full object-cover sm:h-14 sm:w-14"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-sm font-semibold text-white sm:h-14 sm:w-14">
              {initials(nomeExibicao)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-[rgb(var(--foreground))] sm:text-xl">
              {nomeExibicao}
            </h2>
            {usuario.email && (
              <p className="truncate text-sm text-[rgb(var(--foreground-muted))]">{usuario.email}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[rgb(var(--foreground-muted))]">
              <span className="rounded-full bg-[rgb(var(--surface))] px-2 py-0.5">
                {totalPerfis} perfil{totalPerfis === 1 ? '' : 'is'}
              </span>
              <span className="rounded-full bg-[rgb(var(--surface))] px-2 py-0.5">
                {areasDerivadas.length} área{areasDerivadas.length === 1 ? '' : 's'}
              </span>
              <span className="rounded-full bg-[rgb(var(--surface))] px-2 py-0.5">
                {totalPerms} permiss{totalPerms === 1 ? 'ão' : 'ões'}
              </span>
            </div>
            {areasDerivadas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {areasDerivadas.map((a) => (
                  <span
                    key={a.nome}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground))]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: a.cor }} />
                    {a.nome}
                    {a.gestor ? ' · gestor' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="app-scrollbar-none flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[rgb(var(--border))] px-3 pt-2 sm:px-6">
        {abas.map((item) => {
          const active = aba === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba(item.id)}
              className={[
                'inline-flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border border-b-0 border-[rgb(var(--border))] -mb-px bg-[rgb(var(--surface))] text-[rgb(var(--primary))]'
                  : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {item.label}
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  active
                    ? 'bg-[rgb(var(--primary))] text-white'
                    : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {item.count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="max-h-[min(70vh,40rem)] overflow-y-auto px-4 py-5 sm:px-6">
        {aba === 'perfis' && (
          <div className="space-y-5">
            {roleGerenciando ? (
              <PerfilManagePanel
                key={roleGerenciando.id}
                role={roleGerenciando}
                tipoSede={tipoSede}
                departamentos={departamentos}
                atribuido={perfilIds.has(roleGerenciando.id)}
                onClose={() => setGerenciandoRoleId(null)}
                onToggleAtribuicao={() => togglePerfil(roleGerenciando.id)}
                onSave={(data) => handleAtualizarPerfil(roleGerenciando.id, data)}
                onDelete={() => handleExcluirPerfil(roleGerenciando.id)}
              />
            ) : (
              <>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  Clique no perfil para editar ou excluir. O check à direita atribui ou remove a
                  pessoa. Perfis de área também colocam no departamento (membro ou gestor).
                </p>
                {gruposPerfil.map((grupo) => (
                  <div key={grupo.key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      {grupo.cor && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: grupo.cor }}
                        />
                      )}
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        {grupo.label}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {grupo.items.map((role) => {
                        const checked = perfilIds.has(role.id)
                        return (
                          <div
                            key={role.id}
                            className={[
                              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                              checked
                                ? 'border-[rgb(var(--primary)_/_0.45)] bg-[rgb(var(--primary)_/_0.08)] text-[rgb(var(--foreground))]'
                                : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--border-strong))]',
                            ].join(' ')}
                          >
                            <button
                              type="button"
                              onClick={() => setGerenciandoRoleId(role.id)}
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                            >
                              <span
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{ backgroundColor: role.cor }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium leading-snug">
                                  {roleLabel(role, tipoSede)}
                                </span>
                                <span className="text-[10px] uppercase tracking-wide opacity-70">
                                  {role.isSystem
                                    ? 'Sistema'
                                    : role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR
                                      ? 'Gestor · editar'
                                      : role.papelNoDepartamento === PAPEL_DEPARTAMENTO.MEMBRO
                                        ? 'Membro · editar'
                                        : 'Editar'}
                                </span>
                              </span>
                              {!role.isSystem && (
                                <Pencil className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label={checked ? 'Remover perfil' : 'Atribuir perfil'}
                              onClick={() => togglePerfil(role.id)}
                              className={[
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                                checked
                                  ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
                                  : 'border-[rgb(var(--border-strong))]',
                              ].join(' ')}
                            >
                              {checked && <Check className="h-2.5 w-2.5 text-white" />}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {aba === 'departamentos' && (
          <DepartamentoAreasPanel
            departamentos={departamentos}
            roles={roles}
            papelAtual={papelAtualDepartamento}
            onSetPapel={setPapelDepartamento}
          />
        )}

        {aba === 'adicionais' && (
          <div className="space-y-4">
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Extras além do pacote dos perfis. Desmarcar o que o perfil concede cria uma
              revogação. Preferira ajustar o template do cargo ou{' '}
              <strong className="font-medium text-[rgb(var(--foreground))]">
                salvar como novo perfil
              </strong>{' '}
              para reutilizar.
            </p>

            {(overridesUi.extras.size > 0 || overridesUi.revogadas.size > 0) && (
              <div className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
                <p className="mb-2 text-xs font-medium text-[rgb(var(--foreground))]">
                  Salvar composição como novo perfil
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={novoPerfilNome}
                    onChange={(e) => setNovoPerfilNome(e.target.value)}
                    placeholder="Nome do perfil (ex.: Gestor Financeiro+)"
                    className="min-w-[12rem] flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
                  />
                  <button
                    type="button"
                    disabled={salvandoPerfil || novoPerfilNome.trim().length < 2}
                    onClick={() => void handleSalvarComoPerfil()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {salvandoPerfil ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Salvar perfil
                  </button>
                </div>
              </div>
            )}

            <AccessPermissionWorktree
              selected={permissoes}
              onChange={(next) => setOverridesUi(diffCoberturaEfetiva(coberturaBase, next))}
              origemOf={origemBadge}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 sm:px-6">
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Alterações só valem após salvar. Áreas seguem os perfis marcados.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar acesso
          </button>
        </div>
      </div>
    </form>
  )
}

function pacoteDepartamento(
  role: AccessRoleOpt,
  departamentos: AccessDepartamentoOpt[],
): Set<string> {
  if (!role.departamentoId) return new Set()
  const depto = departamentos.find((d) => d.id === role.departamentoId)
  if (!depto) return new Set()
  const base = depto.permissions
  const gestor =
    role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR ? depto.permissionsGestor : []
  return new Set([...base, ...gestor])
}

function PerfilManagePanel({
  role,
  tipoSede,
  departamentos,
  atribuido,
  onClose,
  onToggleAtribuicao,
  onSave,
  onDelete,
}: {
  role: AccessRoleOpt
  tipoSede: string
  departamentos: AccessDepartamentoOpt[]
  atribuido: boolean
  onClose: () => void
  onToggleAtribuicao: () => void
  onSave: (data: { nome: string; cor: string; extras: string[] }) => Promise<boolean>
  onDelete: () => Promise<boolean>
}) {
  const [nome, setNome] = useState(role.nome)
  const [cor, setCor] = useState(role.cor)
  const [extras, setExtras] = useState(() => {
    if (role.departamentoId) return new Set(role.permissionsExtras ?? [])
    // Transversal: permissões próprias ficam em `permissions` (ou extras se preenchido)
    if (role.permissionsExtras && role.permissionsExtras.length > 0) {
      return new Set(role.permissionsExtras)
    }
    return new Set(role.permissions)
  })
  const [pending, setPending] = useState(false)
  const [confirmExcluir, setConfirmExcluir] = useState(false)
  const pacote = useMemo(() => pacoteDepartamento(role, departamentos), [role, departamentos])
  const deptoNome = role.departamentoId
    ? departamentos.find((d) => d.id === role.departamentoId)?.nome
    : null
  const somenteLeitura = role.isSystem

  async function salvar() {
    if (somenteLeitura) return
    setPending(true)
    try {
      const ok = await onSave({ nome: nome.trim(), cor, extras: [...extras] })
      if (ok) onClose()
    } finally {
      setPending(false)
    }
  }

  async function excluir() {
    if (somenteLeitura) return
    setPending(true)
    try {
      await onDelete()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar aos perfis
        </button>
        <button
          type="button"
          onClick={onToggleAtribuicao}
          className={[
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium',
            atribuido
              ? 'border-[rgb(var(--primary)_/_0.45)] bg-[rgb(var(--primary)_/_0.08)] text-[rgb(var(--primary))]'
              : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
          ].join(' ')}
        >
          {atribuido ? <Check className="h-3 w-3" /> : null}
          {atribuido ? 'Atribuído a esta pessoa' : 'Atribuir a esta pessoa'}
        </button>
      </div>

      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cor }} />
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            {roleLabel(role, tipoSede)}
          </h3>
          {somenteLeitura && (
            <span className="rounded-full bg-[rgb(var(--surface))] px-2 py-0.5 text-[10px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
              Sistema
            </span>
          )}
        </div>

        {somenteLeitura ? (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Perfis do sistema não podem ser editados nem excluídos. Use a atribuição acima ou crie
            um perfil personalizado na aba de permissões adicionais.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                  Nome
                </span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                  Cor
                </span>
                <input
                  type="color"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  className="h-10 w-full min-w-[3.5rem] cursor-pointer rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-1 sm:w-14"
                />
              </label>
            </div>
            {deptoNome && (
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Área: <strong className="font-medium text-[rgb(var(--foreground))]">{deptoNome}</strong>
                {role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR ? ' · Gestor' : ' · Membro'}
                . O pacote da área é herdado; abaixo só extras do perfil.
              </p>
            )}
          </div>
        )}
      </div>

      {!somenteLeitura && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[rgb(var(--foreground))]">
            Permissões extras do perfil
          </p>
          <AccessPermissionWorktree
            initiallyOpen={false}
            selected={new Set([...pacote, ...extras])}
            lockedKeys={pacote}
            origemOf={(key) => {
              if (pacote.has(key)) return 'via perfil'
              if (extras.has(key)) return 'extra'
              return null
            }}
            onChange={(next) => {
              const onlyExtras = new Set<string>()
              for (const key of next) {
                if (!pacote.has(key)) onlyExtras.add(key)
              }
              setExtras(onlyExtras)
            }}
          />
        </div>
      )}

      {!somenteLeitura && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--border))] pt-3">
          <div>
            {confirmExcluir ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[rgb(var(--foreground-muted))]">Excluir de vez?</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void excluir()}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <Trash2 className="h-3 w-3" />
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmExcluir(false)}
                  className="text-xs text-[rgb(var(--foreground-muted))]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmExcluir(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/5 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir perfil
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={pending || nome.trim().length < 2}
            onClick={() => void salvar()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar perfil
          </button>
        </div>
      )}
    </div>
  )
}

function DepartamentoAreasPanel({
  departamentos,
  roles,
  papelAtual,
  onSetPapel,
}: {
  departamentos: AccessDepartamentoOpt[]
  roles: AccessRoleOpt[]
  papelAtual: (departamentoId: string) => 'MEMBRO' | 'GESTOR' | null
  onSetPapel: (departamentoId: string, papel: 'MEMBRO' | 'GESTOR' | null) => void
}) {
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const detalheRef = useRef<HTMLDivElement>(null)
  const detalhe = departamentos.find((d) => d.id === detalheId) ?? null

  function abrirPacote(id: string) {
    const fechar = detalheId === id
    setDetalheId(fechar ? null : id)
    if (!fechar) {
      requestAnimationFrame(() => {
        detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Áreas da torcida. Marcar <strong className="font-medium text-[rgb(var(--foreground))]">Membro</strong>{' '}
        ou <strong className="font-medium text-[rgb(var(--foreground))]">Gestor</strong> atribui o perfil
        correspondente da área (mesma regra da aba Perfis). Use Pacote para ver o template.
      </p>

      {detalhe && (
        <div
          ref={detalheRef}
          className="scroll-mt-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] p-4 sm:p-5"
          style={{ borderTopColor: detalhe.cor, borderTopWidth: 3 }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: detalhe.cor }}
              />
              <h3 className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                Pacote · {detalhe.nome}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setDetalheId(null)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]"
            >
              Fechar
            </button>
          </div>
          <AccessPermissionCompare
            permissionsMembro={detalhe.permissions}
            permissionsGestor={detalhe.permissionsGestor}
          />
        </div>
      )}

      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {departamentos.map((depto) => {
          const papel = papelAtual(depto.id)
          const isMembro = papel === 'MEMBRO' || papel === 'GESTOR'
          const isGestor = papel === 'GESTOR'
          const ativo = isMembro
          const temPerfis = roles.some((r) => r.departamentoId === depto.id)
          const organizacional =
            depto.permissions.length === 0 && depto.permissionsGestor.length === 0
          const selecionado = detalheId === depto.id

          return (
            <div
              key={depto.id}
              className={[
                'flex flex-col rounded-2xl border bg-[rgb(var(--surface))]',
                selecionado
                  ? 'border-[rgb(var(--primary))] ring-1 ring-[rgb(var(--primary)_/_0.25)]'
                  : ativo
                    ? 'border-[rgb(var(--primary)_/_0.45)]'
                    : 'border-[rgb(var(--border))]',
              ].join(' ')}
              style={{ borderTopColor: depto.cor, borderTopWidth: 3 }}
            >
              <div className="flex items-start gap-2.5 px-3.5 py-3">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: depto.cor }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                    {depto.nome}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
                    {organizacional
                      ? 'Organizacional'
                      : `Colab. ${depto.permissions.length} · Gestor+ ${depto.permissionsGestor.length}`}
                    {!temPerfis ? ' · sem perfil canônico' : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-[rgb(var(--border))] px-3 py-2.5">
                <button
                  type="button"
                  disabled={!temPerfis}
                  onClick={() =>
                    onSetPapel(depto.id, papel === 'MEMBRO' ? null : 'MEMBRO')
                  }
                  className={[
                    'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40',
                    isMembro && !isGestor
                      ? 'bg-[rgb(var(--primary))] text-white'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  Membro
                </button>
                <button
                  type="button"
                  disabled={!temPerfis}
                  onClick={() =>
                    onSetPapel(depto.id, papel === 'GESTOR' ? 'MEMBRO' : 'GESTOR')
                  }
                  className={[
                    'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40',
                    isGestor
                      ? 'bg-[rgb(var(--primary))] text-white'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  Gestor
                </button>
                <button
                  type="button"
                  onClick={() => abrirPacote(depto.id)}
                  className={[
                    'ml-auto rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors',
                    selecionado
                      ? 'bg-[rgb(var(--primary)_/_0.15)] text-[rgb(var(--primary))]'
                      : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  Pacote
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {departamentos.length === 0 && (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum departamento nesta torcida. Crie templates em Controle de acesso → Departamentos.
        </p>
      )}
    </div>
  )
}

export function AccessUserNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-6 py-10 text-center">
      <UserRound className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
      <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Usuário não encontrado</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--foreground-muted))]">
        Este link aponta para alguém que não está mais nesta torcida (ou o id é inválido).
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white"
      >
        <ShieldCheck className="h-4 w-4" />
        Voltar à lista
      </button>
    </div>
  )
}
