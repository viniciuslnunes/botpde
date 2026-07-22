'use server'

import { revalidatePath } from 'next/cache'
import { invalidarBadgesAutorTenant } from '@/lib/comunidade-cache'
import { db, syncMembershipFromRoles, type Prisma } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import {
  ALL_PERMISSIONS,
  MAX_VICE_PRESIDENTES,
  PERMISSIONS,
  SYSTEM_ROLES,
  applyPermissionCascade,
  canManageDepartamento,
  calculateEffectivePermissions,
  hasPermission,
  permissionsOfRole,
  podeTerVice,
  PAPEL_DEPARTAMENTO,
} from '@torcida/types'
import { auth } from '@/lib/auth'
import { getActiveTenant, getUserPermissionsInTenant, invalidatePermissionsCache } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'

const ALL_PERMISSIONS_SET: readonly string[] = ALL_PERMISSIONS

interface RoleLite {
  id: string
  nome: string
  isSystem: boolean
  permissions: string[]
  permissionsExtras: string[]
  departamentoId: string | null
  papelNoDepartamento: string | null
}
interface DepartamentoLite {
  id: string
  permissions: string[]
  permissionsGestor: string[]
}
interface UserRoleLite {
  roleId: string
}
interface UserPermissionLite {
  permission: string
  granted: boolean
}

/**
 * Salva o acesso do usuário: perfis + overrides de permissões adicionais.
 * Membership de departamento é projeção dos perfis vinculados (sync).
 */
export async function salvarAcessoUsuario(userId: string, formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const perfilIds = new Set(formData.getAll('perfilIds') as string[])
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
    select: {
      id: true,
      nome: true,
      isSystem: true,
      permissions: true,
      permissionsExtras: true,
      departamentoId: true,
      papelNoDepartamento: true,
    },
  })
  const departamentosTenant: DepartamentoLite[] = await db.departamento.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, permissions: true, permissionsGestor: true },
  })
  const deptoById = new Map(departamentosTenant.map((d) => [d.id, d]))

  const userRolesAtuais: UserRoleLite[] = await db.userRole.findMany({
    where: { userId, tenantId: tenant.id },
    select: { roleId: true },
  })
  const userPermissionsAtuais: UserPermissionLite[] = await db.userPermission.findMany({
    where: { userId, tenantId: tenant.id },
    select: { permission: true, granted: true },
  })

  const viceRole: RoleLite | undefined = rolesTenant.find(
    (r) => r.isSystem && r.nome === SYSTEM_ROLES.VICE,
  )
  if (viceRole && perfilIds.has(viceRole.id)) {
    const sedeDoTenant: { tipo: string } | null = await db.sede.findFirst({
      where: { tenantId: tenant.id, tipo: 'SEDE' },
      select: { tipo: true },
    })
    if (!podeTerVice(sedeDoTenant?.tipo ?? 'PONTO_ENCONTRO')) {
      throw new Error('Vice-presidente existe apenas na Sede principal da torcida.')
    }
    const outrosVices: number = await db.userRole.count({
      where: { tenantId: tenant.id, roleId: viceRole.id, userId: { not: userId } },
    })
    if (outrosVices >= MAX_VICE_PRESIDENTES) {
      throw new Error(`Limite de ${MAX_VICE_PRESIDENTES} vice-presidentes já atingido nesta torcida.`)
    }
  }

  const validRoleIds = new Set(rolesTenant.map((r) => r.id))
  const roleIdsAtuais = new Set(userRolesAtuais.map((r) => r.roleId))

  const cobertoPorPerfis = new Set<string>()
  for (const role of rolesTenant) {
    if (!perfilIds.has(role.id)) continue
    const depto = role.departamentoId ? deptoById.get(role.departamentoId) ?? null : null
    for (const p of permissionsOfRole(role, depto)) cobertoPorPerfis.add(p)
  }

  const overridesAtuais = new Map(userPermissionsAtuais.map((p) => [p.permission, p.granted]))

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const roleId of perfilIds) {
      if (!validRoleIds.has(roleId) || roleIdsAtuais.has(roleId)) continue
      await tx.userRole.create({ data: { userId, tenantId: tenant.id, roleId } })
    }
    for (const roleId of roleIdsAtuais) {
      if (!perfilIds.has(roleId)) {
        await tx.userRole.deleteMany({ where: { userId, tenantId: tenant.id, roleId } })
      }
    }

    await syncMembershipFromRoles(tx, { userId, tenantId: tenant.id })

    for (const permission of ALL_PERMISSIONS) {
      const desejaConceder = permissoesEfetivas.has(permission)
      const coberto = cobertoPorPerfis.has(permission)
      const overrideAtual = overridesAtuais.get(permission)

      if (desejaConceder === coberto) {
        if (overrideAtual !== undefined) {
          await tx.userPermission.deleteMany({ where: { userId, tenantId: tenant.id, permission } })
        }
        continue
      }

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
          permissoesEfetivas: [...permissoesEfetivas],
        },
      },
    })
  })

  invalidatePermissionsCache(userId, tenant.id)
  invalidarBadgesAutorTenant(tenant.id)
  revalidatePath('/admin/acessos')
  revalidatePath('/admin/hierarquia')
  revalidatePath('/portal/departamentos')
}

