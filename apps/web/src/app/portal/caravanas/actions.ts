'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { garantirCobrancaVagaCaravana } from '@/lib/caravana-vaga'

const EventoIdSchema = z.string().uuid()

export type VagaActionState = { ok?: boolean; error?: string; cobrancaId?: string }

/**
 * Gera (ou reusa) cobrança AVULSA da vaga e redireciona para o pagamento.
 */
export async function solicitarCobrancaVagaCaravana(
  eventoIdRaw: string,
): Promise<VagaActionState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Não autorizado' }

  const tenant = await getTenantFromHost()
  if (!tenant) return { error: 'Não autorizado' }

  const eventoIdParsed = EventoIdSchema.safeParse(eventoIdRaw)
  if (!eventoIdParsed.success) return { error: 'Evento inválido' }
  const eventoId = eventoIdParsed.data

  const result = await garantirCobrancaVagaCaravana({
    tenantId: tenant.id,
    userId: session.user.id,
    eventoId,
    notificar: true,
  })
  if (!result.ok) return { error: result.error }

  revalidatePath(`/portal/caravanas/${eventoId}`)
  revalidatePath(`/portal/eventos/${eventoId}`)
  revalidatePath('/portal/cobrancas')
  revalidatePath('/portal/departamentos/caravanas')
  redirect(`/portal/cobrancas/${result.cobrancaId}`)
}
