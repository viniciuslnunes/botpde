import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { AccessManager } from '@/components/admin/access-manager'
import { AccessControlNav, parseAccessSecao } from '@/components/admin/access-control-nav'
import { RolesManager, DepartamentosManager } from '@/components/admin/config-forms'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Controle de acesso — Admin' }

interface UsuarioBasico {
  id: string
  nome: string | null
  email: string | null
  avatarUrl: string | null
}
interface RoleLite {
  id: string
  nome: string
  cor: string
  isSystem: boolean
  permissions: string[]
  ordem: number
}
interface DepartamentoLite {
  id: string
  nome: string
  cor: string
  permissions: string[]
  permissionsGestor: string[]
  slug: string
  moduloPortal: string | null
  ordem: number
}
interface UserRoleLite {
  userId: string
  roleId: string
}
interface UserDepartamentoLite {
  userId: string
  departamentoId: string
}
interface UserPermissionLite {
  userId: string
  permission: string
  granted: boolean
}
interface DepartamentoGestorLite {
  userId: string
  departamentoId: string
}
interface UsoPorRole {
  roleId: string
  _count: { roleId: number }
}

export default async function AcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string; usuario?: string }>
}) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE))
  } catch {
    redirect('/admin')
  }

  const { secao: secaoRaw, usuario: usuarioRaw } = await searchParams
  const secao = parseAccessSecao(secaoRaw)
  const initialUserId = usuarioRaw?.trim() || null

  const usoPorRole: UsoPorRole[] = await db.userRole.groupBy({
    by: ['roleId'],
    where: { tenantId: tenant.id },
    _count: { roleId: true },
  })
  const usoMap = new Map(usoPorRole.map((u) => [u.roleId, u._count.roleId]))

  const rolesRaw: RoleLite[] = await db.role.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ isSystem: 'desc' }, { ordem: 'asc' }, { nome: 'asc' }],
    select: {
      id: true,
      nome: true,
      cor: true,
      isSystem: true,
      permissions: true,
      ordem: true,
    },
  })
  const roles = rolesRaw.map((role) => ({
    ...role,
    emUso: usoMap.get(role.id) ?? 0,
  }))

  const departamentosRaw: DepartamentoLite[] = await db.departamento.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: {
      id: true,
      nome: true,
      cor: true,
      permissions: true,
      permissionsGestor: true,
      slug: true,
      moduloPortal: true,
      ordem: true,
    },
  })
  const departamentos = departamentosRaw.filter(
    (d) => d.slug !== 'socio' && d.slug !== 'torcedor' && d.nome !== 'Sócio' && d.nome !== 'Torcedor',
  )

  const usuarios: UsuarioBasico[] = await db.user.findMany({
    where: {
      OR: [
        { membros: { some: { tenantId: tenant.id } } },
        { userRoles: { some: { tenantId: tenant.id } } },
        { userDepartamentos: { some: { tenantId: tenant.id } } },
        { userPermissions: { some: { tenantId: tenant.id } } },
      ],
    },
    select: { id: true, nome: true, email: true, avatarUrl: true },
    orderBy: { nome: 'asc' },
  })
  const userRoles: UserRoleLite[] = await db.userRole.findMany({
    where: { tenantId: tenant.id },
    select: { userId: true, roleId: true },
  })
  const userDepartamentos: UserDepartamentoLite[] = await db.userDepartamento.findMany({
    where: { tenantId: tenant.id },
    select: { userId: true, departamentoId: true },
  })
  const userPermissions: UserPermissionLite[] = await db.userPermission.findMany({
    where: { tenantId: tenant.id },
    select: { userId: true, permission: true, granted: true },
  })
  const gestores: DepartamentoGestorLite[] = await db.departamentoGestor.findMany({
    where: { departamento: { tenantId: tenant.id } },
    select: { userId: true, departamentoId: true },
  })

  const sedeDoTenant: { tipo: string } | null = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE' },
    select: { tipo: true },
  })
  const tipoSede: string = sedeDoTenant?.tipo ?? 'PONTO_ENCONTRO'

  const usuariosFormatados = usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    avatarUrl: u.avatarUrl,
    perfilIds: userRoles.filter((r) => r.userId === u.id).map((r) => r.roleId),
    departamentoIds: userDepartamentos.filter((d) => d.userId === u.id).map((d) => d.departamentoId),
    gestorDepartamentoIds: gestores.filter((g) => g.userId === u.id).map((g) => g.departamentoId),
    permissoesAdicionais: userPermissions
      .filter((p) => p.userId === u.id)
      .map((p) => ({ permission: p.permission, granted: p.granted })),
  }))

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
            <div>
              <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Controle de acesso</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Pessoas, cargos e departamentos — {tenant.nome}
              </p>
            </div>
          </div>
          {!(secao === 'pessoas' && initialUserId) && (
            <AccessControlNav
              secao={secao}
              counts={{
                pessoas: usuariosFormatados.length,
                cargos: roles.length,
                departamentos: departamentos.length,
              }}
            />
          )}
        </div>
      </div>

      <div className="py-6">
        <div className="app-container">
          {secao === 'cargos' && <RolesManager roles={roles} tipoSede={tipoSede} />}
          {secao === 'departamentos' && <DepartamentosManager departamentos={departamentos} />}
          {secao === 'pessoas' && (
            <AccessManager
              usuarios={usuariosFormatados}
              roles={roles}
              departamentos={departamentos}
              tipoSede={tipoSede}
              initialUserId={initialUserId}
            />
          )}
        </div>
      </div>
    </div>
  )
}
