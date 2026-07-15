'use server'

import { auth } from '@/lib/auth'
import {
  db,
  bootstrapAcessoTenant,
  syncMembershipFromRoles,
} from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { invalidateTorcidasSelecaoCache } from '@/lib/tenant-context'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SYSTEM_ROLES, podeTerVice } from '@torcida/types'

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

  const tenant = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const t = await tx.tenant.create({
      data: { slug, nome, corPrimaria },
    })

    await bootstrapAcessoTenant(tx, t.id, { incluirVice: true })

    const ownerRole = await tx.role.findUnique({
      where: { tenantId_nome: { tenantId: t.id, nome: SYSTEM_ROLES.OWNER } },
    })
    if (!ownerRole) throw new Error('Falha ao criar cargo owner')

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

    if (session.user.id) {
      await tx.userRole.create({
        data: {
          tenantId: t.id,
          userId: session.user.id,
          roleId: ownerRole.id,
        },
      })
      await syncMembershipFromRoles(tx, { userId: session.user.id, tenantId: t.id })

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

  invalidateTorcidasSelecaoCache()
  redirect(`/super-admin/setup/sucesso?tenant=${tenant.id}&slug=${tenant.slug}`)
}

/**
 * Server Action compatível com useActionState + <form>.
 */
export async function atribuirOwnerAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const session = await auth()

  if (!session?.user?.id || !session?.user?.email || !superAdminEmails.includes(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const tenantId = formData.get('tenantId') as string
  if (!tenantId) return { message: 'Tenant não informado.' }

  const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) return { message: 'Tenant não encontrado.' }

  const sedeDoTenant: { tipo: string } | null = await db.sede.findFirst({
    where: { tenantId },
    select: { tipo: true },
  })
  const isSedePrincipal = podeTerVice(sedeDoTenant?.tipo ?? 'PONTO_ENCONTRO')

  await bootstrapAcessoTenant(db, tenantId, { incluirVice: isSedePrincipal })

  const ownerRole = await db.role.findUnique({
    where: { tenantId_nome: { tenantId, nome: SYSTEM_ROLES.OWNER } },
  })
  if (!ownerRole) return { message: 'Erro ao criar cargo owner.' }

  const jaOwner = await db.userRole.findFirst({
    where: { userId: session.user.id, tenantId, roleId: ownerRole.id },
  })

  if (!jaOwner) {
    await db.userRole.create({
      data: { tenantId, userId: session.user.id, roleId: ownerRole.id },
    })
    await syncMembershipFromRoles(db, { userId: session.user.id, tenantId })

    await db.auditLog.create({
      data: {
        tenantId,
        atorId: session.user.id,
        acao: 'OWNER_ATRIBUIDO',
        entidade: 'User',
        entidadeId: session.user.id,
        detalhes: { roleId: ownerRole.id },
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
