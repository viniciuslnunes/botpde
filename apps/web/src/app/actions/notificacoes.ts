'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { TipoNotificacao } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'

async function marcarLidasDoUsuario(tipos?: TipoNotificacao[]): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const tenant = await getTenantFromHost()
  if (!tenant) throw new Error('Tenant não encontrado')

  await db.notificacao.updateMany({
    where: {
      tenantId: tenant.id,
      userId: session.user.id,
      lida: false,
      ...(tipos ? { tipo: { in: tipos } } : {}),
    },
    data: { lida: true },
  })

  revalidatePath('/portal')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/comunidade/notificacoes')
  revalidatePath('/admin')
  revalidatePath('/admin/notificacoes')
}

/**
 * Marca notificação como lida. Qualquer usuário autenticado no tenant dono
 * da notificação (admin ou portal) — não exige COMMUNITY_POST.
 */
export async function marcarNotificacaoLida(notificacaoId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const tenant = await getTenantFromHost()
  if (!tenant) throw new Error('Tenant não encontrado')

  await db.notificacao.updateMany({
    where: { id: notificacaoId, tenantId: tenant.id, userId: session.user.id },
    data: { lida: true },
  })

  revalidatePath('/portal')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/comunidade/notificacoes')
  revalidatePath('/admin')
  revalidatePath('/admin/notificacoes')
}

/** Marca todas as notificações do usuário no tenant (safe como form action). */
export async function marcarTodasNotificacoesLidas(): Promise<void> {
  await marcarLidasDoUsuario()
}

/** Marca só alertas operacionais do admin. */
export async function marcarTodasNotificacoesAdminLidas(): Promise<void> {
  await marcarLidasDoUsuario(TIPOS_NOTIFICACAO_ADMIN)
}
