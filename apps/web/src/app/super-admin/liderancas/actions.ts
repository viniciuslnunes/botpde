'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { ExpectedError } from '@/lib/expected-error'
import { removerLideranca, transferirLideranca, type AlvoLideranca } from '@/lib/lideranca'

/**
 * Operação de lideranças pela plataforma. O super-admin opera fora do RBAC por
 * tenant, então aqui não há `assertPermission` — o gate é a allowlist de
 * e-mail, igual ao resto de `/super-admin`. As regras de negócio (Caso A × B,
 * sucessor válido, auditoria, notificação) vivem em `lib/lideranca.ts`, as
 * mesmas que o presidente usa na aba Presidência do admin.
 */

const alvoSchema = z.object({
  caso: z.enum(['A', 'B']),
  tenantId: z.string().uuid('Torcida inválida'),
  sedeId: z.string().uuid().nullable().optional(),
})

const transferirSchema = alvoSchema.extend({
  /** E-mail é a identificação estável de quem ainda não tem vínculo aqui. */
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  motivo: z.string().trim().max(300).optional().nullable(),
})

export type LiderancaState = {
  success?: boolean
  message?: string
  errors?: Record<string, string[]>
}

async function assertSuperAdmin(): Promise<{ userId: string; nome: string | null }> {
  const session = await auth()
  if (!session?.user?.id || !isSuperAdminEmail(session.user.email)) {
    throw new ExpectedError('Acesso negado.')
  }
  return { userId: session.user.id, nome: session.user.name ?? null }
}

function montarAlvo(parsed: z.infer<typeof alvoSchema>): AlvoLideranca {
  if (parsed.caso === 'A') {
    if (!parsed.sedeId) throw new ExpectedError('Unidade inválida.')
    return { caso: 'A', tenantId: parsed.tenantId, sedeId: parsed.sedeId }
  }
  return { caso: 'B', tenantId: parsed.tenantId }
}

function revalidar(): void {
  revalidatePath('/super-admin/liderancas')
  revalidatePath('/super-admin/torcidas')
}

export async function transferirLiderancaSuperAdmin(
  _prev: LiderancaState,
  formData: FormData,
): Promise<LiderancaState> {
  try {
    const ator = await assertSuperAdmin()

    const parsed = transferirSchema.safeParse({
      caso: formData.get('caso'),
      tenantId: formData.get('tenantId'),
      sedeId: formData.get('sedeId') || null,
      email: formData.get('email'),
      motivo: formData.get('motivo') || null,
    })
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    const novo: { id: string } | null = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    })
    if (!novo) {
      return {
        errors: {
          email: ['Ninguém com este e-mail tem conta ainda. A pessoa precisa entrar uma vez antes.'],
        },
      }
    }

    const resultado = await transferirLideranca({
      alvo: montarAlvo(parsed.data),
      novoUserId: novo.id,
      atorId: ator.userId,
      atorNome: ator.nome,
      motivo: parsed.data.motivo ?? null,
      // A plataforma consegue dar presidência a um portal recém-promovido, que
      // ainda não tem quadro associativo — o presidente comum não.
      exigirMembroAprovado: false,
    })

    revalidar()
    return {
      success: true,
      message:
        resultado.caso === 'B'
          ? `Presidência transferida para ${parsed.data.email}.`
          : `Liderança da unidade transferida para ${parsed.data.email}.`,
    }
  } catch (error) {
    if (error instanceof ExpectedError) return { message: error.message }
    throw error
  }
}

export async function removerLiderancaSuperAdmin(input: {
  caso: 'A' | 'B'
  tenantId: string
  sedeId?: string | null
  motivo?: string | null
}): Promise<LiderancaState> {
  try {
    const ator = await assertSuperAdmin()

    const parsed = alvoSchema.safeParse(input)
    if (!parsed.success) return { message: 'Alvo inválido.' }

    const { removidos, caso } = await removerLideranca({
      alvo: montarAlvo(parsed.data),
      atorId: ator.userId,
      motivo: input.motivo ?? null,
    })

    revalidar()
    if (removidos.length === 0) {
      return { success: true, message: 'Esta unidade já estava sem liderança.' }
    }
    return {
      success: true,
      message:
        caso === 'B'
          ? 'Presidência removida. A torcida fica sem owner até nova atribuição.'
          : 'Liderança removida da unidade.',
    }
  } catch (error) {
    if (error instanceof ExpectedError) return { message: error.message }
    throw error
  }
}