/**
 * Cria um novo perfil a partir de departamento + papel + extras (composição).
 * Se `userId` for enviado, atribui o perfil à pessoa e sincroniza membership.
 */
export async function salvarPerfilComposto(formData: FormData) {
  const { session, tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const nome = String(formData.get('nome') ?? '').trim()
  const cor = String(formData.get('cor') ?? '#6b7280').trim()
  const userId = String(formData.get('userId') ?? '').trim() || null
  const departamentoIdRaw = String(formData.get('departamentoId') ?? '').trim()
  const papelRaw = String(formData.get('papelNoDepartamento') ?? '').trim()
  const extras = applyPermissionCascade(
    [],
    (formData.getAll('permissionsExtras') as string[]).filter((p) => ALL_PERMISSIONS_SET.includes(p)),
  )

  if (nome.length < 2) throw new Error('Nome do perfil é obrigatório')

  const departamentoId = departamentoIdRaw || null
  const papelNoDepartamento =
    papelRaw === PAPEL_DEPARTAMENTO.GESTOR || papelRaw === PAPEL_DEPARTAMENTO.MEMBRO
      ? papelRaw
      : null

  if (Boolean(departamentoId) !== Boolean(papelNoDepartamento)) {
    throw new Error('Departamento e papel (membro/gestor) devem ser informados juntos.')
  }

  if (departamentoId) {
    const depto = await db.departamento.findFirst({
      where: { id: departamentoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!depto) throw new Error('Departamento não encontrado')
  }

  const existing = await db.role.findFirst({
    where: { tenantId: tenant.id, nome },
  })
  if (existing) throw new Error('Já existe um perfil com este nome')

  const role = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.role.create({
      data: {
        tenantId: tenant.id,
        nome,
        cor: /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#6b7280',
        isSystem: false,
        permissions: departamentoId ? [] : extras,
        permissionsExtras: departamentoId ? extras : [],
        departamentoId,
        papelNoDepartamento,
      },
    })

    if (userId) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!user) throw new Error('Usuário não encontrado')
      await tx.userRole.create({
        data: { userId, tenantId: tenant.id, roleId: created.id },
      })
      // Extras do perfil deixam de ser overrides pontuais na pessoa
      for (const permission of extras) {
        await tx.userPermission.deleteMany({
          where: { userId, tenantId: tenant.id, permission },
        })
      }
      await syncMembershipFromRoles(tx, { userId, tenantId: tenant.id })
    }

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'ROLE_CRIADO',
        entidade: 'Role',
        entidadeId: created.id,
        detalhes: {
          nome,
          departamentoId,
          papelNoDepartamento,
          permissionsExtras: extras,
          origem: 'perfil_composto',
          atribuidoA: userId,
        },
      },
    })

    return created
  })

  if (userId) invalidatePermissionsCache(userId, tenant.id)
  invalidarBadgesAutorTenant(tenant.id)
  revalidatePath('/admin/acessos')
  revalidatePath('/admin/configuracoes')
  revalidatePath('/admin/hierarquia')

  return {
    success: true as const,
    id: role.id,
    nome: role.nome,
    cor: role.cor,
    isSystem: role.isSystem,
    permissionsExtras: role.permissionsExtras,
    departamentoId: role.departamentoId,
    papelNoDepartamento: role.papelNoDepartamento,
  }
}

