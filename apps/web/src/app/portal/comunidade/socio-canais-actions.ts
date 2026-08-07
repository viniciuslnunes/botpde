'use server'

import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import {
  abrirCanalSocio,
  carregarCanaisAbertosSocio,
  fecharCanalSocio,
  isCanalBarraVisitavel,
  lerIdsCanaisAbertosSocio,
  podarIdsOrfaosSocio,
  reordenarCanaisSocio,
} from '@/lib/socio-canais-abertos'
import {
  getCanalOficialDaSede,
  getCanalLeituraDireta,
  getCanalPorId,
  podePublicarNoCanal,
  resolverChromeCanalMural,
  resolverSlugPortalAtivavelDoCanal,
  type CanalItem,
} from '@/lib/canais'
import { deveTrocarTenantAoAbrirCanal } from '@/lib/canais-shared'
import {
  resolveTenantMinhaTorcida,
  resolverContextoComunidade,
} from '@/lib/comunidade-contexto'
import {
  gravarMarcaCanalFoco,
  limparMarcaCanalFoco,
} from '@/lib/comunidade-canal-foco-cookie'
import { idsCanaisHierarquiaFixosNaBarra } from '@/lib/operador-canais-ordem'
import { abrirCanalOperador } from '@/lib/operador-canais-abertos'
import { isSuperAdminEmail, setTenantContextSlug } from '@/lib/tenant-context'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { calculateEffectivePermissions, formatNomeTorcida } from '@torcida/types'
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

  const superAdmin = isSuperAdminEmail(session.user.email)
  const [canal, permsRaw, ehSocio] = await Promise.all([
    superAdmin
      ? getCanalLeituraDireta(limpo, session.user.id)
      : getCanalPorId(limpo, tenant.id, session.user.id),
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
    podePublicar: !superAdmin && ehSocio && podePublicarGate,
    podeCompartilhar: !superAdmin && ehSocio,
    ...chrome,
  }
}

async function idsHierarquiaFixosDoViewer(
  userId: string,
  email: string | null | undefined,
): Promise<string[]> {
  const ctx = await resolverContextoComunidade(userId, email)
  if (!ctx) return []
  const torcidaReal = ctx.torcidaReal ?? (ctx.modo === 'torcida' ? ctx.tenant : null)
  const oficial = torcidaReal
    ? await getCanalOficialDaSede(torcidaReal.id, userId, {
        leituraOperador: isSuperAdminEmail(email),
      })
    : null
  const atualSlug = ctx.modo === 'torcida' ? ctx.tenant.slug : null
  return idsCanaisHierarquiaFixosNaBarra({
    canalIdTorcida: oficial?.id ?? null,
    canalIdUnidade: ctx.unidade?.canalId ?? null,
    superAdmin: isSuperAdminEmail(email),
    temEscopoUnidade: Boolean(ctx.escopos.unidade),
    slugUnidade: ctx.unidade?.tenantSlug ?? null,
    atualSlug,
  })
}

export type RegistrarCanalVisitadoResult = {
  trocouTenant: boolean
}

/**
 * Ativa o tenant do canal oficial quando há **portal próprio** (Sede ou
 * Caso B) e o viewer pode (SA ou sócio APROVADO). Caso A (PDE no tenant da
 * mãe) não troca sessão — só marca cosmético via cookie de foco.
 */
async function ativarTenantDoCanalOficialSePermitido(opts: {
  canalOficial: boolean
  canalId: string
  userId: string
  slugAtual: string
  superAdmin: boolean
}): Promise<boolean> {
  if (!opts.canalOficial) return false

  const slugAlvo = await resolverSlugPortalAtivavelDoCanal(opts.canalId)
  if (
    !deveTrocarTenantAoAbrirCanal({
      canalOficial: true,
      slugAlvo,
      slugAtual: opts.slugAtual,
    }) ||
    !slugAlvo
  ) {
    return false
  }

  if (opts.superAdmin) {
    const tenantAlvo: { slug: string } | null = await db.tenant.findFirst({
      where: { slug: slugAlvo, ativo: true, sintetico: false },
      select: { slug: true },
    })
    if (!tenantAlvo) return false
    await abrirCanalOperador(tenantAlvo.slug)
    await setTenantContextSlug(tenantAlvo.slug)
    await limparMarcaCanalFoco()
    return true
  }

  const vinculo: { id: string } | null = await db.saasMembro.findFirst({
    where: {
      userId: opts.userId,
      status: 'APROVADO',
      tipo: 'SOCIO',
      tenant: { slug: slugAlvo },
    },
    select: { id: true },
  })
  if (!vinculo) return false

  await setTenantContextSlug(slugAlvo)
  await limparMarcaCanalFoco()
  return true
}

/** Caso A: grava marca do canal para a topbar sobreviver ao sair do mural. */
async function persistirMarcaCanalOficialCasoA(canal: CanalItem): Promise<void> {
  if (!canal.canalOficial) {
    await limparMarcaCanalFoco()
    return
  }
  const slugPortal = await resolverSlugPortalAtivavelDoCanal(canal.id)
  if (slugPortal) {
    // Caso B / Sede: tenant ativo já carrega a marca.
    await limparMarcaCanalFoco()
    return
  }

  const tenantCor: { corPrimaria: string } | null = await db.tenant.findUnique({
    where: { id: canal.tenantId },
    select: { corPrimaria: true },
  })
  const nome = formatNomeTorcida(canal.nome?.trim() || canal.tenantNome || 'Canal')
  await gravarMarcaCanalFoco({
    canalId: canal.id,
    nome,
    corPrimaria: tenantCor?.corPrimaria?.trim() || '#111111',
    logoUrl: canal.avatarUrl,
  })
}

