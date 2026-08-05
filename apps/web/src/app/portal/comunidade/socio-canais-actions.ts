'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  abrirCanalSocio,
  carregarCanaisAbertosSocio,
  fecharCanalSocio,
  isCanalTematicoAtivo,
  lerIdsCanaisAbertosSocio,
  podarIdsOrfaosSocio,
  reordenarCanaisSocio,
} from '@/lib/socio-canais-abertos'
import {
  getCanalPorId,
  podePublicarNoCanal,
  resolverChromeCanalMural,
  type CanalItem,
} from '@/lib/canais'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { calculateEffectivePermissions } from '@torcida/types'
import { podeVerFeedSocios } from '@/lib/feed'
import { ExpectedError } from '@/lib/expected-error'

export type FecharCanalTematicoState = {
  message?: string
}

export type CanalMuralChrome = {
  canal: CanalItem
  podePublicar: boolean
  podeCompartilhar: boolean
  podeGerenciarAdmins: boolean
  podeGerenciarMembros: boolean
  podeGerenciarPedidos: boolean
  pedidosPendentesCount: number
  corPrimaria: string
}

/**
 * Chrome do mural para soft-switch (temático ↔ temático sem remount RSC).
 * Sem listas de membros/pedidos — lazy nos modais.
 */
export async function carregarCanalMuralAction(conversaId: string): Promise<CanalMuralChrome> {
  const session = await auth()
  if (!session?.user?.id) throw new ExpectedError('Sessão expirada.')

  const limpo = conversaId.trim()
  if (!limpo) throw new ExpectedError('Canal inválido.')

  const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) throw new ExpectedError('Torcida não encontrada.')

  const [canal, permsRaw, ehSocio] = await Promise.all([
    getCanalPorId(limpo, tenant.id, session.user.id),
    getUserPermissionsInTenant(session.user.id, tenant.id),
    podeVerFeedSocios(session.user.id, tenant.id),
  ])
  if (!canal) throw new ExpectedError('Canal não encontrado.')

  const permissoes = calculateEffectivePermissions(permsRaw.rolePermissions, permsRaw.overrides)
  const [podePublicarGate, chrome] = await Promise.all([
    podePublicarNoCanal(canal, tenant.id, permissoes),
    resolverChromeCanalMural(canal, tenant.id, permissoes),
  ])

  return {
    canal,
    podePublicar: ehSocio && podePublicarGate,
    podeCompartilhar: ehSocio,
    ...chrome,
  }
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

  // Limpa órfãos / oficiais do cookie (batch — sem N× getCanalPorId).
  const ids = await lerIdsCanaisAbertosSocio()
  const validos = await carregarCanaisAbertosSocio(ids, session.user.id, tenant.id)
  await podarIdsOrfaosSocio(validos.map((c) => c.id))
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
