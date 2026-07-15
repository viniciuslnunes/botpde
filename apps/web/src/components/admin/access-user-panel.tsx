'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  Loader2,
  Check,
  X,
  ShieldCheck,
  UserRound,
  ArrowLeft,
  ChevronDown,
} from 'lucide-react'
import {
  PERMISSION_GROUPS,
  calculateEffectivePermissions,
  applyPermissionCascade,
  rotuloCargoSistema,
} from '@torcida/types'
import { salvarAcessoUsuario } from '@/app/admin/acessos/actions'
import { AccessPermissionCompare } from '@/components/admin/access-permission-preview'

export interface AccessRoleOpt {
  id: string
  nome: string
  cor: string
  isSystem: boolean
  permissions: string[]
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

type PainelAba = 'perfis' | 'departamentos' | 'permissoes'

function roleLabel(role: AccessRoleOpt, tipoSede: string): string {
  return role.isSystem ? rotuloCargoSistema(role.nome, tipoSede) : role.nome
}

function permsDoDepartamento(depto: AccessDepartamentoOpt, isGestor: boolean): string[] {
  return isGestor ? [...depto.permissions, ...depto.permissionsGestor] : [...depto.permissions]
}

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

/**
 * Painel dedicado de gestão de acesso de um usuário —
 * abas Perfis / Departamentos / Permissões (mesmas regras do formulário antigo).
 */
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
  const [perfilIds, setPerfilIds] = useState<Set<string>>(new Set(usuario.perfilIds))
  const [departamentoIds, setDepartamentoIds] = useState<Set<string>>(
    new Set(usuario.departamentoIds),
  )
  const [gestorIds, setGestorIds] = useState<Set<string>>(new Set(usuario.gestorDepartamentoIds))

  const coberturaBase = useMemo(() => {
    const viaPerfil = new Set(
      roles.filter((r) => perfilIds.has(r.id)).flatMap((r) => r.permissions),
    )
    const viaDepto = new Set(
      departamentos
        .filter((d) => departamentoIds.has(d.id))
        .flatMap((d) => permsDoDepartamento(d, gestorIds.has(d.id))),
    )
    return { viaPerfil, viaDepto }
  }, [roles, departamentos, perfilIds, departamentoIds, gestorIds])

  const permissoesEfetivasIniciais = useMemo(() => {
    const rolePermissions = [
      ...roles.filter((r) => usuario.perfilIds.includes(r.id)).flatMap((r) => r.permissions),
      ...departamentos
        .filter((d) => usuario.departamentoIds.includes(d.id))
        .flatMap((d) =>
          permsDoDepartamento(d, usuario.gestorDepartamentoIds.includes(d.id)),
        ),
    ]
    return calculateEffectivePermissions(rolePermissions, usuario.permissoesAdicionais)
  }, [roles, departamentos, usuario])

  const [permissoes, setPermissoes] = useState<Set<string>>(new Set(permissoesEfetivasIniciais))

  const nomeExibicao = usuario.nome ?? usuario.email ?? 'Usuário sem nome'
  const totalPerms = permissoes.size
  const totalPerfis = perfilIds.size
  const totalDeptos = departamentoIds.size

