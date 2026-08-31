'use client'

import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
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
  SYSTEM_ROLES,
} from '@torcida/types'
import { toast } from '@torcida/ui'
import { salvarAcessoUsuario, salvarPerfilComposto } from '@/app/admin/(plataforma)/acessos/actions'
import { atualizarRole, excluirRole } from '@/app/admin/(plataforma)/configuracoes/actions'
import { AccessPermissionCompare } from '@/components/admin/access-permission-preview'
import { AccessPermissionWorktree, type PermissaoOrigem } from '@/components/admin/access-permission-worktree'
import { runPersistAction } from '@/lib/toast-action'
import { useConfirmDialog } from '@/lib/confirm-action'
import { useUnsavedChanges, useUnsavedChangesContext } from '@/lib/unsaved-changes'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { AppModal, AppModalBody } from '@/components/ui/app-modal'
import { AvatarFoto } from '@/components/media/avatar-foto'

export interface AccessRoleOpt {
  id: string
  nome: string
  cor: string
  isSystem: boolean
  /** Já efetivas (pacote do depto + extras) — resolvidas na page. */
  permissions: string[]
  /** Pacote herdado do departamento (sem extras) — para pré-seleção locked na UI. */
  permissionsPacote?: string[]
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

export type OwnerOcupadoPor = {
  userId: string
  nome: string | null
}

export function AccessUserPanel({
  usuario,
  roles: rolesProp,
  departamentos,
  tipoSede,
  onClose,
  variant = 'pagina',
  ownerOcupadoPor = null,
}: {
  usuario: AccessUsuario
  roles: AccessRoleOpt[]
  departamentos: AccessDepartamentoOpt[]
  tipoSede: string
  onClose: () => void
  ownerOcupadoPor?: OwnerOcupadoPor | null
  /**
   * `pagina` — painel autônomo de `/admin/acessos`: card com identidade da
   * pessoa, back-link e `StickyPersistBar`.
   * `embutido` — dentro de um contêiner que já identifica a pessoa (aba
   * Acessos do card de membro). Sem cabeçalho duplicado e com rodapé de ações
   * **no fluxo**: a `StickyPersistBar` é um portal `fixed z-20` e ficaria atrás
   * do backdrop do modal (`z-50`).
   */
  variant?: 'pagina' | 'embutido'
}) {
  const embutido = variant === 'embutido'
  const [aba, setAba] = useState<PainelAba>('perfis')
  const [pending, startTransition] = useTransition()
  const [roles, setRoles] = useState<AccessRoleOpt[]>(rolesProp)
  const [perfilIds, setPerfilIds] = useState<Set<string>>(() => new Set(usuario.perfilIds))
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [novoPerfilNome, setNovoPerfilNome] = useState('')
  const [modalNovoPerfil, setModalNovoPerfil] = useState(false)
  const [gerenciandoRoleId, setGerenciandoRoleId] = useState<string | null>(null)

  const [overridesUi, setOverridesUi] = useState(() => {
    const cob = coberturaDePerfis(rolesProp, new Set(usuario.perfilIds))
    const efetivas = calculateEffectivePermissions([...cob], usuario.permissoesAdicionais)
    return diffCoberturaEfetiva(cob, efetivas)
  })

  const initialPerfilKey = useMemo(
    () => [...usuario.perfilIds].sort().join(','),
    [usuario.perfilIds],
  )
  const initialOverrides = useMemo(() => {
    const cob = coberturaDePerfis(rolesProp, new Set(usuario.perfilIds))
    const efetivas = calculateEffectivePermissions([...cob], usuario.permissoesAdicionais)
    return diffCoberturaEfetiva(cob, efetivas)
  }, [rolesProp, usuario.perfilIds, usuario.permissoesAdicionais])

  const { confirmDiscard } = useUnsavedChangesContext()

  const unsavedChanges = useMemo(() => {
    const list: string[] = []
    const currentKey = [...perfilIds].sort().join(',')
    if (currentKey !== initialPerfilKey) {
      const inicial = new Set(usuario.perfilIds)
      const added = [...perfilIds].filter((id) => !inicial.has(id))
      const removed = [...inicial].filter((id) => !perfilIds.has(id))
      const labelRole = (id: string) => {
        const role = roles.find((r) => r.id === id)
        return role ? roleLabel(role, tipoSede) : 'Perfil'
      }
      if (added.length > 0) {
        list.push(`Perfis adicionados: ${added.map(labelRole).join(', ')}`)
      }
      if (removed.length > 0) {
        list.push(`Perfis removidos: ${removed.map(labelRole).join(', ')}`)
      }
    }
    const extrasIni = [...initialOverrides.extras].sort().join(',')
    const extrasCur = [...overridesUi.extras].sort().join(',')
    if (extrasIni !== extrasCur) {
      const delta = overridesUi.extras.size - initialOverrides.extras.size
      if (delta > 0) list.push(`${delta} permissão(ões) adicional(is) concedida(s)`)
      else if (delta < 0) list.push(`${Math.abs(delta)} permissão(ões) adicional(is) removida(s)`)
      else list.push('Permissões adicionais alteradas')
    }
    const revIni = [...initialOverrides.revogadas].sort().join(',')
    const revCur = [...overridesUi.revogadas].sort().join(',')
    if (revIni !== revCur) {
      list.push('Revogações de permissão alteradas')
    }
    return list
  }, [
    perfilIds,
    initialPerfilKey,
    usuario.perfilIds,
    roles,
    tipoSede,
    overridesUi,
    initialOverrides,
  ])

  useUnsavedChanges({
    id: `acesso-usuario-${usuario.id}`,
    title: `Acesso — ${usuario.nome ?? usuario.email ?? 'Usuário'}`,
    isDirty: unsavedChanges.length > 0,
    changes: unsavedChanges,
  })

  const handleClose = useCallback(async () => {
    const ok = await confirmDiscard()
    if (ok) onClose()
  }, [confirmDiscard, onClose])

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
    const role = roles.find((r) => r.id === roleId)
    const jaTem = perfilIds.has(roleId)
    if (
      role?.isSystem &&
      role.nome === SYSTEM_ROLES.OWNER &&
      !jaTem &&
      ownerOcupadoPor &&
      ownerOcupadoPor.userId !== usuario.id
    ) {
      toast.error(
        `Esta torcida já tem ${rotuloCargoSistema(SYSTEM_ROLES.OWNER, tipoSede).toLowerCase()} (${ownerOcupadoPor.nome ?? 'outra pessoa'}). Transfira em Estrutura › Presidência.`,
      )
      return
    }
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

  async function persistirAcessoUsuario(nextPerfilIds: Set<string>, nextPermissoes: Set<string>) {
    const fd = new FormData()
    nextPerfilIds.forEach((id) => fd.append('perfilIds', id))
    nextPermissoes.forEach((p) => fd.append('permissoes', p))
    const ok = await runPersistAction(() => salvarAcessoUsuario(usuario.id, fd), {
      success: 'Acesso atualizado.',
    })
    if (ok) onClose()
    return ok
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (overridesUi.extras.size > 0) {
      setModalNovoPerfil(true)
      return
    }
    startTransition(async () => {
      await persistirAcessoUsuario(perfilIds, permissoes)
    })
  }

  async function handleConfirmarNovoPerfilESalvar() {
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
      const ok = await runPersistAction(
        async () => {
          box.current = await salvarPerfilComposto(fd)
          return box.current
        },
        { success: 'Novo perfil criado e atribuído a esta pessoa.' },
      )
      const result = box.current
      if (!ok || !result) return

      const depto = result.departamentoId ? deptoById.get(result.departamentoId) : null
      const pacote = depto
        ? result.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR
          ? [...depto.permissions, ...depto.permissionsGestor]
          : [...depto.permissions]
        : []
      const novoRole: AccessRoleOpt = {
        id: result.id,
        nome: result.nome,
        cor: result.cor,
        isSystem: result.isSystem,
        permissionsExtras: result.permissionsExtras,
        permissionsPacote: pacote,
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

      const nextPerfis = new Set(perfilIds)
      nextPerfis.add(result.id)
      const nextCobertura = coberturaDePerfis([...roles, novoRole], nextPerfis)
      const nextPermissoes = efetivasDe(nextCobertura, new Set(), overridesUi.revogadas)

      setRoles((prev) => [...prev, novoRole])
      setPerfilIds(nextPerfis)
      setOverridesUi({ extras: new Set(), revogadas: overridesUi.revogadas })
      setNovoPerfilNome('')
      setModalNovoPerfil(false)

      await persistirAcessoUsuario(nextPerfis, nextPermissoes)
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

    const pacote = [...(role.permissionsPacote ?? pacoteDoPerfil(role, departamentos))]
    const permissions = role.departamentoId
      ? [...new Set([...pacote, ...data.extras])]
      : [...data.extras]

    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? {
              ...r,
              nome: data.nome,
              cor: data.cor,
              permissionsExtras: data.extras,
              permissionsPacote: pacote,
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

  const formId = `acesso-usuario-form-${usuario.id}`

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      data-persist-bar-root=""
      className={
        embutido
          ? 'flex w-full flex-col overflow-hidden rounded-xl border border-[rgb(var(--border))]'
          : 'flex w-full flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm'
      }
    >
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-4 sm:px-6">
        {!embutido && (
          <button
            type="button"
            onClick={() => void handleClose()}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar à lista
          </button>
        )}
        <div className="flex items-start gap-3 sm:gap-4">
          {!embutido &&
            (usuario.avatarUrl ? (
              <AvatarFoto
                src={usuario.avatarUrl}
                px={56}
                className="h-12 w-12 shrink-0 rounded-full object-cover sm:h-14 sm:w-14"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-sm font-semibold text-white sm:h-14 sm:w-14">
                {initials(nomeExibicao)}
              </div>
            ))}
          <div className="min-w-0 flex-1">
            {embutido ? (
              // O card de membro já mostra quem é; aqui basta confirmar sobre
              // quem a alteração vai recair, para não restar dúvida.
              <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                Acesso de {nomeExibicao}
              </p>
            ) : (
              <>
                <h2 className="truncate text-lg font-semibold text-[rgb(var(--foreground))] sm:text-xl">
                  {nomeExibicao}
                </h2>
                {usuario.email && (
                  <p className="truncate text-sm text-[rgb(var(--foreground-muted))]">
                    {usuario.email}
                  </p>
                )}
              </>
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
                  ? 'border border-b-0 border-[rgb(var(--border))] -mb-px bg-[rgb(var(--surface))] text-[rgb(var(--color-primary-fg))]'
                  : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {item.label}
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  active
                    ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                    : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {item.count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="max-h-[min(70dvh,40rem)] overflow-y-auto px-4 py-5 sm:px-6">
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
                        const ownerBloqueado =
                          role.isSystem &&
                          role.nome === SYSTEM_ROLES.OWNER &&
                          !checked &&
                          ownerOcupadoPor != null &&
                          ownerOcupadoPor.userId !== usuario.id
                        return (
                          <div
                            key={role.id}
                            className={[
                              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                              checked
                                ? 'border-[rgb(var(--primary)_/_0.45)] bg-[rgb(var(--primary)_/_0.08)] text-[rgb(var(--foreground))]'
                                : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--border-strong))]',
                              ownerBloqueado ? 'opacity-60' : '',
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
                                  {ownerBloqueado
                                    ? `Já atribuído a ${ownerOcupadoPor?.nome ?? 'outra pessoa'}`
                                    : role.isSystem
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
                              disabled={ownerBloqueado}
                              onClick={() => togglePerfil(role.id)}
                              className={[
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                                checked
                                  ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
                                  : 'border-[rgb(var(--border-strong))]',
                                ownerBloqueado ? 'cursor-not-allowed opacity-50' : '',
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
              revogação. Ao salvar o acesso com permissões extras, será necessário criar um
              novo perfil com um título.
            </p>

            {overridesUi.extras.size > 0 && (
              <p className="rounded-xl border border-[rgb(var(--primary)_/_0.35)] bg-[rgb(var(--primary)_/_0.08)] px-3 py-2 text-xs text-[rgb(var(--foreground))]">
                {overridesUi.extras.size} permissão
                {overridesUi.extras.size === 1 ? '' : 'ões'} além do perfil/departamento
                — ao clicar em <strong className="font-semibold">Salvar acesso</strong>, informe
                o nome do novo perfil.
              </p>
            )}

            <AccessPermissionWorktree
              selected={permissoes}
              onChange={(next) => setOverridesUi(diffCoberturaEfetiva(coberturaBase, next))}
              origemOf={origemBadge}
            />
          </div>
        )}
      </div>

      {(() => {
        const acoes = (
          <>
            <button
              type="button"
              onClick={() => void handleClose()}
              disabled={pending || salvandoPerfil}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </button>
            <button
              type="submit"
              form={formId}
              disabled={pending || salvandoPerfil}
              className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending || salvandoPerfil ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Salvar acesso
            </button>
          </>
        )

        // Embutido: rodapé no fluxo, colado no fim do painel. A barra fixa é um
        // portal no `body` com z-20 — dentro de um modal z-50 ela sumiria atrás
        // do backdrop, e o usuário ficaria sem botão de salvar.
        if (embutido) {
          return (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 sm:px-6">
              {unsavedChanges.length > 0 && (
                <p className="mr-auto text-xs text-[rgb(var(--foreground-muted))]">
                  {unsavedChanges.length === 1
                    ? unsavedChanges[0]
                    : `${unsavedChanges.length} alterações não salvas`}
                </p>
              )}
              {acoes}
            </div>
          )
        }

        return (
          <StickyPersistBar
            locked={unsavedChanges.length > 0 || pending || salvandoPerfil}
            dirtyLabel={
              unsavedChanges.length > 0
                ? unsavedChanges.length === 1
                  ? unsavedChanges[0]
                  : `${unsavedChanges.length} alterações — ${unsavedChanges.slice(0, 2).join(', ')}${unsavedChanges.length > 2 ? '…' : ''}`
                : undefined
            }
            hint="Role para explorar. Ao alterar perfis ou permissões, salve aqui."
          >
            {acoes}
          </StickyPersistBar>
        )
      })()}

      <AppModal
        open={modalNovoPerfil}
        onClose={() => {
          if (!salvandoPerfil) setModalNovoPerfil(false)
        }}
        size="sm"
        layer="nested"
        labelledBy="modal-novo-perfil-titulo"
        busy={salvandoPerfil}
      >
        <AppModalBody className="p-5">
            <h2
              id="modal-novo-perfil-titulo"
              className="text-base font-semibold text-[rgb(var(--foreground))]"
            >
              Salvar composição como novo perfil
            </h2>
            <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
              Você adicionou permissões além do perfil ou departamento associado a esta pessoa.
              Para gravar esse acesso, é necessário criar um novo perfil e dar um título a ele —
              assim a composição fica reutilizável e rastreável.
            </p>
            {overridesUi.extras.size > 0 && (
              <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
                {overridesUi.extras.size} permissão
                {overridesUi.extras.size === 1 ? '' : 'ões'} extra
                {overridesUi.extras.size === 1 ? '' : 's'} serão incluídas neste perfil.
              </p>
            )}
            <label className="mt-4 block space-y-1.5">
              <span className="text-xs font-medium text-[rgb(var(--foreground))]">
                Nome do perfil
              </span>
              <input
                autoFocus
                value={novoPerfilNome}
                onChange={(e) => setNovoPerfilNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleConfirmarNovoPerfilESalvar()
                  }
                }}
                placeholder="Ex.: Gestor Financeiro+"
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={salvandoPerfil}
                onClick={() => setModalNovoPerfil(false)}
                className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:opacity-60"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={salvandoPerfil || novoPerfilNome.trim().length < 2}
                onClick={() => void handleConfirmarNovoPerfilESalvar()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {salvandoPerfil ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Criar perfil e salvar
              </button>
            </div>
        </AppModalBody>
      </AppModal>
    </form>
  )
}

function pacoteDoPerfil(
  role: AccessRoleOpt,
  departamentos: AccessDepartamentoOpt[],
): Set<string> {
  // Preferir snapshot da page (inclui deptos legados ocultos na lista de áreas)
  if (role.permissionsPacote && role.permissionsPacote.length > 0) {
    return new Set(role.permissionsPacote)
  }
  if (role.departamentoId) {
    const depto = departamentos.find((d) => d.id === role.departamentoId)
    if (depto) {
      const gestor =
        role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR ? depto.permissionsGestor : []
      return new Set([...depto.permissions, ...gestor])
    }
    // Fallback: efetivas menos extras (depto sumiu da lista filtrada, mas já veio resolvido)
    const extras = new Set(role.permissionsExtras ?? [])
    return new Set(role.permissions.filter((p) => !extras.has(p)))
  }
  return new Set()
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
  const pacote = useMemo(() => pacoteDoPerfil(role, departamentos), [role, departamentos])
  const [extras, setExtras] = useState(() => {
    if (role.departamentoId) {
      // Extras salvos + qualquer efetiva do perfil que não esteja no pacote
      const next = new Set(role.permissionsExtras ?? [])
      for (const p of role.permissions) {
        if (!pacoteDoPerfil(role, departamentos).has(p)) next.add(p)
      }
      return next
    }
    // Transversal: permissões próprias ficam em `permissions` (ou extras se preenchido)
    if (role.permissionsExtras && role.permissionsExtras.length > 0) {
      return new Set(role.permissionsExtras)
    }
    return new Set(role.permissions)
  })
  const [pending, setPending] = useState(false)
  const selecionadas = useMemo(() => new Set([...pacote, ...extras]), [pacote, extras])
  const deptoNome = role.departamentoId
    ? departamentos.find((d) => d.id === role.departamentoId)?.nome
    : null
  const somenteLeitura = role.isSystem
  const { confirmDiscard } = useUnsavedChangesContext()
  const confirmDialog = useConfirmDialog()

  const initialExtrasKey = useMemo(() => {
    if (role.departamentoId) {
      const next = new Set(role.permissionsExtras ?? [])
      for (const p of role.permissions) {
        if (!pacoteDoPerfil(role, departamentos).has(p)) next.add(p)
      }
      return [...next].sort().join(',')
    }
    if (role.permissionsExtras && role.permissionsExtras.length > 0) {
      return [...role.permissionsExtras].sort().join(',')
    }
    return [...role.permissions].sort().join(',')
  }, [role, departamentos])

  const perfilUnsaved = useMemo(() => {
    const list: string[] = []
    if (!somenteLeitura && nome.trim() !== role.nome) list.push('Nome do perfil')
    if (!somenteLeitura && cor !== role.cor) list.push('Cor do perfil')
    if (!somenteLeitura && [...extras].sort().join(',') !== initialExtrasKey) {
      list.push('Permissões do perfil')
    }
    return list
  }, [somenteLeitura, nome, cor, extras, role.nome, role.cor, initialExtrasKey])

  useUnsavedChanges({
    id: `perfil-manage-${role.id}`,
    title: `Editar perfil — ${roleLabel(role, tipoSede)}`,
    isDirty: perfilUnsaved.length > 0,
    changes: perfilUnsaved,
  })

  async function handleVoltar() {
    const ok = await confirmDiscard()
    if (ok) onClose()
  }

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
    const ok = await confirmDialog({
      titulo: `Excluir o perfil “${nome.trim() || role.nome}”?`,
      descricao: 'Esta ação remove o cargo. Pessoas vinculadas precisarão de outro perfil.',
      labelConfirmar: 'Excluir',
      variante: 'destructive',
      cancelled: 'Exclusão cancelada.',
    })
    if (!ok) return
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
          onClick={() => void handleVoltar()}
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
              ? 'border-[rgb(var(--color-primary)_/_0.45)] bg-[rgb(var(--color-primary)_/_0.08)] text-[rgb(var(--color-primary-fg))]'
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
                . As permissões da área já vêm marcadas; marque outras para extras do perfil.
              </p>
            )}
            {!deptoNome && role.departamentoId && (
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Perfil vinculado a uma área. Permissões herdadas aparecem como “via perfil”; as
                demais são extras editáveis.
              </p>
            )}
          </div>
        )}
      </div>

      {!somenteLeitura && (
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium text-[rgb(var(--foreground))]">
              Permissões do perfil
            </p>
            <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
              Já selecionadas = o que o perfil concede. Itens{' '}
              <span className="font-medium text-[rgb(var(--foreground))]">via perfil</span> vêm da
              área (fixos); marque ou desmarque o restante para extras.
            </p>
          </div>
          <AccessPermissionWorktree
            initiallyOpen={selecionadas.size > 0}
            selected={selecionadas}
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

      {somenteLeitura && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[rgb(var(--foreground))]">
            Permissões deste perfil
          </p>
          <AccessPermissionWorktree
            initiallyOpen={selecionadas.size > 0}
            selected={selecionadas}
            lockedKeys={selecionadas}
            origemOf={(key) => (selecionadas.has(key) ? 'via perfil' : null)}
            onChange={() => {
              /* sistema: só leitura */
            }}
          />
        </div>
      )}

      {!somenteLeitura && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--border))] pt-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => void excluir()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/5 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir perfil
          </button>
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
        correspondente da área (mesma regra da aba Perfis). Use{' '}
        <strong className="font-medium text-[rgb(var(--foreground))]">visualizar permissões</strong> para ver
        o template.
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
                Visualizar permissões · {detalhe.nome}
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
        {[...departamentos]
          .sort((a, b) => {
            const aAtivo = papelAtual(a.id) != null ? 0 : 1
            const bAtivo = papelAtual(b.id) != null ? 0 : 1
            if (aAtivo !== bAtivo) return aAtivo - bAtivo
            return 0
          })
          .map((depto) => {
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
                'relative flex flex-col overflow-hidden rounded-2xl border transition-shadow',
                selecionado
                  ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.06)] shadow-[0_0_0_1px_rgb(var(--primary)_/_0.2)]'
                  : ativo
                    ? 'border-[rgb(var(--primary)_/_0.55)] bg-[rgb(var(--primary)_/_0.08)] shadow-[0_0_0_1px_rgb(var(--primary)_/_0.18)]'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] opacity-90',
              ].join(' ')}
              style={{ borderTopColor: depto.cor, borderTopWidth: 3 }}
            >
              {ativo && (
                <div className="absolute right-2.5 top-2.5">
                  <span className="rounded-md bg-[rgb(var(--primary))] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {isGestor ? 'Gestor' : 'Membro'}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2.5 px-3.5 py-3">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: depto.cor }}
                />
                <div className="min-w-0 flex-1 pr-14">
                  <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                    {depto.nome}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
                    {organizacional
                      ? 'Organizacional'
                      : `Colab. ${depto.permissions.length} · Gestor+ ${depto.permissionsGestor.length}`}
                    {!temPerfis ? ' · sem perfil canônico' : ''}
                    {ativo ? ' · associado a esta pessoa' : ''}
                  </p>
                </div>
              </div>

              <div
                className={[
                  'flex flex-wrap items-center gap-1.5 border-t px-3 py-2.5',
                  ativo
                    ? 'border-[rgb(var(--primary)_/_0.25)] bg-[rgb(var(--primary)_/_0.04)]'
                    : 'border-[rgb(var(--border))]',
                ].join(' ')}
              >
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
                      ? 'bg-[rgb(var(--color-primary)_/_0.15)] text-[rgb(var(--color-primary-fg))]'
                      : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  visualizar permissões
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
