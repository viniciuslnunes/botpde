'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/authz'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'

const noticiaIdSchema = z.object({ noticiaId: z.string().min(1) })

async function validarNoticiaDoTenant(noticiaId: string, tenantAfiliacaoId: string | null) {
  if (!tenantAfiliacaoId) throw new Error('Tenant sem afiliação configurada')
  const noticia = await db.noticia.findFirst({
    where: { id: noticiaId, afiliacaoId: tenantAfiliacaoId },
    select: { id: true },
  })
  if (!noticia) throw new Error('Notícia não encontrada para a sua afiliação')
  return noticia
}

export async function aprovarNoticia(noticiaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.NEWS_CURATE)
  const parsed = noticiaIdSchema.safeParse({ noticiaId })
  if (!parsed.success) throw new Error('Notícia inválida')

  const noticia = await validarNoticiaDoTenant(parsed.data.noticiaId, tenant.afiliacaoId)

  await db.$transaction([
    db.noticia.update({
      where: { id: noticia.id },
      data: {
        status: 'APROVADA',
        publicadoEm: new Date(),
        curadoPorId: session.user.id,
      },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'NOTICIA_APROVADA',
        entidade: 'Noticia',
        entidadeId: noticia.id,
      },
    }),
  ])

  revalidatePath('/admin/comunidade/noticias')
  revalidatePath('/portal')
}

export async function rejeitarNoticia(noticiaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.NEWS_CURATE)
  const parsed = noticiaIdSchema.safeParse({ noticiaId })
  if (!parsed.success) throw new Error('Notícia inválida')

  const noticia = await validarNoticiaDoTenant(parsed.data.noticiaId, tenant.afiliacaoId)

  await db.$transaction([
    db.noticia.update({
      where: { id: noticia.id },
      data: {
        status: 'REJEITADA',
        publicadoEm: null,
        curadoPorId: session.user.id,
      },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'NOTICIA_REJEITADA',
        entidade: 'Noticia',
        entidadeId: noticia.id,
      },
    }),
  ])

  revalidatePath('/admin/comunidade/noticias')
}
