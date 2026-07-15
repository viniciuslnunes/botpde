import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { AccessManager } from '@/components/admin/access-manager'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Controle de acesso — Admin' }

// Tipos explícitos para os resultados das queries abaixo — o schema tem
// relações suficientes para o TypeScript desistir de inferir os tipos do
// Prisma silenciosamente (vira `unknown`/implicit any sem anotação).
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
}
interface DepartamentoLite {
  id: string
  nome: string
  cor: string
  permissions: string[]
  permissionsGestor: string[]
  slug: string
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

export default async function AcessosPage() {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE))
  } catch {
    redirect('/admin')
  }

  const roles: RoleLite[] = await db.role.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ isSystem: 'desc' }, { ordem: 'asc' }, { nome: 'asc' }],
    select: { id: true, nome: true, cor: true, isSystem: true, permissions: true },
  })
  const departamentosRaw: DepartamentoLite[] = await db.departamento.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: { id: true, nome: true, cor: true, permissions: true, permissionsGestor: true, slug: true },
  })
  // Blindagem: Sócio/Torcedor não são departamentos (são tipos de membro).
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

  // Tipo da Sede do tenant — contextualiza rótulos de cargos de sistema
  // (Presidente na Sede principal, Liderança em subsedes/PDEs).
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
    <div className="flex flex-col h-full">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Controle de acesso</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Atribua a pessoas os cargos e departamentos já definidos em Configurações — {tenant.nome}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6">
        <div className="app-container space-y-4">
          {roles.length === 0 && departamentos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-6 py-10 text-center">
              <KeyRound className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
              <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">
                Ainda não há templates de acesso
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[rgb(var(--foreground-muted))]">
                Crie cargos e departamentos em Configurações. Eles ficam prontos para atribuir aqui
                quando a torcida tiver usuários.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/admin/configuracoes#cargos"
                  className="inline-flex items-center rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Ir para cargos
                </Link>
                <Link
                  href="/admin/configuracoes#departamentos"
                  className="inline-flex items-center rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  Ir para departamentos
                </Link>
              </div>
            </div>
          ) : (
            <AccessManager
              usuarios={usuariosFormatados}
              roles={roles}
              departamentos={departamentos}
              tipoSede={tipoSede}
            />
          )}
        </div>
      </div>
    </div>
  )
}
