'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { setTenantContextSlug, isSuperAdminEmail } from '@/lib/tenant-context'
import {
  abrirCanalOperador,
  fecharCanalOperador,
  reordenarCanaisOperador,
} from '@/lib/operador-canais-abertos'

const schema = z.object({
  slug: z.string().min(1),
  destino: z.enum(['admin', 'portal']).optional().default('portal'),
  escopo: z.enum(['nacional', 'torcida', 'unidade']).optional(),
})

export type TrocarTorcidaState = {
  message?: string
}

/**
 * Troca a torcida ativa do usuário durante a sessão atual.
 *
 * - Sócio com vínculo APROVADO em mais de uma torcida (ex.: liderança Caso B).
 * - Super-admin (modo operador): troca sem vínculo — mesma regra de
 *   `selecionarTorcidaAction` no admin — e registra o canal na barra aberta.
 *
 * Também usada pelas abas-escudo da Comunidade (Sede ↔ unidade Caso B): o
 * `escopo` opcional monta o redirect para `/portal/comunidade?escopo=…`.
 */
export async function trocarTorcidaAction(
  _prev: TrocarTorcidaState,
  formData: FormData,
): Promise<TrocarTorcidaState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { message: 'Sessão expirada. Entre novamente.' }
  }

  const parsed = schema.safeParse({
    slug: formData.get('slug'),
    destino: formData.get('destino') ?? 'portal',
    escopo: formData.get('escopo') || undefined,
  })

  if (!parsed.success) {
    return { message: 'Torcida inválida.' }
  }

  const { slug, destino, escopo } = parsed.data
  const superAdmin = isSuperAdminEmail(session.user.email)

  if (!superAdmin) {
    const vinculo: { id: string } | null = await db.saasMembro.findFirst({
      where: {
        userId: session.user.id,
        status: 'APROVADO',
        tipo: 'SOCIO',
        tenant: { slug },
      },
      select: { id: true },
    })

    if (!vinculo) {
      return { message: 'Você não tem vínculo aprovado com essa torcida.' }
    }
  } else {
    const tenant = await db.tenant.findFirst({
      where: { slug, ativo: true, sintetico: false },
      select: { slug: true },
    })
    if (!tenant) {
      return { message: 'Torcida não encontrada ou inativa.' }
    }
    await abrirCanalOperador(slug)
  }

  await setTenantContextSlug(slug)

  if (destino === 'admin') redirect('/admin')
  if (escopo && escopo !== 'nacional') {
    redirect(`/portal/comunidade?escopo=${escopo}`)
  }
  redirect('/portal/comunidade')
}

export type FecharCanalOperadorState = {
  message?: string
}

/**
 * Remove um canal da barra aberta do super-admin. Se o fechado era o ativo,
 * muda o cookie para outro aberto (ou a Sede do fechado) e redireciona.
 */
export async function fecharCanalOperadorAction(
  _prev: FecharCanalOperadorState,
  formData: FormData,
): Promise<FecharCanalOperadorState> {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const slug = String(formData.get('slug') ?? '').trim()
  const atualSlug = String(formData.get('atualSlug') ?? '').trim() || null
  const fallbackSlug = String(formData.get('fallbackSlug') ?? '').trim() || null
  if (!slug) return { message: 'Canal inválido.' }

  const restantes = await fecharCanalOperador(slug)

  if (atualSlug && atualSlug === slug) {
    const proximo = restantes[0] ?? fallbackSlug
    if (proximo) {
      await setTenantContextSlug(proximo)
      redirect('/portal/comunidade')
    }
    redirect('/portal/comunidade?escopo=nacional')
  }

  redirect('/portal/comunidade')
}

/** Garante que o tenant atual entre na barra (chamado ao montar o portal). */
export async function registrarCanalAbertoAction(slug: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) return
  const limpo = slug.trim()
  if (!limpo) return
  const tenant = await db.tenant.findFirst({
    where: { slug: limpo, ativo: true, sintetico: false },
    select: { slug: true },
  })
  if (!tenant) return
  await abrirCanalOperador(tenant.slug)
}

/**
 * Persiste a ordem dos canais abertos (drag na barra).
 * `ordem` deve ser permutação exata dos slugs já abertos.
 */
export async function reordenarCanaisOperadorAction(
  ordem: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return { ok: false, message: 'Acesso negado.' }
  }
  if (!Array.isArray(ordem) || ordem.length === 0) {
    return { ok: false, message: 'Ordem inválida.' }
  }
  const limpos = ordem.map((s) => String(s).trim()).filter(Boolean)
  const next = await reordenarCanaisOperador(limpos)
  if (!next) return { ok: false, message: 'Ordem inválida.' }
  return { ok: true }
}
