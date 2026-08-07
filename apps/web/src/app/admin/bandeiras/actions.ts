'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import {
  CATEGORIA_BANDEIRA,
  gravarVistoriaBandeira,
  RegistrarVistoriaBandeiraSchema,
} from '@torcida/types'
import { assertPodeGerirItem } from '@/lib/patrimonio-authz'
import { isExpectedError } from '@/lib/expected-error'

export type VistoriaState = {
  ok?: boolean
  error?: string
  errors?: Record<string, string[]>
}

function revalidateBandeiras() {
  revalidatePath('/admin/bandeiras')
  revalidatePath('/admin/patrimonio')
  revalidatePath('/portal/patrimonio')
  revalidatePath('/portal/departamentos/bandeiras')
}

/**
 * Ficha de vistoria/liberação da bandeira (medidas, mastro, órgão, validade).
 *
 * Mora em `PatrimonioItem.meta.vistoria` e só faz sentido em categoria
 * `BANDEIRA` — mesa não passa por revista de estádio. O gate é o mesmo do
 * acervo: `patrimony:manage` (inventário inteiro) ou `flags:manage` (bandeiras).
 */
export async function registrarVistoriaBandeira(
  _prev: VistoriaState,
  formData: FormData,
): Promise<VistoriaState> {
  const parsed = RegistrarVistoriaBandeiraSchema.safeParse({
    itemId: formData.get('itemId'),
    larguraM: formData.get('larguraM'),
    alturaM: formData.get('alturaM'),
    comMastro: formData.get('comMastro') ?? undefined,
    orgao: formData.get('orgao') ?? undefined,
    protocolo: formData.get('protocolo') ?? undefined,
    validade: formData.get('validade') ?? undefined,
    observacao: formData.get('observacao') ?? undefined,
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }
  const { itemId, ...vistoria } = parsed.data

  let ctx: Awaited<ReturnType<typeof assertPodeGerirItem>>
  try {
    ctx = await assertPodeGerirItem(itemId)
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }

  if (ctx.item.categoria !== CATEGORIA_BANDEIRA) {
    return { error: 'Ficha de vistoria só existe para bandeiras e faixas.' }
  }

  await db.patrimonioItem.update({
    where: { id: ctx.item.id },
    data: { meta: gravarVistoriaBandeira(ctx.item.meta, vistoria) },
  })

  await db.auditLog.create({
    data: {
      tenantId: ctx.tenant.id,
      atorId: ctx.session.user.id,
      acao: 'BANDEIRA_VISTORIA_REGISTRADA',
      entidade: 'PatrimonioItem',
      entidadeId: ctx.item.id,
      detalhes: {
        larguraM: vistoria.larguraM,
        alturaM: vistoria.alturaM,
        comMastro: vistoria.comMastro,
        orgao: vistoria.orgao ?? null,
        validade: vistoria.validade ?? null,
      },
    },
  })

  revalidateBandeiras()
  return { ok: true }
}
