'use server'

import { auth } from '@/lib/auth'
import { db, upsertDepartamentosCanonicos } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS, podeTerVice } from '@torcida/types'

const schema = z.object({
  slug: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífens'),
  nome: z.string().min(3).max(100),
  corPrimaria: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .optional()
    .default('#7c3aed'),
})

export type SetupState = {
  errors?: Record<string, string[]>
  message?: string
  tenantId?: string
  tenantSlug?: string
}

export async function criarTenantInicial(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const session = await auth()

  if (!session?.user?.email || !superAdminEmails.includes(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const raw = {
    slug: formData.get('slug') as string,
    nome: formData.get('nome') as string,
    corPrimaria: (formData.get('corPrimaria') as string) || '#7c3aed',
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { slug, nome, corPrimaria } = parsed.data

  const existing = await db.tenant.findUnique({ where: { slug } })
  if (existing) {
    return { errors: { slug: ['Este slug já está em uso.'] } }
  }

  // Cria o tenant + roles de sistema + atribui owner ao usuário logado
  const tenant = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const t = await tx.tenant.create({
      data: { slug, nome, corPrimaria },
    })

    // Cria roles de sistema — permissões vêm de SYSTEM_ROLE_PERMISSIONS (@torcida/types),
    // fonte única de verdade compartilhada com a UI de cargos e as checagens de acesso.
    const [ownerRole] = await Promise.all([
      tx.role.create({
        data: {
          tenantId: t.id,
          nome: SYSTEM_ROLES.OWNER,
          cor: '#7c3aed',
          ordem: 0,
          permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER],
          isSystem: true,
        },
      }),
      tx.role.create({
        data: {
          tenantId: t.id,
          nome: SYSTEM_ROLES.VICE,
          cor: '#0ea5e9',
          ordem: 1,
          permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE],
          isSystem: true,
        },
      }),
      tx.role.create({
        data: {
          tenantId: t.id,
          nome: SYSTEM_ROLES.ADMIN,
          cor: '#2563eb',
          ordem: 2,
          permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN],
          isSystem: true,
        },
      }),
      tx.role.create({
        data: {
          tenantId: t.id,
          nome: SYSTEM_ROLES.MEMBER,
          cor: '#6b7280',
          ordem: 3,
          permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER],
          isSystem: true,
        },
      }),
    ])

    await tx.auditLog.create({
      data: {
        tenantId: t.id,
        atorId: session.user.id,
        acao: 'TENANT_CRIADO',
        entidade: 'Tenant',
        entidadeId: t.id,
        detalhes: { slug, nome },
      },
    })

    // Templates de área — 10 departamentos canônicos (membro vs gestor)
    await upsertDepartamentosCanonicos(tx, t.id)

    // Atribui owner ao usuário logado
    if (session.user.id) {
      await tx.userRole.create({
        data: {
          tenantId: t.id,
          userId: session.user.id,
          roleId: ownerRole.id,
        },
      })

      await tx.auditLog.create({
        data: {
          tenantId: t.id,
          atorId: session.user.id,
          acao: 'OWNER_ATRIBUIDO',
          entidade: 'User',
          entidadeId: session.user.id,
          detalhes: { roleId: ownerRole.id },
        },
      })
    }

    return t
  })

  redirect(`/super-admin/setup/sucesso?tenant=${tenant.id}&slug=${tenant.slug}`)
}

/**
 * Server Action compatível com useActionState + <form>.
 * Recebe tenantId via FormData para evitar problemas com redirect()
 * quando chamado a partir de onClick/useTransition.
 */
export async function atribuirOwnerAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const session = await auth()

  if (!session?.user?.id || !session?.user?.email || !superAdminEmails.includes(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const tenantId = formData.get('tenantId') as string
  if (!tenantId) return { message: 'Tenant não informado.' }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: { roles: { where: { isSystem: true } } },
  })

  if (!tenant) return { message: 'Tenant não encontrado.' }

  // Mapeia roles de sistema existentes
  const roleMap = Object.fromEntries(tenant.roles.map((r: (typeof tenant.roles)[number]) => [r.nome, r]))
  let ownerRole = roleMap[SYSTEM_ROLES.OWNER]
  let rolesCriadas: string[] = []

  // Vice-presidente só existe no tenant da Sede principal (tipo SEDE);
  // subsedes/PDEs promovidas não têm vice. Sem Sede → trata como não-SEDE.
  const sedeDoTenant: { tipo: string } | null = await db.sede.findFirst({
    where: { tenantId },
    select: { tipo: true },
  })
  const isSedePrincipal = podeTerVice(sedeDoTenant?.tipo ?? 'PONTO_ENCONTRO')

  // Cria apenas as roles que ainda não existem
  const toCreate = [
    { nome: SYSTEM_ROLES.OWNER, cor: '#7c3aed', ordem: 0, permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER] },
    ...(isSedePrincipal
      ? [{ nome: SYSTEM_ROLES.VICE, cor: '#0ea5e9', ordem: 1, permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.VICE] }]
      : []),
    { nome: SYSTEM_ROLES.ADMIN, cor: '#2563eb', ordem: 2, permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN] },
    { nome: SYSTEM_ROLES.MEMBER, cor: '#6b7280', ordem: 3, permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER] },
  ].filter((r) => !roleMap[r.nome])

  if (toCreate.length > 0) {
    const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      return Promise.all(
        toCreate.map((r) =>
          tx.role.create({ data: { tenantId, ...r, isSystem: true } })
        )
      )
    })

    const createdOwner = created.find((r: (typeof created)[number]) => r.nome === SYSTEM_ROLES.OWNER)
    ownerRole = createdOwner ?? roleMap[SYSTEM_ROLES.OWNER]
    rolesCriadas = created.map((r: (typeof created)[number]) => r.nome)
  }

  // Garante deptos canônicos mesmo em tenant legado sem bootstrap completo
  await upsertDepartamentosCanonicos(db, tenantId)

  if (!ownerRole) return { message: 'Erro ao criar cargo owner.' }

  // Evita duplicata de userRole
  const jaOwner = await db.userRole.findFirst({
    where: { userId: session.user.id, tenantId, roleId: ownerRole.id },
  })

  if (!jaOwner) {
    await db.userRole.create({
      data: { tenantId, userId: session.user.id, roleId: ownerRole.id },
    })

    await db.auditLog.create({
      data: {
        tenantId,
        atorId: session.user.id,
        acao: 'OWNER_ATRIBUIDO',
        entidade: 'User',
        entidadeId: session.user.id,
        detalhes: { roleId: ownerRole.id, rolesCriadas },
      },
    })
  }

  return { tenantId, tenantSlug: tenant.slug }
}

/** @deprecated use atribuirOwnerAction */
export async function atribuirOwner(tenantId: string): Promise<SetupState> {
  const formData = new FormData()
  formData.set('tenantId', tenantId)
  const result = await atribuirOwnerAction({}, formData)
  if (result.tenantId) {
    redirect(`/super-admin/setup/sucesso?tenant=${result.tenantId}&slug=${result.tenantSlug}`)
  }
  return result
}
