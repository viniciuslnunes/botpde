'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, Check, X, Pencil, ShieldCheck, UserRound } from 'lucide-react'
import {
  PERMISSION_GROUPS,
  calculateEffectivePermissions,
  applyPermissionCascade,
  rotuloCargoSistema,
} from '@torcida/types'
import { salvarAcessoUsuario } from '@/app/admin/acessos/actions'

interface RoleOpt {
  id: string
  nome: string
  cor: string
  isSystem: boolean
  permissions: string[]
}

interface DepartamentoOpt {
  id: string
  nome: string
  cor: string
  permissions: string[]
  permissionsGestor: string[]
}

interface UsuarioAcesso {
  id: string
  nome: string | null
  email: string | null
  avatarUrl: string | null
  perfilIds: string[]
  departamentoIds: string[]
  gestorDepartamentoIds: string[]
  permissoesAdicionais: { permission: string; granted: boolean }[]
}

interface AccessManagerProps {
  usuarios: UsuarioAcesso[]
  roles: RoleOpt[]
  departamentos: DepartamentoOpt[]
  /** TipoSede do tenant — contextualiza rótulos de cargos de sistema (Presidente/Liderança) */
  tipoSede: string
}

/** Rótulo de exibição de um perfil: cargos de sistema ganham o rótulo PT contextual. */
function roleLabel(role: RoleOpt, tipoSede: string): string {
  return role.isSystem ? rotuloCargoSistema(role.nome, tipoSede) : role.nome
}

function permsDoDepartamento(depto: DepartamentoOpt, isGestor: boolean): string[] {
  return isGestor ? [...depto.permissions, ...depto.permissionsGestor] : [...depto.permissions]
}

export function AccessManager({ usuarios, roles, departamentos, tipoSede }: AccessManagerProps) {
  const [editandoId, setEditandoId] = useState<string | null>(null)

  if (usuarios.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-6 py-10 text-center">
        <UserRound className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
        <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">
          Nenhum usuário nesta torcida ainda
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--foreground-muted))]">
          Defina primeiro os cargos e departamentos em Configurações. Depois, quando houver
          membros, atribua os padrões a cada pessoa aqui.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/admin/configuracoes#cargos"
            className="inline-flex items-center rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Gerenciar cargos
          </Link>
          <Link
            href="/admin/configuracoes#departamentos"
            className="inline-flex items-center rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Gerenciar departamentos
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {usuarios.map((usuario) =>
        editandoId === usuario.id ? (
          <AccessEditForm
            key={usuario.id}
            usuario={usuario}
            roles={roles}
            departamentos={departamentos}
            tipoSede={tipoSede}
            onClose={() => setEditandoId(null)}
          />
        ) : (
          <UsuarioAcessoRow
            key={usuario.id}
            usuario={usuario}
            roles={roles}
            departamentos={departamentos}
            tipoSede={tipoSede}
            onEdit={() => setEditandoId(usuario.id)}
          />
        ),
      )}
    </div>
  )
}

function contarPermissoesAdicionais(
  usuario: UsuarioAcesso,
  roles: RoleOpt[],
  departamentos: DepartamentoOpt[],
): number {
  const coberto = new Set([
    ...roles.filter((r) => usuario.perfilIds.includes(r.id)).flatMap((r) => r.permissions),
    ...departamentos
      .filter((d) => usuario.departamentoIds.includes(d.id))
      .flatMap((d) =>
        permsDoDepartamento(d, usuario.gestorDepartamentoIds.includes(d.id)),
      ),
  ])
  return usuario.permissoesAdicionais.filter(
    (p) => p.granted && !coberto.has(p.permission),
  ).length
}