  function toggleSet<T>(setter: (fn: (prev: Set<T>) => Set<T>) => void, value: T) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function togglePermissao(key: string) {
    setPermissoes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return new Set(applyPermissionCascade([...prev], [...next]))
    })
  }

  function syncPermissoesComDeptos(nextDeptos: Set<string>, nextGestores: Set<string>) {
    const cov = new Set([
      ...roles.filter((r) => perfilIds.has(r.id)).flatMap((r) => r.permissions),
      ...departamentos
        .filter((d) => nextDeptos.has(d.id))
        .flatMap((d) => permsDoDepartamento(d, nextGestores.has(d.id))),
      ...usuario.permissoesAdicionais.filter((o) => o.granted).map((o) => o.permission),
    ])
    setPermissoes((prev) => {
      const next = new Set(prev)
      const todasDepto = new Set(departamentos.flatMap((d) => permsDoDepartamento(d, true)))
      for (const p of todasDepto) {
        if (cov.has(p)) next.add(p)
        else next.delete(p)
      }
      for (const p of cov) next.add(p)
      return next
    })
  }

  function setMembroDepartamento(id: string, ativo: boolean) {
    const nextDeptos = new Set(departamentoIds)
    const nextGestores = new Set(gestorIds)
    if (ativo) nextDeptos.add(id)
    else {
      nextDeptos.delete(id)
      nextGestores.delete(id)
    }
    setDepartamentoIds(nextDeptos)
    setGestorIds(nextGestores)
    syncPermissoesComDeptos(nextDeptos, nextGestores)
  }

  function setGestorDepartamento(id: string, ativo: boolean) {
    const nextDeptos = new Set(departamentoIds)
    const nextGestores = new Set(gestorIds)
    if (ativo) {
      nextDeptos.add(id)
      nextGestores.add(id)
    } else {
      nextGestores.delete(id)
    }
    setDepartamentoIds(nextDeptos)
    setGestorIds(nextGestores)
    syncPermissoesComDeptos(nextDeptos, nextGestores)
  }

  function origemBadge(permission: string): string | null {
    if (coberturaBase.viaPerfil.has(permission) && coberturaBase.viaDepto.has(permission)) {
      return 'perfil+depto'
    }
    if (coberturaBase.viaPerfil.has(permission)) return 'via perfil'
    if (coberturaBase.viaDepto.has(permission)) return 'via depto'
    if (
      permissoes.has(permission) &&
      !coberturaBase.viaPerfil.has(permission) &&
      !coberturaBase.viaDepto.has(permission)
    ) {
      return 'extra'
    }
    if (
      !permissoes.has(permission) &&
      (coberturaBase.viaPerfil.has(permission) || coberturaBase.viaDepto.has(permission))
    ) {
      return 'revogada'
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    perfilIds.forEach((id) => fd.append('perfilIds', id))
    departamentoIds.forEach((id) => fd.append('departamentoIds', id))
    gestorIds.forEach((id) => fd.append('gestorDepartamentoIds', id))
    permissoes.forEach((p) => fd.append('permissoes', p))

    startTransition(async () => {
      await salvarAcessoUsuario(usuario.id, fd)
      onClose()
    })
  }

  const abas: { id: PainelAba; label: string; count: number }[] = [
    { id: 'perfis', label: 'Perfis', count: totalPerfis },
    { id: 'departamentos', label: 'Departamentos', count: totalDeptos },
    { id: 'permissoes', label: 'Permissões', count: totalPerms },
  ]

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm"
    >
      {/* Cabeçalho */}
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
                {totalDeptos} área{totalDeptos === 1 ? '' : 's'}
              </span>
              <span className="rounded-full bg-[rgb(var(--surface))] px-2 py-0.5">
                {totalPerms} permiss{totalPerms === 1 ? 'ão' : 'ões'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Abas — overflow-y hidden evita scrollbar vertical espúria do overflow-x */}
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

      {/* Conteúdo da aba — largura total do container admin */}
      <div className="max-h-[min(70vh,40rem)] overflow-y-auto px-4 py-5 sm:px-6">
        {aba === 'perfis' && (
          <div className="space-y-3">
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Papéis transversais concedidos a esta pessoa.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => {
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
                      onChange={() => toggleSet(setPerfilIds, role.id)}
                    />
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: role.cor }}
                    />
                    <span className="min-w-0 flex-1 font-medium">{roleLabel(role, tipoSede)}</span>
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
        )}

        {aba === 'departamentos' && (
          <DepartamentoAssignGrid
            departamentos={departamentos}
            departamentoIds={departamentoIds}
            gestorIds={gestorIds}
            onToggleMembro={setMembroDepartamento}
            onToggleGestor={setGestorDepartamento}
          />
        )}

        {aba === 'permissoes' && (
          <div className="space-y-3">
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Marcadas = acesso concedido. Badges mostram a origem. Desmarcar o que perfil/depto
              concede cria uma revogação.
            </p>
            <div className="grid items-start gap-3 lg:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => {
                const marks = group.items.filter((i) => permissoes.has(i.key)).length
                return (
                  <div
                    key={group.label}
                    className="rounded-xl border border-[rgb(var(--border))]"
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-[rgb(var(--foreground))]">
                      <span>{group.label}</span>
                      <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[rgb(var(--foreground-muted))]">
                        {marks}/{group.items.length}
                      </span>
                    </div>
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
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Rodapé fixo */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 sm:px-6">
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Alterações só valem após salvar.
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

function DepartamentoAssignGrid({
  departamentos,
  departamentoIds,
  gestorIds,
  onToggleMembro,
  onToggleGestor,
}: {
  departamentos: AccessDepartamentoOpt[]
  departamentoIds: Set<string>
  gestorIds: Set<string>
  onToggleMembro: (id: string, ativo: boolean) => void
  onToggleGestor: (id: string, ativo: boolean) => void
}) {
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const detalheRef = useRef<HTMLDivElement>(null)
  const detalhe = departamentos.find((d) => d.id === detalheId) ?? null

  function abrirPacote(id: string) {
    const fechar = detalheId === id
    setDetalheId(fechar ? null : id)
    if (!fechar) {
      // Painel fica acima do grid — garante foco visual após o paint
      requestAnimationFrame(() => {
        detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        <strong className="font-medium text-[rgb(var(--foreground))]">Membro</strong> recebe as
        permissões de colaborador da área.{' '}
        <strong className="font-medium text-[rgb(var(--foreground))]">Gestor</strong> soma as extras
        e administra a equipe. Use <em>Pacote</em> para ver o detalhe acima da grade.
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
          const isMembro = departamentoIds.has(depto.id)
          const isGestor = gestorIds.has(depto.id)
          const ativo = isMembro || isGestor
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
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-[rgb(var(--border))] px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => onToggleMembro(depto.id, !isMembro)}
                  className={[
                    'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                    isMembro
                      ? 'bg-[rgb(var(--primary))] text-white'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  Membro
                </button>
                <button
                  type="button"
                  onClick={() => onToggleGestor(depto.id, !isGestor)}
                  className={[
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                    isGestor
                      ? 'bg-[rgb(var(--primary))] text-white'
                      : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  <ShieldCheck className="h-3 w-3" />
                  Gestor
                </button>
                {!organizacional && (
                  <button
                    type="button"
                    onClick={() => abrirPacote(depto.id)}
                    aria-expanded={selecionado}
                    className={[
                      'ml-auto inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      selecionado
                        ? 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]'
                        : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                    ].join(' ')}
                  >
                    Pacote
                    <ChevronDown
                      className={[
                        'h-3.5 w-3.5 transition-transform',
                        selecionado ? 'rotate-180' : '',
                      ].join(' ')}
                    />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Placeholder visual quando a URL aponta para usuário inexistente. */
export function AccessUserNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-6 py-10 text-center">
      <UserRound className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
      <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Usuário não encontrado</h2>
      <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
        Esta pessoa não está na lista de acessos desta torcida.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar à lista
      </button>
    </div>
  )
}