async function assertPodeGerirDepartamento(departamentoId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant) throw new Error('Não autorizado')

  if (isSuperAdminEmail(session.user.email)) {
    return { session, tenant }
  }

  const { rolePermissions, overrides }: {
    rolePermissions: string[]
    overrides: { permission: string; granted: boolean }[]
  } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)

  if (hasPermission(effective, PERMISSIONS.ROLES_MANAGE)) {
    return { session, tenant }
  }

  const gestao: { departamentoId: string }[] = await db.departamentoGestor.findMany({
    where: { userId: session.user.id, departamento: { tenantId: tenant.id } },
    select: { departamentoId: true },
  })
  const gestorIds = gestao.map((g) => g.departamentoId)
  if (!canManageDepartamento(effective, gestorIds, departamentoId)) {
    throw new Error('Sem permissão')
  }

  return { session, tenant }
}

export async function adicionarMembroDepartamento(departamentoId: string, targetUserId: string) {
  const { session, tenant } = await assertPodeGerirDepartamento(departamentoId)

  const departamento: { id: string; nome: string } | null = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId: tenant.id },
    select: { id: true, nome: true },
  })
  if (!departamento) throw new Error('Departamento não encontrado')

  const roleMembro = await db.role.findFirst({
    where: {
      tenantId: tenant.id,
      departamentoId,
      papelNoDepartamento: PAPEL_DEPARTAMENTO.MEMBRO,
    },
    select: { id: true },
  })

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    if (roleMembro) {
      const ja = await tx.userRole.findFirst({
        where: { userId: targetUserId, tenantId: tenant.id, roleId: roleMembro.id },
      })
      if (!ja) {
        await tx.userRole.create({
          data: { userId: targetUserId, tenantId: tenant.id, roleId: roleMembro.id },
        })
      }
    } else {
      await tx.userDepartamento.upsert({
        where: {
          userId_tenantId_departamentoId: {
            userId: targetUserId,
            tenantId: tenant.id,
            departamentoId,
          },
        },
        create: { userId: targetUserId, tenantId: tenant.id, departamentoId },
        update: {},
      })
    }
    await syncMembershipFromRoles(tx, { userId: targetUserId, tenantId: tenant.id })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_MEMBRO_ADICIONADO',
        entidade: 'Departamento',
        entidadeId: departamentoId,
        detalhes: { userId: targetUserId },
      },
    })
  })

  invalidatePermissionsCache(targetUserId, tenant.id)
  invalidarBadgesAutorTenant(tenant.id)
  revalidatePath('/admin/acessos')
  revalidatePath('/portal/departamentos', 'layout')
}

export async function removerMembroDepartamento(departamentoId: string, targetUserId: string) {
  const { session, tenant } = await assertPodeGerirDepartamento(departamentoId)

  const departamento: { id: string } | null = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId: tenant.id },
    select: { id: true },
  })
  if (!departamento) throw new Error('Departamento não encontrado')

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.userRole.deleteMany({
      where: {
        userId: targetUserId,
        tenantId: tenant.id,
        role: { departamentoId },
      },
    })
    await syncMembershipFromRoles(tx, { userId: targetUserId, tenantId: tenant.id })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPARTAMENTO_MEMBRO_REMOVIDO',
        entidade: 'Departamento',
        entidadeId: departamentoId,
        detalhes: { userId: targetUserId },
      },
    })
  })

  invalidatePermissionsCache(targetUserId, tenant.id)
  invalidarBadgesAutorTenant(tenant.id)
  revalidatePath('/admin/acessos')
  revalidatePath('/portal/departamentos', 'layout')
}
