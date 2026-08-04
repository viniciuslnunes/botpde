'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  abrirCanalSocio,
  fecharCanalSocio,
  isCanalTematicoAtivo,
  lerIdsCanaisAbertosSocio,
  podarIdsOrfaosSocio,
  reordenarCanaisSocio,
} from '@/lib/socio-canais-abertos'
import { getCanalPorId } from '@/lib/canais'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { isSuperAdminEmail } from '@/lib/tenant-context'

export type FecharCanalTematicoState = {
  message?: string
}

/**
 * Registra visita a canal temático na barra do sócio (client mount / navegação).
 * Super-admin em modo operador não grava aqui — usa a barra de tenants.
 */
export async function registrarCanalTematicoAbertoAction(canalId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  if (isSuperAdminEmail(session.user.email)) return

  const limpo = canalId.trim()
  if (!limpo) return
  if (!(await isCanalTematicoAtivo(limpo))) return

  const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) return
  const canal = await getCanalPorId(limpo, tenant.id, session.user.id)
  if (!canal || canal.canalOficial) return

  await abrirCanalSocio(canal.id)

  // Limpa órfãos / oficiais do cookie (só em Server Action).
  const ids = await lerIdsCanaisAbertosSocio()
  const validos: string[] = []
  for (const cid of ids) {
    const c = await getCanalPorId(cid, tenant.id, session.user.id)
    if (c && !c.canalOficial) validos.push(c.id)
  }
  await podarIdsOrfaosSocio(validos)
}

/**
 * Remove temático da barra. Se era o ativo (`canalAtivoId`), volta à listagem.
 */
export async function fecharCanalTematicoAbertoAction(
  _prev: FecharCanalTematicoState,
  formData: FormData,
): Promise<FecharCanalTematicoState> {
  const session = await auth()
  if (!session?.user?.id) return { message: 'Sessão expirada.' }
  if (isSuperAdminEmail(session.user.email)) return { message: 'Acesso negado.' }

  const canalId = String(formData.get('canalId') ?? '').trim()
  const canalAtivoId = String(formData.get('canalAtivoId') ?? '').trim() || null
  if (!canalId) return { message: 'Canal inválido.' }

  await fecharCanalSocio(canalId)

  if (canalAtivoId && canalAtivoId === canalId) {
    redirect('/portal/comunidade/canais')
  }
  return {}
}

export async function reordenarCanaisTematicosAction(
  ordem: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, message: 'Sessão expirada.' }
  if (isSuperAdminEmail(session.user.email)) {
    return { ok: false, message: 'Acesso negado.' }
  }
  if (!Array.isArray(ordem) || ordem.length === 0) {
    return { ok: false, message: 'Ordem inválida.' }
  }
  const limpos = ordem.map((s) => String(s).trim()).filter(Boolean)
  const next = await reordenarCanaisSocio(limpos)
  if (!next) return { ok: false, message: 'Ordem inválida.' }
  return { ok: true }
}
