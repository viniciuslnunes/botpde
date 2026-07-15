'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { nicknameSchema } from '@torcida/types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type DefinirApelidoState = {
  errors?: Record<string, string[]>
  message?: string
}

const schema = z.object({
  nickname: nicknameSchema,
})

/**
 * Define o @nickname (obrigatório). Usado no pós-login e permite alteração.
 */
export async function definirApelido(
  _prev: DefinirApelidoState,
  formData: FormData,
): Promise<DefinirApelidoState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { message: 'Não autenticado.' }
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
  redirect('/auth/contexto')
}