function UsuarioAcessoRow({
  usuario,
  roles,
  departamentos,
  tipoSede,
  onEdit,
}: {
  usuario: UsuarioAcesso
  roles: RoleOpt[]
  departamentos: DepartamentoOpt[]
  tipoSede: string
  onEdit: () => void
}) {
  const perfis = roles.filter((r) => usuario.perfilIds.includes(r.id))
  const deptos = departamentos.filter((d) => usuario.departamentoIds.includes(d.id))
  const extras = contarPermissoesAdicionais(usuario, roles, departamentos)

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]">
          <UserRound className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[rgb(var(--foreground))]">
            {usuario.nome ?? usuario.email ?? 'Usuário sem nome'}
          </p>
          {usuario.email && (
            <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{usuario.email}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {perfis.length === 0 ? (
              <span className="text-xs text-[rgb(var(--foreground-muted))]">Sem perfil</span>
            ) : (
              perfis.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 rounded-full border border-[rgb(var(--border))] px-2 py-0.5 text-xs text-[rgb(var(--foreground))]"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.cor }} />
                  {roleLabel(p, tipoSede)}
                </span>
              ))
            )}

            {deptos.map((d) => {
              const isGestor = usuario.gestorDepartamentoIds.includes(d.id)
              return (
                <span
                  key={d.id}
                  className="flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs text-[rgb(var(--foreground-muted))]"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.cor }} />
                  {d.nome}
                  <span className="ml-0.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    {isGestor ? 'gestor' : 'membro'}
                  </span>
                  {isGestor && <ShieldCheck className="h-3 w-3 text-[rgb(var(--primary))]" />}
                </span>
              )
            })}

            {extras > 0 && (
              <span className="rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                +{extras} permiss{extras === 1 ? 'ão' : 'ões'} adicional{extras === 1 ? '' : 'is'}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onEdit}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function AccessEditForm({
  usuario,
  roles,
  departamentos,
  tipoSede,
  onClose,
}: {
  usuario: UsuarioAcesso
  roles: RoleOpt[]
  departamentos: DepartamentoOpt[]
  tipoSede: string
  onClose: () => void
}) {
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

  function syncPermissoesComDeptos(
    nextDeptos: Set<string>,
    nextGestores: Set<string>,
  ) {
    const cov = new Set([
      ...roles.filter((r) => perfilIds.has(r.id)).flatMap((r) => r.permissions),
      ...departamentos
        .filter((d) => nextDeptos.has(d.id))
        .flatMap((d) => permsDoDepartamento(d, nextGestores.has(d.id))),
      ...usuario.permissoesAdicionais.filter((o) => o.granted).map((o) => o.permission),
    ])
    setPermissoes((prev) => {
      const next = new Set(prev)
      const todasDepto = new Set(
        departamentos.flatMap((d) => permsDoDepartamento(d, true)),
      )
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
    if (permissoes.has(permission) && !coberturaBase.viaPerfil.has(permission) && !coberturaBase.viaDepto.has(permission)) {
      return 'extra'
    }
    if (!permissoes.has(permission) && (coberturaBase.viaPerfil.has(permission) || coberturaBase.viaDepto.has(permission))) {
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

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--surface))] p-4"
    >
      <div>
        <p className="font-medium text-[rgb(var(--foreground))]">
          {usuario.nome ?? usuario.email ?? 'Usuário sem nome'}
        </p>
        <p className="text-xs text-[rgb(var(--foreground-muted))]">{usuario.email}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Perfis
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {roles.map((role) => (
            <label
              key={role.id}
              className={[
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
                perfilIds.has(role.id)
                  ? 'border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--primary)_/_0.08)] text-[rgb(var(--foreground))]'
                  : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--border-strong))]',
              ].join(' ')}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={perfilIds.has(role.id)}
                onChange={() => toggleSet(setPerfilIds, role.id)}
              />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.cor }} />
              {roleLabel(role, tipoSede)}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Departamentos
        </p>
        <p className="mb-2 text-xs text-[rgb(var(--foreground-muted))]">
          Membro = vê/age com as permissões da equipe. Gestor = age a mais e pode incluir/remover
          membros deste departamento.
        </p>
        <div className="space-y-1.5">
          {departamentos.map((depto) => {
            const isMembro = departamentoIds.has(depto.id)
            const isGestor = gestorIds.has(depto.id)
            const organizacional =
              depto.permissions.length === 0 && depto.permissionsGestor.length === 0
            return (
              <div
                key={depto.id}
                className={[
                  'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                  isMembro
                    ? 'border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--primary)_/_0.08)]'
                    : 'border-[rgb(var(--border))]',
                ].join(' ')}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: depto.cor }} />
                <span className="min-w-0 flex-1 font-medium text-[rgb(var(--foreground))]">
                  {depto.nome}
                  {organizacional && (
                    <span className="ml-1.5 font-normal text-[rgb(var(--foreground-muted))]">
                      · organizacional
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setMembroDepartamento(depto.id, !isMembro)}
                    className={[
                      'rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                      isMembro
                        ? 'bg-[rgb(var(--primary))] text-white'
                        : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                    ].join(' ')}
                  >
                    Membro
                  </button>
                  <button
                    type="button"
                    title="Gestor: gerencia a área e a equipe do departamento"
                    onClick={() => setGestorDepartamento(depto.id, !isGestor)}
                    className={[
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                      isGestor
                        ? 'bg-[rgb(var(--primary))] text-white'
                        : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                    ].join(' ')}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Gestor
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Permissões efetivas
        </p>
        <p className="mb-2 text-xs text-[rgb(var(--foreground-muted))]">
          Marcadas = a pessoa terá acesso. Badges mostram a origem. Desmarcar o que perfil/depto
          concede cria uma revogação específica.
        </p>
        <div className="space-y-3">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                {group.label}
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => {
                  const badge = origemBadge(item.key)
                  return (
                    <label
                      key={item.key}
                      className={[
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
                        permissoes.has(item.key)
                          ? 'border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--primary)_/_0.08)] text-[rgb(var(--foreground))]'
                          : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--border-strong))]',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={permissoes.has(item.key)}
                        onChange={() => togglePermissao(item.key)}
                      />
                      <span
                        className={[
                          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                          permissoes.has(item.key)
                            ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))]'
                            : 'border-[rgb(var(--border-strong))]',
                        ].join(' ')}
                      >
                        {permissoes.has(item.key) && <Check className="h-2.5 w-2.5 text-white" />}
                      </span>
                      <span className="min-w-0 flex-1">{item.label}</span>
                      {badge && (
                        <span className="shrink-0 rounded bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                          {badge}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Salvar acesso
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-3 w-3" /> Cancelar
        </button>
      </div>
    </form>
  )
}
