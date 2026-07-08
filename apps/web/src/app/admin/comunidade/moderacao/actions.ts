'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/authz'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'

const denunciaIdSchema = z.object({ denunciaId: z.string().min(1) })

export async function resolverDenuncia(denunciaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MODERATE)
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denuncia.findFirst({
    where: { id: parsed.data.denunciaId, tenantId: tenant.id, status: 'PENDENTE' },
    select: { id: true, postId: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await db.$transaction([
    db.denuncia.update({
      where: { id: denuncia.id },
      data: {
        status: 'RESOLVIDA',
        resolvidoPorId: session.user.id,
        resolvidoEm: new Date(),
      },
    }),
    db.post.update({
      where: { id: denuncia.postId },
      data: { oculto: true },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DENUNCIA_RESOLVIDA',
        entidade: 'Denuncia',
        entidadeId: denuncia.id,
        detalhes: { postOcultado: true },
      },
    }),
  ])

  revalidatePath('/admin/comunidade/moderacao')
  revalidatePath('/portal/comunidade')
}

export async function descartarDenuncia(denunciaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MODERATE)
  const parsed = denunciaIdSchema.safeParse({ denunciaId })
  if (!parsed.success) throw new Error('Denúncia inválida')

  const denuncia = await db.denuncia.findFirst({
    where: { id: parsed.data.denunciaId, tenantId: tenant.id, status: 'PENDENTE' },
    select: { id: true },
  })
  if (!denuncia) throw new Error('Denúncia não encontrada')

  await db.$transaction([
    db.denuncia.update({
      where: { id: denuncia.id },
      data: {
        status: 'DESCARTADA',
        resolvidoPorId: session.user.id,
        resolvidoEm: new Date(),
      },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DENUNCIA_DESCARTADA',
        entidade: 'Denuncia',
        entidadeId: denuncia.id,
      },
    }),
  ])

  revalidatePath('/admin/comunidade/moderacao')
}
