'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { TipoNotificacao } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'

/**
 * Marca lida(s) só invalida as rotas do lado afetado: admin quando `tipos`
 * é exatamente `TIPOS_NOTIFICACAO_ADMIN` (chamada por
 * `marcarTodasNotificacoesAdminLidas`), ambos os lados quando `tipos` é
 * `undefined` (marcar todas sem filtro pode tocar admin e portal).
 */
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

  const apenasAdmin = tipos === TIPOS_NOTIFICACAO_ADMIN
  if (apenasAdmin) {
    revalidatePath('/admin')
    revalidatePath('/admin/notificacoes')
    return
  }

  revalidatePath('/portal')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/comunidade/notificacoes')
  revalidatePath('/admin')
  revalidatePath('/admin/notificacoes')
}

/**
 * Marca notificação como lida. Qualquer usuário autenticado no tenant dono
 * da notificação (admin ou portal) — não exige COMMUNITY_POST. Invalida só
 * as rotas do lado (admin/portal) a que o tipo pertence, mais a central
 * compartilhada de notificações do portal.
 */
export async function marcarNotificacaoLida(notificacaoId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const tenant = await getTenantFromHost()
  if (!tenant) throw new Error('Tenant não encontrado')

  const notificacao: { tipo: TipoNotificacao } | null = await db.notificacao.findFirst({
    where: { id: notificacaoId, tenantId: tenant.id, userId: session.user.id },
    select: { tipo: true },
  })
  if (!notificacao) return

  await db.notificacao.updateMany({
    where: { id: notificacaoId, tenantId: tenant.id, userId: session.user.id },
    data: { lida: true },
  })

  revalidatePath('/portal/comunidade/notificacoes')
  if (TIPOS_NOTIFICACAO_ADMIN.includes(notificacao.tipo)) {
    revalidatePath('/admin')
    revalidatePath('/admin/notificacoes')
  } else {
    revalidatePath('/portal')
    revalidatePath('/portal/comunidade')
  }
}

/**
 * Marca um lote de notificações como lidas (por ids). Usado pelo
 * "marcar como lida ao visualizar" (sino/central) com delay no client.
 * Mesmo padrão de revalidação seletiva de `marcarNotificacaoLida`.
 */
export async function marcarNotificacoesLidasPorIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const tenant = await getTenantFromHost()
  if (!tenant) throw new Error('Tenant não encontrado')

  const notificacoes: Array<{ tipo: TipoNotificacao }> = await db.notificacao.findMany({
    where: { id: { in: ids }, tenantId: tenant.id, userId: session.user.id },
    select: { tipo: true },
  })
  if (notificacoes.length === 0) return

  await db.notificacao.updateMany({
    where: { id: { in: ids }, tenantId: tenant.id, userId: session.user.id },
    data: { lida: true },
  })

  revalidatePath('/portal/comunidade/notificacoes')
  const tipos = notificacoes.map((n) => n.tipo)
  if (tipos.some((tipo) => TIPOS_NOTIFICACAO_ADMIN.includes(tipo))) {
    revalidatePath('/admin')
    revalidatePath('/admin/notificacoes')
  }
  if (tipos.some((tipo) => !TIPOS_NOTIFICACAO_ADMIN.includes(tipo))) {
    revalidatePath('/portal')
    revalidatePath('/portal/comunidade')
  }
}

/** Marca todas as notificações do usuário no tenant (safe como form action). */
export async function marcarTodasNotificacoesLidas(): Promise<void> {
  await marcarLidasDoUsuario()
}

/** Marca só alertas operacionais do admin. */
export async function marcarTodasNotificacoesAdminLidas(): Promise<void> {
  await marcarLidasDoUsuario(TIPOS_NOTIFICACAO_ADMIN)
}
