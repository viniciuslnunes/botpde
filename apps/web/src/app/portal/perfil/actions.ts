'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { nicknameSchema } from '@torcida/types'
import { checarNicknameDisponivel } from '@/lib/nickname-disponivel'
import { revalidatePath, revalidateTag } from 'next/cache'
import { tagNomeUsuario } from '@/lib/avatar-cache'
import { z } from 'zod'

const schema = z.object({
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  /** Obrigatório: adicionar (primeiro @) ou alterar o atual. */
  nickname: nicknameSchema,
  idade: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().min(10).max(120).optional()),
  telefone: z
    .string()
    .max(20)
    .optional()
    .transform((v) => v || undefined),
  cidade: z
    .string()
    .max(60)
    .optional()
    .transform((v) => v || undefined),
  discordTag: z
    .string()
    .max(50)
    .optional()
    .transform((v) => v || undefined),
})

export type PerfilState = {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
  /** Nome gravado — cliente sincroniza JWT / topbar sem re-login. */
  nome?: string
}

export async function salvarPerfil(
  _prev: PerfilState,
  formData: FormData,
): Promise<PerfilState> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id) {
    return { message: 'Não autenticado.' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    nickname: formData.get('nickname') as string | undefined,
    idade: formData.get('idade') as string | undefined,
    telefone: formData.get('telefone') as string | undefined,
    cidade: formData.get('cidade') as string | undefined,
    discordTag: formData.get('discordTag') as string | undefined,
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nome, nickname, idade, telefone, cidade, discordTag } = parsed.data

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
      data: { nome, nickname },
    })
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
    if (code === 'P2002') {
      return { errors: { nickname: ['Este apelido já está em uso. Escolha outro.'] } }
    }
    throw err
  }

  if (tenant) {
    const membro = await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
      select: { id: true },
    })

    if (membro) {
      await db.saasMembro.update({
        where: { id: membro.id },
        data: { nome, idade, telefone, cidade, discordTag },
      })
    }
  }

  revalidateTag(tagNomeUsuario(session.user.id), 'max')
  revalidatePath('/portal/perfil')
  revalidatePath(`/portal/comunidade/perfil/${session.user.id}`)
  revalidatePath('/portal')
  revalidatePath('/portal/comunidade')
  revalidatePath('/admin')
  return { success: true, nome }
}
