'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { nicknameSchema } from '@torcida/types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type DefinirApelidoState = {
  errors?: Record<string, string[]>
  message?: string
  /** Cliente navega (redirect() do servidor em SA pode perder o contexto de sessão). */
  redirectTo?: string
}

const schema = z.object({
  nickname: nicknameSchema,
})

/**
 * Define o @nickname (obrigatório). Usado no pós-login OAuth e contas antigas.
 */
export async function definirApelido(
  _prev: DefinirApelidoState,
  formData: FormData,
): Promise<DefinirApelidoState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { redirectTo: '/entrar' }
  }

  const parsed = schema.safeParse({ nickname: formData.get('nickname') })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nickname } = parsed.data

  const ocupado: { id: string } | null = await db.user.findFirst({
    where: { nickname, NOT: { id: session.user.id } },
    select: { id: true },
  })
  if (ocupado) {
    return { errors: { nickname: ['Este apelido já está em uso. Escolha outro.'] } }
  }

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: { nickname },
    })
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
    if (code === 'P2002') {
      return { errors: { nickname: ['Este apelido já está em uso. Escolha outro.'] } }
    }
    throw err
  }

  revalidatePath('/portal')
  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
  // Mesmo padrão do login: o cliente navega para preservar o cookie de sessão.
  return { redirectTo: '/auth/contexto' }
}
