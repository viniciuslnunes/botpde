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
import { ExpectedError } from '@/lib/expected-error'
import { invalidateTenantCache } from '@/lib/tenant'
import { notificarUsuariosComPermissao } from '@/lib/notificacoes'

export async function salvarDesignTenant(designRaw: unknown) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const parsed = TenantDesignSchema.safeParse(designRaw)
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Design inválido')
  }

  // Vitrine (`design.loja`) é editada só em `/admin/loja/vitrine` — não zerar
  // capa/banner ao salvar o estúdio de design.
  const atual = resolveTenantDesign(tenant.design, tenant.corPrimaria)
  const design = { ...parsed.data, loja: atual.loja }
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

  await notificarUsuariosComPermissao(PERMISSIONS.SETTINGS_MANAGE, {
    tenantId: tenant.id,
    tipo: 'DESIGN_ATUALIZADO',
    titulo: 'Identidade visual atualizada',
    corpo: 'As cores e a identidade da torcida foram alteradas.',
    link: '/admin/design',
    atorId: session.user.id,
    excetoUserId: session.user.id,
  })

  return { ok: true as const, design }
}

export async function restaurarDesignPadrao() {
  const { session, tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)

  const atual = resolveTenantDesign(tenant.design, tenant.corPrimaria)
  const design = {
    ...DEFAULT_TENANT_DESIGN,
    brand: { primary: '#7c3aed', secondary: null },
    loja: atual.loja,
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

  await notificarUsuariosComPermissao(PERMISSIONS.SETTINGS_MANAGE, {
    tenantId: tenant.id,
    tipo: 'DESIGN_ATUALIZADO',
    titulo: 'Identidade visual restaurada',
    corpo: 'O visual da torcida voltou ao padrão da plataforma.',
    link: '/admin/design',
    atorId: session.user.id,
    excetoUserId: session.user.id,
  })

  return { ok: true as const, design: resolveTenantDesign(design, design.brand.primary) }
}
