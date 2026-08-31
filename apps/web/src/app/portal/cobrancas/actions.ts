'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getActiveTenant } from '@/lib/tenant'
import { carregarTenantCarteirinha } from '@/lib/associacao-escopo-server'
import { baixarCobrancaComoPaga } from '@/lib/cobrancas'
import { assinarWebhookMock, getPixProvider, verificarWebhookMock } from '@/lib/pix-gateway'

export type PortalCobrancaState = {
  ok?: boolean
  error?: string
}

export async function confirmarPixMock(cobrancaId: string): Promise<PortalCobrancaState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Não autorizado' }

  const ativo = await getActiveTenant(session.user.id, session.user.email)
  if (!ativo) return { error: 'Torcida não encontrada' }
  const tenant = await carregarTenantCarteirinha(ativo, session.user.id)

  if (getPixProvider() !== 'mock') {
    return { error: 'Confirmação manual só disponível no modo mock' }
  }

  type Row = { id: string; userId: string; status: string }
  const cob: Row | null = await db.cobrancaAssociacao.findFirst({
    where: { id: cobrancaId, tenantId: tenant.id, userId: session.user.id },
    select: { id: true, userId: true, status: true },
  })
  if (!cob) return { error: 'Cobrança não encontrada' }
  if (cob.status === 'PAGA') return { ok: true }
  if (cob.status === 'CANCELADA') return { error: 'Cobrança cancelada' }

  const signature = assinarWebhookMock(cob.id)
  if (!verificarWebhookMock(cob.id, signature)) return { error: 'Assinatura inválida' }

  const result = await baixarCobrancaComoPaga({
    tenantId: tenant.id,
    cobrancaId: cob.id,
    atorId: session.user.id,
    metodo: 'PIX',
  })
  if (!result.ok) return { error: result.error }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COBRANCA_PIX_CONFIRMADA_MOCK',
      entidade: 'CobrancaAssociacao',
      entidadeId: cob.id,
    },
  })

  revalidatePath('/portal/carteirinha')
  revalidatePath('/portal/cobrancas')
  revalidatePath(`/portal/cobrancas/${cob.id}`)
  return { ok: true }
}
