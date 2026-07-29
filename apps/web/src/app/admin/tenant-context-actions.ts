'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  isSuperAdminEmail,
  listarTorcidasParaSelecao,
  setTenantContextSlug,
} from '@/lib/tenant-context'
import { db } from '@torcida/db'
import { z } from 'zod'

const schema = z.object({
  slug: z.string().min(1),
  destino: z.enum(['admin', 'portal', 'super-admin']).optional().default('admin'),
})

export type SelecionarTorcidaState = {
  message?: string
}

export async function selecionarTorcidaAction(
  _prev: SelecionarTorcidaState,
  formData: FormData,
): Promise<SelecionarTorcidaState> {
  const session = await auth()

  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const parsed = schema.safeParse({
    slug: formData.get('slug'),
    destino: formData.get('destino') ?? 'admin',
  })

  if (!parsed.success) {
    return { message: 'Torcida inválida.' }
  }

  const { slug, destino } = parsed.data

  const tenant = await db.tenant.findFirst({
    where: { slug, ativo: true },
    select: { slug: true },
  })

  if (!tenant) {
    return { message: 'Torcida não encontrada ou inativa.' }
  }

  await setTenantContextSlug(slug)

  if (destino === 'portal') redirect('/portal/comunidade')
  if (destino === 'super-admin') redirect('/super-admin/torcidas')
  redirect('/admin')
}

const unidadeSchema = z.discriminatedUnion('modo', [
  z.object({
    modo: z.literal('sede'),
    sedeId: z.string().min(1),
    tenantSlug: z.string().min(1),
  }),
  z.object({
    modo: z.literal('tenant'),
    tenantSlug: z.string().min(1),
  }),
])

export type SelecionarUnidadeState = {
  message?: string
}

/**
 * Navega para uma unidade da worktree (super-admin):
 * - modo `tenant` (Caso B): troca `torcida_ctx` e abre `/admin`
 * - modo `sede` (Caso A): garante o tenant dono no cookie e abre `/admin/sedes/[id]`
 */
export async function selecionarUnidadeAction(
  _prev: SelecionarUnidadeState,
  formData: FormData,
): Promise<SelecionarUnidadeState> {
  const session = await auth()

  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const modoRaw = String(formData.get('modo') ?? '')
  const parsed = unidadeSchema.safeParse({
    modo: modoRaw,
    sedeId: formData.get('sedeId') || undefined,
    tenantSlug: formData.get('tenantSlug') || undefined,
  })

  if (!parsed.success) {
    return { message: 'Unidade inválida.' }
  }

  const data = parsed.data

  const tenant = await db.tenant.findFirst({
    where: { slug: data.tenantSlug, ativo: true },
    select: { id: true, slug: true },
  })
  if (!tenant) {
    return { message: 'Torcida da unidade não encontrada ou inativa.' }
  }

  if (data.modo === 'tenant') {
    await setTenantContextSlug(tenant.slug)
    redirect('/admin')
  }

  const sede: { id: string; tenantId: string | null } | null = await db.sede.findUnique({
    where: { id: data.sedeId },
    select: { id: true, tenantId: true },
  })
  if (!sede || sede.tenantId !== tenant.id) {
    return { message: 'Unidade não encontrada nesta torcida.' }
  }

  await setTenantContextSlug(tenant.slug)
  redirect(`/admin/sedes/${sede.id}`)
}

export async function getTorcidasParaSelecaoAction() {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return []
  }
  return listarTorcidasParaSelecao()
}
