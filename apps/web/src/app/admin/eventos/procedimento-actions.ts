'use server'

import { db } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  CARAVANA_PROCEDIMENTO_CATALOGO,
  PERMISSIONS,
  toggleCaravanaProcedimento,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'

const ToggleSchema = z.object({
  eventoId: z.string().uuid(),
  itemId: z.string().min(1).max(64),
  done: z.enum(['true', 'false']),
})

export type ProcedimentoEventoState = { ok?: boolean; message?: string }

export async function toggleProcedimentoCaravana(
  _prev: ProcedimentoEventoState,
  formData: FormData,
): Promise<ProcedimentoEventoState> {
  const parsed = ToggleSchema.safeParse({
    eventoId: formData.get('eventoId'),
    itemId: formData.get('itemId'),
    done: formData.get('done'),
  })
  if (!parsed.success) return { message: 'Dados inválidos' }

  const { session, tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)
  const validIds = new Set(CARAVANA_PROCEDIMENTO_CATALOGO.map((i) => i.id))
  if (!validIds.has(parsed.data.itemId)) return { message: 'Item inválido' }

  const evento: { id: string; tipo: string; meta: unknown } | null = await db.evento.findFirst({
    where: { id: parsed.data.eventoId, tenantId: tenant.id, tipo: 'CARAVANA' },
    select: { id: true, tipo: true, meta: true },
  })
  if (!evento) return { message: 'Caravana não encontrada' }

  const nextMeta = toggleCaravanaProcedimento(
    evento.meta,
    parsed.data.itemId,
    parsed.data.done === 'true',
  )

  await db.$transaction([
    db.evento.update({
      where: { id: evento.id },
      data: { meta: nextMeta },
    }),
    db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'EVENTO_PROCEDIMENTO_TOGGLE',
        entidade: 'Evento',
        entidadeId: evento.id,
        detalhes: { itemId: parsed.data.itemId, done: parsed.data.done === 'true' },
      },
    }),
  ])

  invalidateAdminDirecao(tenant.id)
  revalidatePath(`/admin/eventos/${evento.id}`)
  revalidatePath('/admin/caravanas')
  return { ok: true }
}