/**
 * Registra visita na barra 4+ (conversa id) — sócio, torcedor e super-admin.
 * Oficiais da hierarquia fixa (torcida/unidade do vínculo) não entram.
 * Canal oficial de outra unidade: ativa o tenant na sessão quando permitido.
 */
export async function registrarCanalVisitadoAction(
  canalId: string,
): Promise<RegistrarCanalVisitadoResult> {
  const session = await auth()
  if (!session?.user?.id) return { trocouTenant: false }

  const limpo = canalId.trim()
  if (!limpo) return { trocouTenant: false }
  if (!(await isCanalBarraVisitavel(limpo))) return { trocouTenant: false }

  const superAdmin = isSuperAdminEmail(session.user.email)
  let tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) return { trocouTenant: false }

  const canal = superAdmin
    ? await getCanalLeituraDireta(limpo, session.user.id)
    : await getCanalPorId(limpo, tenant.id, session.user.id)
  if (!canal) return { trocouTenant: false }

  const trocouTenant = await ativarTenantDoCanalOficialSePermitido({
    canalOficial: canal.canalOficial,
    canalId: canal.id,
    userId: session.user.id,
    slugAtual: tenant.slug,
    superAdmin,
  })

  if (!trocouTenant) {
    await persistirMarcaCanalOficialCasoA(canal)
  }

  if (trocouTenant) {
    const atualizado = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
    if (atualizado) tenant = atualizado
  }

  const fixos = await idsHierarquiaFixosDoViewer(session.user.id, session.user.email)
  if (fixos.includes(canal.id)) return { trocouTenant }

  await abrirCanalSocio(canal.id)

  const ids = await lerIdsCanaisAbertosSocio()
  const validos = await carregarCanaisAbertosSocio(
    ids,
    session.user.id,
    tenant.id,
    fixos,
    { leituraOperador: superAdmin },
  )
  await podarIdsOrfaosSocio(validos.map((c) => c.id))
  const { sincronizarBarraMovelCookie } = await import('@/lib/comunidade-barra-movel-cookie')
  const { lerSlugsCanaisAbertosOperador } = await import('@/lib/operador-canais-abertos')
  await sincronizarBarraMovelCookie({
    slugsOperador: await lerSlugsCanaisAbertosOperador(),
    idsTematicos: await lerIdsCanaisAbertosSocio(),
  })
  return { trocouTenant }
}

/**
 * @deprecated Prefer `registrarCanalVisitadoAction`.
 */
export async function registrarCanalTematicoAbertoAction(canalId: string): Promise<void> {
  await registrarCanalVisitadoAction(canalId)
}

/**
 * Remove canal visitado da barra 4+. Se era o ativo, volta à listagem.
 */
export async function fecharCanalTematicoAbertoAction(
  _prev: FecharCanalTematicoState,
  formData: FormData,
): Promise<FecharCanalTematicoState> {
  const session = await auth()
  if (!session?.user?.id) return { message: 'Sessão expirada.' }

  const canalId = String(formData.get('canalId') ?? '').trim()
  const canalAtivoId = String(formData.get('canalAtivoId') ?? '').trim() || null
  if (!canalId) return { message: 'Canal inválido.' }

  await fecharCanalSocio(canalId)
  const { sincronizarBarraMovelCookie } = await import('@/lib/comunidade-barra-movel-cookie')
  const { lerSlugsCanaisAbertosOperador } = await import('@/lib/operador-canais-abertos')
  const { lerIdsCanaisAbertosSocio } = await import('@/lib/socio-canais-abertos')
  await sincronizarBarraMovelCookie({
    slugsOperador: await lerSlugsCanaisAbertosOperador(),
    idsTematicos: await lerIdsCanaisAbertosSocio(),
  })

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
  if (!Array.isArray(ordem) || ordem.length === 0) {
    return { ok: false, message: 'Ordem inválida.' }
  }
  const limpos = ordem.map((s) => String(s).trim()).filter(Boolean)
  const next = await reordenarCanaisSocio(limpos)
  if (!next) return { ok: false, message: 'Ordem inválida.' }
  return { ok: true }
}

/**
 * Ordem unificada da zona móvel (4+): misture `o:slug` e `t:conversaId`.
 * Fixos (Nacional / torcida / unidade) ficam fora — só o que é arrastável.
 */
export async function reordenarBarraMovelAction(
  ordem: string[],
  ctx: { slugsOperador: string[]; idsTematicos: string[] },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, message: 'Sessão expirada.' }
  if (!Array.isArray(ordem) || ordem.length === 0) {
    return { ok: false, message: 'Ordem inválida.' }
  }
  const limpos = ordem.map((s) => String(s).trim()).filter(Boolean)
  const { reordenarBarraMovelPersistir } = await import('@/lib/comunidade-barra-movel-cookie')
  const next = await reordenarBarraMovelPersistir(limpos, {
    slugsOperador: ctx.slugsOperador.map((s) => s.trim()).filter(Boolean),
    idsTematicos: ctx.idsTematicos.map((s) => s.trim()).filter(Boolean),
  })
  if (!next) return { ok: false, message: 'Ordem inválida.' }
  return { ok: true }
}
