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

export async function getTorcidasParaSelecaoAction() {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return []
  }
  return listarTorcidasParaSelecao()
}
