'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '@torcida/types'

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
          nome: SYSTEM_ROLES.ADMIN,
          cor: '#2563eb',
          ordem: 1,
          permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN],
          isSystem: true,
        },
      }),
      tx.role.create({
        data: {
          tenantId: t.id,
          nome: SYSTEM_ROLES.MEMBER,
          cor: '#6b7280',
          ordem: 2,
          permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER],
          isSystem: true,
        },
      }),
    ])

    // Atribui owner ao usuário logado
    if (session.user.id) {
      await tx.userRole.create({
        data: {
          tenantId: t.id,
          userId: session.user.id,
          roleId: ownerRole.id,
        },
      })
    }

    return t
  })

  redirect(`/super-admin/setup/sucesso?tenant=${tenant.id}&slug=${tenant.slug}`)
}

export async function atribuirOwner(tenantId: string): Promise<SetupState> {
  const session = await auth()

  if (!session?.user?.id || !session?.user?.email || !superAdminEmails.includes(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: { roles: { where: { nome: 'owner', isSystem: true } } },
  })

  if (!tenant) return { message: 'Tenant não encontrado.' }

  let ownerRole = tenant.roles[0]

  // Se não existe role owner ainda, cria as 3 roles de sistema
  if (!ownerRole) {
    const roles = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const [o] = await Promise.all([
        tx.role.create({
          data: { tenantId, nome: SYSTEM_ROLES.OWNER, cor: '#7c3aed', ordem: 0, permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER], isSystem: true },
        }),
        tx.role.create({
          data: {
            tenantId, nome: SYSTEM_ROLES.ADMIN, cor: '#2563eb', ordem: 1,
            permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMIN],
            isSystem: true,
          },
        }),
        tx.role.create({
          data: { tenantId, nome: SYSTEM_ROLES.MEMBER, cor: '#6b7280', ordem: 2, permissions: SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MEMBER], isSystem: true },
        }),
      ])
      return { ownerRole: o }
    })
    ownerRole = roles.ownerRole
  }

  // Verifica se já é owner
  const jaOwner = await db.userRole.findFirst({
    where: { userId: session.user.id, tenantId, roleId: ownerRole.id },
  })

  if (jaOwner) {
    redirect(`/super-admin/setup/sucesso?tenant=${tenantId}&slug=${tenant.slug}`)
  }

  await db.userRole.create({
    data: { tenantId, userId: session.user.id, roleId: ownerRole.id },
  })

  redirect(`/super-admin/setup/sucesso?tenant=${tenantId}&slug=${tenant.slug}`)
}
