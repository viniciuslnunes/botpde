'use server'

import { revalidatePath } from 'next/cache'
import { db, type Prisma } from '@torcida/db'
import {
  DEFAULT_TENANT_DESIGN,
  PERMISSIONS,
  TenantDesignSchema,
  resolveTenantDesign,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { invalidateTenantCache } from '@/lib/tenant'

export async function salvarDesignTenant(designRaw: unknown) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const parsed = TenantDesignSchema.safeParse(designRaw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Design inválido')
  }

  const design = parsed.data
  const corPrimaria = design.brand.primary

  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      corPrimaria,
      design: design as unknown as Prisma.InputJsonValue,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_DESIGN_ATUALIZADO',
      detalhes: {
        primary: corPrimaria,
        secondary: design.brand.secondary,
        gridEnabled: design.grid.enabled,
        gridSize: design.grid.sizePx,
      },
    },
  })

  revalidatePath('/admin/design')
  revalidatePath('/admin')
  revalidatePath('/portal')
  invalidateTenantCache(tenant.slug)

  return { ok: true as const, design }
}

export async function restaurarDesignPadrao() {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const design = {
    ...DEFAULT_TENANT_DESIGN,
    brand: { primary: '#7c3aed', secondary: null },
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      corPrimaria: design.brand.primary,
      design: design as unknown as Prisma.InputJsonValue,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'TENANT_DESIGN_RESTAURADO',
      detalhes: { primary: design.brand.primary },
    },
  })

  revalidatePath('/admin/design')
  revalidatePath('/admin')
  revalidatePath('/portal')
  invalidateTenantCache(tenant.slug)

  return { ok: true as const, design: resolveTenantDesign(design, design.brand.primary) }
}
