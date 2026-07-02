'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, Check, X, Pencil, ShieldCheck, UserRound } from 'lucide-react'
import { PERMISSION_GROUPS, calculateEffectivePermissions, applyPermissionCascade } from '@torcida/types'
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
}

export function AccessManager({ usuarios, roles, departamentos }: AccessManagerProps) {
  const [editandoId, setEditandoId] = useState<string | null>(null)

  if (usuarios.length === 0) {
    return (
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Nenhum usuário associado a este tenant ainda. Usuários aparecem aqui assim que se cadastram
        ou têm um membro aprovado.
      </p>
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
            onClose={() => setEditandoId(null)}
          />
        ) : (
          <UsuarioAcessoRow
            key={usuario.id}
            usuario={usuario}
            roles={roles}
            departamentos={departamentos}
            onEdit={() => setEditandoId(usuario.id)}
          />
        ),
      )}
    </div>
  )
}

function contarPermissoesAdicionais(usuario: UsuarioAcesso, roles: RoleOpt[]): number {
  const cobertoPorPerfis = new Set(
    roles.filter((r) => usuario.perfilIds.includes(r.id)).flatMap((r) => r.permissions),
  )
  return usuario.permissoesAdicionais.filter(
    (p) => p.granted && !cobertoPorPerfis.has(p.permission),
  ).length
}

function UsuarioAcessoRow({
  usuario,
  roles,
  departamentos,
  onEdit,
}: {
  usuario: UsuarioAcesso
  roles: RoleOpt[]
  departamentos: DepartamentoOpt[]
  onEdit: () => void
}) {
  const perfis = roles.filter((r) => usuario.perfilIds.includes(r.id))
  const deptos = departamentos.filter((d) => usuario.departamentoIds.includes(d.id))
  const extras = contarPermissoesAdicionais(usuario, roles)

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
                  {p.nome}
                </span>
              ))
            )}

            {deptos.map((d) => (
              <span
                key={d.id}
                className="flex items-center gap-1 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs text-[rgb(var(--foreground-muted))]"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.cor }} />
                {d.nome}
                {usuario.gestorDepartamentoIds.includes(d.id) && (
                  <ShieldCheck className="h-3 w-3 text-[rgb(var(--primary))]" />
                )}
              </span>
            ))}

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
  onClose,
}: {
  usuario: UsuarioAcesso
  roles: RoleOpt[]
  departamentos: DepartamentoOpt[]
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [perfilIds, setPerfilIds] = useState<Set<string>>(new Set(usuario.perfilIds))
  const [departamentoIds, setDepartamentoIds] = useState<Set<string>>(new Set(usuario.departamentoIds))
  const [gestorIds, setGestorIds] = useState<Set<string>>(new Set(usuario.gestorDepartamentoIds))

  const permissoesEfetivasIniciais = useMemo(() => {
    const rolePermissions = roles
      .filter((r) => usuario.perfilIds.includes(r.id))
      .flatMap((r) => r.permissions)
    return calculateEffectivePermissions(rolePermissions, usuario.permissoesAdicionais)
  }, [roles, usuario.perfilIds, usuario.permissoesAdicionais])

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
      // Cascata de dependência: marcar não-base puxa a base do grupo,
      // desmarcar a base derruba as irmãs (mesma regra dos perfis)
      return new Set(applyPermissionCascade([...prev], [...next]))
    })
  }

  function toggleDepartamento(id: string) {
    toggleSet(setDepartamentoIds, id)
    // Desmarcar o departamento remove a gestão dele também
    setGestorIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
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

      {/* Perfis */}
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
              {role.nome}
            </label>
          ))}
        </div>
      </div>

      {/* Departamentos */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Departamentos
        </p>
        <div className="space-y-1.5">
          {departamentos.map((depto) => {
            const selecionado = departamentoIds.has(depto.id)
            return (
              <div
                key={depto.id}
                className={[
                  'flex items-center gap-3 rounded-lg border px-3 py-2 text-xs transition-colors',
                  selecionado
                    ? 'border-[rgb(var(--primary)_/_0.4)] bg-[rgb(var(--primary)_/_0.08)]'
                    : 'border-[rgb(var(--border))]',
                ].join(' ')}
              >
                <label className="flex flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selecionado}
                    onChange={() => toggleDepartamento(depto.id)}
                  />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: depto.cor }} />
                  <span className="text-[rgb(var(--foreground))]">{depto.nome}</span>
                </label>

                <label
                  className={[
                    'flex cursor-pointer items-center gap-1.5 text-[rgb(var(--foreground-muted))]',
                    !selecionado && 'pointer-events-none opacity-40',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    disabled={!selecionado}
                    checked={gestorIds.has(depto.id)}
                    onChange={() => toggleSet(setGestorIds, depto.id)}
                  />
                  <ShieldCheck className={['h-3.5 w-3.5', gestorIds.has(depto.id) && 'text-[rgb(var(--primary))]'].join(' ')} />
                  gestor
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {/* Permissões adicionais */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Permissões efetivas
        </p>
        <p className="mb-2 text-xs text-[rgb(var(--foreground-muted))]">
          Marcadas aqui = a pessoa terá acesso, seja pelo perfil ou como concessão extra pontual.
          Desmarcar uma permissão que o perfil concede cria uma revogação específica para este usuário.
        </p>
        <div className="space-y-3">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {group.items.map((item) => (
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
                    {item.label}
                  </label>
                ))}
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
