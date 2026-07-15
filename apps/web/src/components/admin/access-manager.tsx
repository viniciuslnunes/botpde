'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, ShieldCheck, UserRound } from 'lucide-react'
import { rotuloCargoSistema } from '@torcida/types'
import {
  AccessUserPanel,
  AccessUserNotFound,
  type AccessDepartamentoOpt,
  type AccessRoleOpt,
  type AccessUsuario,
} from '@/components/admin/access-user-panel'

interface AccessManagerProps {
  usuarios: AccessUsuario[]
  roles: AccessRoleOpt[]
  departamentos: AccessDepartamentoOpt[]
  tipoSede: string
  /** Deep-link: abre o painel deste usuário (`?usuario=`) */
  initialUserId?: string | null
}

function roleLabel(role: AccessRoleOpt, tipoSede: string): string {
  return role.isSystem ? rotuloCargoSistema(role.nome, tipoSede) : role.nome
}

function permsDoDepartamento(depto: AccessDepartamentoOpt, isGestor: boolean): string[] {
  return isGestor ? [...depto.permissions, ...depto.permissionsGestor] : [...depto.permissions]
}

function contarPermissoesAdicionais(
  usuario: AccessUsuario,
  roles: AccessRoleOpt[],
  departamentos: AccessDepartamentoOpt[],
): number {
  const coberto = new Set([
    ...roles.filter((r) => usuario.perfilIds.includes(r.id)).flatMap((r) => r.permissions),
    ...departamentos
      .filter((d) => usuario.departamentoIds.includes(d.id))
      .flatMap((d) => permsDoDepartamento(d, usuario.gestorDepartamentoIds.includes(d.id))),
  ])
  return usuario.permissoesAdicionais.filter((p) => p.granted && !coberto.has(p.permission)).length
}

export function AccessManager({
  usuarios,
  roles,
  departamentos,
  tipoSede,
  initialUserId = null,
}: AccessManagerProps) {
  const router = useRouter()
  const [editandoId, setEditandoId] = useState<string | null>(initialUserId)

  useEffect(() => {
    setEditandoId(initialUserId)
  }, [initialUserId])

  function openUser(id: string) {
    setEditandoId(id)
    router.replace(`/admin/acessos?secao=pessoas&usuario=${encodeURIComponent(id)}`, {
      scroll: false,
    })
  }

  function closeUser() {
    setEditandoId(null)
    router.replace('/admin/acessos?secao=pessoas', { scroll: false })
  }

  if (usuarios.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-6 py-10 text-center">
        <UserRound className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
        <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">
          Nenhum usuário nesta torcida ainda
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--foreground-muted))]">
          Defina cargos e departamentos nas abas ao lado. Quando houver membros, volte aqui para
          atribuir o acesso de cada pessoa.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/admin/acessos?secao=cargos"
            className="inline-flex items-center rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Gerenciar cargos
          </Link>
          <Link
            href="/admin/acessos?secao=departamentos"
            className="inline-flex items-center rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Gerenciar departamentos
          </Link>
        </div>
      </div>
    )
  }

  if (editandoId) {
    const usuario = usuarios.find((u) => u.id === editandoId)
    if (!usuario) {
      return <AccessUserNotFound onBack={closeUser} />
    }
    return (
      <AccessUserPanel
        key={usuario.id}
        usuario={usuario}
        roles={roles}
        departamentos={departamentos}
        tipoSede={tipoSede}
        onClose={closeUser}
      />
    )
  }

  return (
    <div className="space-y-2">
      {usuarios.map((usuario) => (
        <UsuarioAcessoRow
          key={usuario.id}
          usuario={usuario}
          roles={roles}
          departamentos={departamentos}
          tipoSede={tipoSede}
          onEdit={() => openUser(usuario.id)}
        />
      ))}
    </div>
  )
}

function UsuarioAcessoRow({
  usuario,
  roles,
  departamentos,
  tipoSede,
  onEdit,
}: {
  usuario: AccessUsuario
  roles: AccessRoleOpt[]
  departamentos: AccessDepartamentoOpt[]
  tipoSede: string
  onEdit: () => void
}) {
  const perfis = roles.filter((r) => usuario.perfilIds.includes(r.id))
  const deptos = departamentos.filter((d) => usuario.departamentoIds.includes(d.id))
  const extras = contarPermissoesAdicionais(usuario, roles, departamentos)
  const nome = usuario.nome ?? usuario.email ?? 'Usuário sem nome'

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 transition-colors hover:border-[rgb(var(--primary)_/_0.35)]">
      <div className="flex items-start gap-3">
        {usuario.avatarUrl ? (
          <img
            src={usuario.avatarUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]">
            <UserRound className="h-4 w-4" />
          </div>
        )}

        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <p className="truncate font-medium text-[rgb(var(--foreground))]">{nome}</p>
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
                  <span className="ml-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {isGestor ? 'gestor' : 'membro'}
                  </span>
                  {isGestor && <ShieldCheck className="h-3 w-3 text-[rgb(var(--primary))]" />}
                </span>
              )
            })}

            {extras > 0 && (
              <span className="rounded-full bg-[rgb(var(--primary)_/_0.1)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                +{extras} extra{extras === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onEdit}
          title={`Editar acesso de ${nome}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
