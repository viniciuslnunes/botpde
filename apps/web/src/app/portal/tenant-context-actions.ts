'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { setTenantContextSlug } from '@/lib/tenant-context'

const schema = z.object({
  slug: z.string().min(1),
  destino: z.enum(['admin', 'portal']).optional().default('portal'),
})

export type TrocarTorcidaState = {
  message?: string
}

/**
 * Troca a torcida ativa do usuário durante a sessão atual — só para quem tem
 * vínculo de sócio APROVADO em mais de uma torcida (ex.: liderança que também
 * é owner de uma Subsede/PDE promovida). Diferente de `selecionarTorcidaAction`
 * (admin/tenant-context-actions.ts), que é exclusiva de super-admin e não
 * valida vínculo — aqui a lista nunca vem do client, sempre confirmada no banco.
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
  })

  if (!parsed.success) {
    return { message: 'Torcida inválida.' }
  }

  const { slug, destino } = parsed.data

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

  await setTenantContextSlug(slug)

  if (destino === 'admin') redirect('/admin')
  redirect('/portal/comunidade')
}
