'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { nicknameSchema } from '@torcida/types'
import { checarNicknameDisponivel } from '@/lib/nickname-disponivel'
import { isSuperAdminEmail } from '@/lib/tenant-context'
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

  const nickCheck = await checarNicknameDisponivel(nickname, session.user.id)
  if (!nickCheck.ok) {
    return { errors: { nickname: [nickCheck.motivo] } }
  }
  if (!nickCheck.disponivel) {
    return { errors: { nickname: [nickCheck.motivo] } }
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
  return {
    redirectTo: isSuperAdminEmail(session.user.email)
      ? '/super-admin/torcidas'
      : '/auth/contexto',
  }
}
