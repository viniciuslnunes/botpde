'use server'

import { revalidatePath } from 'next/cache'
import { db, type Prisma } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { ALL_PERMISSIONS, PERMISSIONS, applyPermissionCascade } from '@torcida/types'

const ALL_PERMISSIONS_SET: readonly string[] = ALL_PERMISSIONS

// Tipos explícitos para os resultados das queries abaixo — o schema tem
// relações suficientes para o TypeScript desistir de inferir os tipos do
// Prisma silenciosamente (vira `unknown`/implicit any sem anotação).
interface RoleLite {
  id: string
  permissions: string[]
}
interface DepartamentoLite {
  id: string
}
interface UserRoleLite {
  roleId: string
}
interface UserDepartamentoLite {
  departamentoId: string
}
interface UserPermissionLite {
  permission: string
  granted: boolean
}
interface DepartamentoGestorLite {
  departamentoId: string
}

/**
 * Salva o acesso completo de um usuário no tenant atual: perfis (Role),
 * departamentos (com gestor opcional) e permissões adicionais.
 *
 * O formulário envia o estado EFETIVO desejado (perfis marcados,
 * departamentos marcados, permissões marcadas como concedidas) — esta
 * função calcula o diff mínimo contra o estado atual do banco.
 */
export async function salvarAcessoUsuario(userId: string, formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const perfilIds = new Set(formData.getAll('perfilIds') as string[])
  const departamentoIds = new Set(formData.getAll('departamentoIds') as string[])
  const gestorDepartamentoIds = new Set(formData.getAll('gestorDepartamentoIds') as string[])
  // Filtra pelo vocabulário canônico e aplica a cascata de dependência
  // (base do grupo) — garante consistência mesmo se o cliente burlar a UI
  const permissoesEfetivas = new Set<string>(
    applyPermissionCascade(
      [],
      (formData.getAll('permissoes') as string[]).filter((p) => ALL_PERMISSIONS_SET.includes(p)),
    ),
  )

  const usuarioExiste = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!usuarioExiste) throw new Error('Usuário não encontrado')

  const rolesTenant: RoleLite[] = await db.role.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, permissions: true },
  })
  const departamentosTenant: DepartamentoLite[] = await db.departamento.findMany({
    where: { tenantId: tenant.id },
    select: { id: true },
  })
  const userRolesAtuais: UserRoleLite[] = await db.userRole.findMany({
    where: { userId, tenantId: tenant.id },
    select: { roleId: true },
  })
  const userDepartamentosAtuais: UserDepartamentoLite[] = await db.userDepartamento.findMany({
    where: { userId, tenantId: tenant.id },
    select: { departamentoId: true },
  })
  const userPermissionsAtuais: UserPermissionLite[] = await db.userPermission.findMany({
    where: { userId, tenantId: tenant.id },
    select: { permission: true, granted: true },
  })
  const gestorAtuais: DepartamentoGestorLite[] = await db.departamentoGestor.findMany({
    where: { userId, departamento: { tenantId: tenant.id } },
    select: { departamentoId: true },
  })

  const validRoleIds = new Set(rolesTenant.map((r) => r.id))
  const validDepartamentoIds = new Set(departamentosTenant.map((d) => d.id))

  const roleIdsAtuais = new Set(userRolesAtuais.map((r) => r.roleId))
  const departamentoIdsAtuais = new Set(userDepartamentosAtuais.map((d) => d.departamentoId))
  const gestorIdsAtuais = new Set(gestorAtuais.map((g) => g.departamentoId))

  // Permissões efetivamente concedidas pelos perfis SELECIONADOS no formulário
  const cobertoPorPerfis = new Set<string>()
  for (const role of rolesTenant) {
    if (perfilIds.has(role.id)) role.permissions.forEach((p) => cobertoPorPerfis.add(p))
  }

  const overridesAtuais = new Map(userPermissionsAtuais.map((p) => [p.permission, p.granted]))

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // ── Perfis ──
    for (const roleId of perfilIds) {
      if (!validRoleIds.has(roleId) || roleIdsAtuais.has(roleId)) continue
      await tx.userRole.create({ data: { userId, tenantId: tenant.id, roleId } })
    }
    for (const roleId of roleIdsAtuais) {
      if (!perfilIds.has(roleId)) {
        await tx.userRole.deleteMany({ where: { userId, tenantId: tenant.id, roleId } })
      }
    }

    // ── Departamentos + gestores ──
    for (const departamentoId of departamentoIds) {
      if (!validDepartamentoIds.has(departamentoId) || departamentoIdsAtuais.has(departamentoId)) continue
      await tx.userDepartamento.create({ data: { userId, tenantId: tenant.id, departamentoId } })
    }
    for (const departamentoId of departamentoIdsAtuais) {
      if (!departamentoIds.has(departamentoId)) {
        await tx.userDepartamento.deleteMany({ where: { userId, tenantId: tenant.id, departamentoId } })
      }
    }

    for (const departamentoId of gestorDepartamentoIds) {
      const valido = validDepartamentoIds.has(departamentoId) && departamentoIds.has(departamentoId)
      if (!valido || gestorIdsAtuais.has(departamentoId)) continue
      await tx.departamentoGestor.create({ data: { userId, departamentoId } })
    }
    for (const departamentoId of gestorIdsAtuais) {
      const deveSerGestor = departamentoIds.has(departamentoId) && gestorDepartamentoIds.has(departamentoId)
      if (!deveSerGestor) {
        await tx.departamentoGestor.deleteMany({ where: { userId, departamentoId } })
      }
    }

    // ── Permissões adicionais (diff contra o estado efetivo desejado) ──
    for (const permission of ALL_PERMISSIONS) {
      const desejaConceder = permissoesEfetivas.has(permission)
      const coberto = cobertoPorPerfis.has(permission)
      const overrideAtual = overridesAtuais.get(permission)

      if (desejaConceder === coberto) {
        // Estado desejado já é o padrão do perfil — override (se existir) fica obsoleto
        if (overrideAtual !== undefined) {
          await tx.userPermission.deleteMany({ where: { userId, tenantId: tenant.id, permission } })
        }
        continue
      }

      // desejaConceder !== coberto → precisa de override explícito
      if (overrideAtual !== desejaConceder) {
        await tx.userPermission.upsert({
          where: { userId_tenantId_permission: { userId, tenantId: tenant.id, permission } },
          create: { userId, tenantId: tenant.id, permission, granted: desejaConceder },
          update: { granted: desejaConceder },
        })
      }
    }

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'ACESSO_USUARIO_ATUALIZADO',
        entidade: 'User',
        entidadeId: userId,
        detalhes: {
          perfilIds: [...perfilIds],
          departamentoIds: [...departamentoIds],
          gestorDepartamentoIds: [...gestorDepartamentoIds],
        },
      },
    })
  })

  revalidatePath('/admin/acessos')
}
