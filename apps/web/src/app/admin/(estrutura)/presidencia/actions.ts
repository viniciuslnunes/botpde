'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { ExpectedError } from '@/lib/expected-error'
import { removerLideranca, transferirLideranca, type AlvoLideranca } from '@/lib/lideranca'

/**
 * Troca de gestão feita pela própria liderança, na aba Estrutura › Presidência.
 *
 * **Escopo:** a permissão `leadership:transfer` (exclusiva do owner) diz *se*
 * pode; o alvo é sempre resolvido a partir do tenant ativo — nunca do que o
 * cliente mandou. Presidente da Sede não alcança um portal de subsede
 * promovida (é outro tenant, com mandato próprio), e liderança de unidade não
 * alcança a Sede. A trava é esta função, não a UI.
 */

const schema = z.object({
  /** Vazio = a própria presidência do tenant (Caso B). */
  sedeId: z.string().uuid().nullable().optional(),
  novoUserId: z.string().uuid('Escolha quem assume'),
  motivo: z.string().trim().max(300).optional().nullable(),
})

export type PresidenciaState = {
  success?: boolean
  message?: string
  errors?: Record<string, string[]>
}

/**
 * Traduz `sedeId` do formulário em alvo válido **dentro do tenant ativo**.
 * Unidade de outro tenant, ou unidade que já tem portal próprio, é recusada.
 */
async function resolverAlvoNoTenant(
  tenantId: string,
  sedeId: string | null | undefined,
): Promise<AlvoLideranca> {
  if (!sedeId) return { caso: 'B', tenantId }

  const sede: { id: string; tenantId: string | null } | null = await db.sede.findUnique({
    where: { id: sedeId },
    select: { id: true, tenantId: true },
  })
  if (!sede || sede.tenantId !== tenantId) {
    throw new ExpectedError('Esta unidade não pertence à sua torcida.')
  }
  return { caso: 'A', tenantId, sedeId: sede.id }
}

function revalidar(): void {
  revalidatePath('/admin/presidencia')
  revalidatePath('/admin/sedes')
  revalidatePath('/admin/torcida')
  revalidatePath('/admin', 'layout')
}

export async function transferirPresidenciaAction(
  _prev: PresidenciaState,
  formData: FormData,
): Promise<PresidenciaState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.LEADERSHIP_TRANSFER)

    const parsed = schema.safeParse({
      sedeId: formData.get('sedeId') || null,
      novoUserId: formData.get('novoUserId'),
      motivo: formData.get('motivo') || null,
    })
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    if (parsed.data.novoUserId === session.user.id && !parsed.data.sedeId) {
      return { message: 'Você já é o presidente desta unidade.' }
    }

    const resultado = await transferirLideranca({
      alvo: await resolverAlvoNoTenant(tenant.id, parsed.data.sedeId),
      novoUserId: parsed.data.novoUserId,
      atorId: session.user.id,
      atorNome: session.user.name ?? null,
      motivo: parsed.data.motivo ?? null,
    })

    revalidar()
    return {
      success: true,
      message:
        resultado.caso === 'B'
          ? `${resultado.novo.nome ?? 'A pessoa escolhida'} é o novo presidente. Seu acesso continua como administrador.`
          : `${resultado.novo.nome ?? 'A pessoa escolhida'} assumiu a liderança da unidade.`,
    }
  } catch (error) {
    if (error instanceof ExpectedError) return { message: error.message }
    if (error instanceof Error && error.message === 'Sem permissão') {
      return { message: 'Só o presidente da unidade pode transferir a presidência.' }
    }
    throw error
  }
}

/** Tira a liderança de uma unidade sem sucessor (só Caso A — a Sede não fica órfã por aqui). */
export async function removerLiderancaUnidadeAction(sedeId: string): Promise<PresidenciaState> {
  try {
    const { session, tenant } = await assertPermission(PERMISSIONS.LEADERSHIP_TRANSFER)

    const alvo = await resolverAlvoNoTenant(tenant.id, sedeId)
    if (alvo.caso !== 'A') {
      return { message: 'A presidência da torcida não pode ficar vaga por aqui — transfira.' }
    }

    await removerLideranca({ alvo, atorId: session.user.id })
    revalidar()
    return { success: true, message: 'Liderança removida da unidade.' }
  } catch (error) {
    if (error instanceof ExpectedError) return { message: error.message }
    throw error
  }
}
