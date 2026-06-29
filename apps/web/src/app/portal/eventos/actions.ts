'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { revalidatePath } from 'next/cache'

export async function responderRsvp(eventoId: string, status: 'CONFIRMADO' | 'RECUSADO') {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado')
  if (!tenant) throw new Error('Tenant não encontrado')

  const evento = await db.evento.findUnique({
    where: { id: eventoId },
    select: { tenantId: true, data: true },
  })

  if (!evento || evento.tenantId !== tenant.id) throw new Error('Evento não encontrado')
  if (new Date(evento.data) < new Date()) throw new Error('Evento já encerrado')

  await db.eventoRsvp.upsert({
    where: { eventoId_userId: { eventoId, userId: session.user.id } },
    update: { status },
    create: { eventoId, userId: session.user.id, status },
  })

  revalidatePath(`/portal/eventos/${eventoId}`)
  revalidatePath('/portal/eventos')
  revalidatePath('/portal')
}
