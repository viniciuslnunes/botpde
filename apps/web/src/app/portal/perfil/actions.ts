'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
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
    idade: formData.get('idade') as string | undefined,
    telefone: formData.get('telefone') as string | undefined,
    cidade: formData.get('cidade') as string | undefined,
    discordTag: formData.get('discordTag') as string | undefined,
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nome, idade, telefone, cidade, discordTag } = parsed.data

  // Atualiza nome no registro do usuário
  await db.user.update({
    where: { id: session.user.id },
    data: { nome },
  })

  // Atualiza SaasMembro se existir no tenant atual
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

  revalidatePath('/portal/perfil')
  revalidatePath('/portal')
  return { success: true }
}
