'use server'

import { revalidatePath } from 'next/cache'
import { baixarCobrancaManual } from '@/app/admin/financeiro/cobrancas/actions'
import { sincronizarCobrancasVencidas } from '@/lib/cobrancas'
import { assertPermission } from '@/lib/authz'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'
import { PERMISSIONS } from '@torcida/types'
import { atualizarStatusPedido } from '@/app/admin/loja/actions'
import { aprovarMembro } from '@/app/admin/membros/actions'
import { registrarCheckIn } from '@/app/admin/eventos/actions'

/** Baixa rápida a partir da inbox da Direção financeira. */
export async function inboxBaixarCobranca(
  cobrancaId: string,
): Promise<{ ok?: true; error?: string }> {
  const r = await baixarCobrancaManual(cobrancaId)
  if (r.ok) {
    try {
      const { tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)
      invalidateAdminDirecao(tenant.id)
    } catch {
      /* já autenticou na baixa */
    }
  }
  revalidatePath('/admin/financeiro')
  return r.ok ? { ok: true } : { error: r.error ?? 'Não foi possível dar baixa' }
}

/** Confirma pedido pendente a partir da inbox da Loja. */
export async function inboxConfirmarPedido(
  pedidoId: string,
): Promise<{ ok?: true; error?: string }> {
  const fd = new FormData()
  fd.set('status', 'CONFIRMADO')
  const r = await atualizarStatusPedido(pedidoId, {}, fd)
  if (!r.error) {
    try {
      const { tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
      invalidateAdminDirecao(tenant.id)
    } catch {
      /* noop */
    }
  }
  revalidatePath('/admin/loja')
  revalidatePath('/admin/loja/pedidos')
  return r.error ? { error: r.error } : { ok: true }
}

/** Aprova o topo da fila a partir da prancheta da Diretoria. */
export async function inboxAprovarMembro(
  membroId: string,
): Promise<{ ok?: true; error?: string }> {
  const r = await aprovarMembro(membroId)
  try {
    const { tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)
    invalidateAdminDirecao(tenant.id)
  } catch {
    /* noop */
  }
  revalidatePath('/admin/diretoria')
  revalidatePath('/admin/membros')
  if (r && 'error' in r && r.error) return { error: r.error }
  return { ok: true }
}

/** Embarque / check-in a partir da inbox de Caravanas. */
export async function inboxCheckInRsvp(
  eventoId: string,
  userId: string,
  override = false,
): Promise<{ ok?: true; error?: string }> {
  try {
    const r = await registrarCheckIn(eventoId, userId, { override })
    revalidatePath('/admin/caravanas')
    revalidatePath(`/admin/eventos/${eventoId}`)
    if (!r.ok) return { error: r.error }
    try {
      const { tenant } = await assertPermission(PERMISSIONS.EVENTS_MANAGE)
      invalidateAdminDirecao(tenant.id)
    } catch {
      /* noop */
    }
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha no check-in' }
  }
}

/** Sync explícito de cobranças vencidas (nunca no GET). */
export async function inboxSincronizarCobrancasVencidas(): Promise<{
  ok?: true
  atualizadas?: number
  error?: string
}> {
  try {
    const { tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)
    const n = await sincronizarCobrancasVencidas(tenant.id)
    invalidateAdminDirecao(tenant.id)
    revalidatePath('/admin/financeiro')
    revalidatePath('/admin/financeiro/cobrancas')
    return { ok: true, atualizadas: n }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha ao sincronizar' }
  }
}
