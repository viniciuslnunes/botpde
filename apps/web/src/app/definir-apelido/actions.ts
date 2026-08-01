'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { nicknameSchema } from '@torcida/types'
import { checarNicknameDisponivel } from '@/lib/nickname-disponivel'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { tagNomeUsuario } from '@/lib/avatar-cache'
import { destinoInternoSeguro } from '@/lib/callback-url'
import { lerSlugConviteDoCookie } from '@/lib/convite-cookie-server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'

export type DefinirApelidoState = {
  errors?: Record<string, string[]>
  message?: string
  /** Cliente navega (redirect() do servidor em SA pode perder o contexto de sessão). */
  redirectTo?: string
}

const schema = z.object({
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  email: z.string().email('E-mail inválido'),
  nickname: nicknameSchema,
})

/**
 * Completa nome + e-mail + @nickname. Pós-login OAuth e contas antigas.
 * Espelha os campos do cadastro manual (exceto senha — OAuth não tem).
 */
export async function definirApelido(
  _prev: DefinirApelidoState,
  formData: FormData,
): Promise<DefinirApelidoState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { redirectTo: '/entrar' }
  }

  const parsed = schema.safeParse({
    nome: formData.get('nome'),
    email: formData.get('email'),
    nickname: formData.get('nickname'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nome, nickname } = parsed.data
  const email = parsed.data.email.trim().toLowerCase()

  const nickCheck = await checarNicknameDisponivel(nickname, session.user.id)
  if (!nickCheck.ok) {
    return { errors: { nickname: [nickCheck.motivo] } }
  }
  if (!nickCheck.disponivel) {
    return { errors: { nickname: [nickCheck.motivo] } }
  }

  const emailEmUso: { id: string } | null = await db.user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      NOT: { id: session.user.id },
    },
    select: { id: true },
  })
  if (emailEmUso) {
    return {
      errors: {
        email: ['Este e-mail já está em outra conta. Entre com essa conta ou use outro e-mail.'],
      },
    }
  }

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: { nome: nome.trim(), email, nickname },
    })
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
    if (code === 'P2002') {
      return {
        message: 'E-mail ou apelido já cadastrado. Escolha outro.',
      }
    }
    throw err
  }

  revalidateTag(tagNomeUsuario(session.user.id), 'max')
  revalidatePath('/portal')
  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
  // Mesmo padrão do login: o cliente navega para preservar o cookie de sessão.
  // Convite: form `callbackUrl` → cookie do proxy → fallback pós-login.
  const destinoForm = destinoInternoSeguro(formData.get('callbackUrl'))
  const slugConvite = destinoForm ? null : await lerSlugConviteDoCookie()
  const destinoConvite = slugConvite ? `/convite/${slugConvite}` : null

  return {
    redirectTo:
      destinoForm ??
      destinoConvite ??
      (isSuperAdminEmail(session.user.email) ? '/super-admin/torcidas' : '/auth/contexto'),
  }
}
