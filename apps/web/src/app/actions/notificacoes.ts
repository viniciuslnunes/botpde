'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { TipoNotificacao } from '@torcida/db'
import { auth } from '@/lib/auth'
import { resolveTenantIdPortalComunidade } from '@/lib/comunidade-contexto'
import { getTenantFromHost } from '@/lib/tenant'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'
import { emitNotificacaoPing } from '@/lib/notificacoes-bus'

/**
 * Marca lida(s) só invalida as rotas do lado afetado: admin quando `tipos`
 * é exatamente `TIPOS_NOTIFICACAO_ADMIN` (chamada por
 * `marcarTodasNotificacoesAdminLidas`), ambos os lados quando `tipos` é
 * `undefined` (marcar todas sem filtro pode tocar admin e portal).
 *
 * Portal usa `resolveTenantIdPortalComunidade` (mesmo resolver da inbox /
 * navbar). Admin usa `getTenantFromHost` (área operacional do host).
 */
async function marcarLidasDoUsuario(tipos?: TipoNotificacao[]): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const apenasAdmin = tipos === TIPOS_NOTIFICACAO_ADMIN
  const tenantId = apenasAdmin
    ? (await getTenantFromHost())?.id ?? null
    : await resolveTenantIdPortalComunidade(session.user.id, session.user.email)
  if (!tenantId) throw new Error('Tenant não encontrado')

  const { count } = await db.notificacao.updateMany({
    where: {
      tenantId,
      userId: session.user.id,
      lida: false,
      ...(tipos ? { tipo: { in: tipos } } : {}),
    },
    data: { lida: true },
  })

  if (count === 0) return

  emitNotificacaoPing(tenantId, session.user.id)

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
 * Marca notificação como lida. Escopo por `userId` (dono) — não por
 * `getTenantFromHost()`, que diverge da inbox do portal
 * (`resolveTenantIdPortalComunidade`: CN sintética / cookie / vínculo).
 * Sem isso o client zera o badge otimista e o refresh traz a não-lida de novo.
 */
export async function marcarNotificacaoLida(notificacaoId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const notificacao: { tipo: TipoNotificacao; tenantId: string } | null =
    await db.notificacao.findFirst({
      where: { id: notificacaoId, userId: session.user.id },
      select: { tipo: true, tenantId: true },
    })
  if (!notificacao) return

  await db.notificacao.updateMany({
    where: { id: notificacaoId, userId: session.user.id },
    data: { lida: true },
  })

  emitNotificacaoPing(notificacao.tenantId, session.user.id)

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
 * Mesmo padrão de ownership por `userId` de `marcarNotificacaoLida`.
 */
export async function marcarNotificacoesLidasPorIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autenticado')

  const notificacoes: Array<{ tipo: TipoNotificacao; tenantId: string }> =
    await db.notificacao.findMany({
      where: { id: { in: ids }, userId: session.user.id },
      select: { tipo: true, tenantId: true },
    })
  if (notificacoes.length === 0) return

  await db.notificacao.updateMany({
    where: { id: { in: ids }, userId: session.user.id },
    data: { lida: true },
  })

  const tenantIds = [...new Set(notificacoes.map((n) => n.tenantId))]
  for (const tenantId of tenantIds) {
    emitNotificacaoPing(tenantId, session.user.id)
  }

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

/** Marca todas as notificações do usuário no tenant do portal (safe como form action). */
export async function marcarTodasNotificacoesLidas(): Promise<void> {
  await marcarLidasDoUsuario()
}

/** Marca só alertas operacionais do admin. */
export async function marcarTodasNotificacoesAdminLidas(): Promise<void> {
  await marcarLidasDoUsuario(TIPOS_NOTIFICACAO_ADMIN)
}
