'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Loader2,
  Check,
  X,
  ShieldCheck,
  UserRound,
  ArrowLeft,
  ChevronDown,
  Save,
} from 'lucide-react'
import {
  PERMISSION_GROUPS,
  calculateEffectivePermissions,
  applyPermissionCascade,
  rotuloCargoSistema,
  PAPEL_DEPARTAMENTO,
} from '@torcida/types'
import { salvarAcessoUsuario, salvarPerfilComposto } from '@/app/admin/acessos/actions'
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

type PainelAba = 'perfis' | 'adicionais'

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
  roles,
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
  const [perfilIds, setPerfilIds] = useState<Set<string>>(() => new Set(usuario.perfilIds))
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [novoPerfilNome, setNovoPerfilNome] = useState('')

  const [overridesUi, setOverridesUi] = useState(() => {
    const cob = coberturaDePerfis(roles, new Set(usuario.perfilIds))
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

  function togglePermissao(key: string) {
    const prevArr = [...permissoes]
    const nextArr = permissoes.has(key)
      ? prevArr.filter((p) => p !== key)
      : [...prevArr, key]
    const cascateadas = new Set(applyPermissionCascade(prevArr, nextArr))
    setOverridesUi(diffCoberturaEfetiva(coberturaBase, cascateadas))
  }

  function origemBadge(permission: string): string | null {
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
    const fd = new FormData()
    fd.set('nome', nome)
    fd.set('cor', deptoRole?.cor ?? '#6b7280')
    if (deptoRole?.departamentoId && deptoRole.papelNoDepartamento) {
      fd.set('departamentoId', deptoRole.departamentoId)
      fd.set('papelNoDepartamento', deptoRole.papelNoDepartamento)
    }
    for (const p of overridesUi.extras) fd.append('permissionsExtras', p)

    setSalvandoPerfil(true)
    try {
      const ok = await runPersistAction(() => salvarPerfilComposto(fd), {
        success: 'Novo perfil criado — disponível na lista de cargos.',
      })
      if (ok) setNovoPerfilNome('')
    } finally {
      setSalvandoPerfil(false)
    }
  }

  const abas: { id: PainelAba; label: string; count: number }[] = [
    { id: 'perfis', label: 'Perfis', count: totalPerfis },
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
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Marcar um perfil de área já coloca a pessoa no departamento (membro ou gestor) e
              concede o pacote correspondente. Perfis transversais (Presidente, associado…) não
              exigem área.
            </p>
            {gruposPerfil.map((grupo) => (
              <div key={grupo.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  {grupo.cor && (
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: grupo.cor }} />
                  )}
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    {grupo.label}
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {grupo.items.map((role) => {
                    const checked = perfilIds.has(role.id)
                    return (
                      <label
                        key={role.id}
                        className={[
                          'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                          checked
                            ? 'border-[rgb(var(--primary)_/_0.45)] bg-[rgb(var(--primary)_/_0.08)] text-[rgb(var(--foreground))]'
                            : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--border-strong))]',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => togglePerfil(role.id)}
                        />
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: role.cor }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug">
                            {roleLabel(role, tipoSede)}
                          </span>
                          {role.papelNoDepartamento && (
                            <span className="text-[10px] uppercase tracking-wide opacity-70">
                              {role.papelNoDepartamento === PAPEL_DEPARTAMENTO.GESTOR
                                ? 'Gestor'
                                : 'Membro'}
                            </span>
                          )}
                        </span>
                        <span
                          className={[
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            checked
                              ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
                              : 'border-[rgb(var(--border-strong))]',
                          ].join(' ')}
                        >
                          {checked && <Check className="h-2.5 w-2.5 text-white" />}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
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

            <div className="grid items-start gap-3 lg:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => {
                const marks = group.items.filter((i) => permissoes.has(i.key)).length
                return (
                  <details
                    key={group.label}
                    className="group/perm rounded-xl border border-[rgb(var(--border))]"
                    {...(marks > 0 ? { open: true } : {})}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-[rgb(var(--foreground))] marker:content-none [&::-webkit-details-marker]:hidden">
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform group-open/perm:rotate-180" />
                      <span className="min-w-0 flex-1 truncate">{group.label}</span>
                      <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[rgb(var(--foreground-muted))]">
                        {marks}/{group.items.length}
                      </span>
                    </summary>
                    <div className="grid grid-cols-1 gap-1 border-t border-[rgb(var(--border))] p-2 sm:grid-cols-2">
                      {group.items.map((item) => {
                        const badge = origemBadge(item.key)
                        const on = permissoes.has(item.key)
                        return (
                          <label
                            key={item.key}
                            className={[
                              'flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors',
                              on
                                ? 'border-[rgb(var(--primary)_/_0.35)] bg-[rgb(var(--primary)_/_0.06)] text-[rgb(var(--foreground))]'
                                : 'border-transparent text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
                            ].join(' ')}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={on}
                              onChange={() => togglePermissao(item.key)}
                            />
                            <span
                              className={[
                                'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                                on
                                  ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
                                  : 'border-[rgb(var(--border-strong))]',
                              ].join(' ')}
                            >
                              {on && <Check className="h-2.5 w-2.5 text-white" />}
                            </span>
                            <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                            {badge && (
                              <span className="shrink-0 rounded bg-[rgb(var(--background-subtle))] px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                                {badge}
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </details>
                )
              })}
            </div>
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
