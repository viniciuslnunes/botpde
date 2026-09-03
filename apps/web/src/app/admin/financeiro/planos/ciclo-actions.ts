'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { FinanceiroCicloSchema, PERMISSIONS, parseFinanceiroCiclo } from '@torcida/types'
import { z } from 'zod'

export type FinanceiroCicloState = {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
}

const salvarSchema = z.object({
  ativo: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
  diaGeracao: z.coerce.number().int().min(1).max(28),
  diasParaVencimento: z.coerce.number().int().min(1).max(60),
  diasRegua: z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n)),
    ),
})

export async function salvarFinanceiroCiclo(
  _prev: FinanceiroCicloState,
  formData: FormData,
): Promise<FinanceiroCicloState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  const parsed = salvarSchema.safeParse({
    ativo: formData.get('ativo'),
    diaGeracao: formData.get('diaGeracao'),
    diasParaVencimento: formData.get('diasParaVencimento'),
    diasRegua: formData.get('diasRegua') ?? '0,7,14',
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const ciclo = FinanceiroCicloSchema.parse({
    ativo: parsed.data.ativo,
    diaGeracao: parsed.data.diaGeracao,
    diasParaVencimento: parsed.data.diasParaVencimento,
    diasRegua: parsed.data.diasRegua.length > 0 ? parsed.data.diasRegua : [0, 7, 14],
  })

  await db.tenant.update({
    where: { id: tenant.id },
    data: { financeiroCiclo: ciclo },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'FINANCEIRO_CICLO_ATUALIZADO',
      entidade: 'Tenant',
      entidadeId: tenant.id,
      detalhes: ciclo,
    },
  })

  revalidatePath('/admin/financeiro/planos')
  revalidatePath('/admin/financeiro')

  return { success: true, message: 'Ciclo automático salvo.' }
}

export async function carregarFinanceiroCicloTenant(tenantId: string) {
  const tenant: { financeiroCiclo: unknown } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { financeiroCiclo: true },
  })
  return parseFinanceiroCiclo(tenant?.financeiroCiclo)
}
