'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import {
  AtualizarPlanoAssociacaoSchema,
  CriarPlanoAssociacaoSchema,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'

export type PlanoState = {
  ok?: boolean
  error?: string
  errors?: Record<string, string[]>
}

function revalidatePlanos() {
  revalidatePath('/admin/planos-associacao')
  revalidatePath('/admin/membros')
}

function formToPlanoPayload(formData: FormData) {
  return {
    nome: formData.get('nome'),
    descricao: formData.get('descricao') ?? undefined,
    valor: formData.get('valor'),
    periodicidade: formData.get('periodicidade') ?? 'MENSAL',
    beneficios: formData.get('beneficios') ?? undefined,
    ativo: formData.get('ativo') === 'on' || formData.get('ativo') === 'true',
  }
}

export async function criarPlanoAssociacao(
  _prev: PlanoState,
  formData: FormData,
): Promise<PlanoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  const parsed = CriarPlanoAssociacaoSchema.safeParse(formToPlanoPayload(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nome, descricao, valor, periodicidade, beneficios, ativo } = parsed.data

  const created = await db.planoAssociacao.create({
    data: {
      tenantId: tenant.id,
      nome,
      descricao: descricao ?? null,
      valor,
      periodicidade,
      beneficios: beneficios ?? null,
      ativo,
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PLANO_ASSOCIACAO_CRIADO',
      entidade: 'PlanoAssociacao',
      entidadeId: created.id,
      detalhes: { nome, valor: Number(valor), periodicidade },
    },
  })

  revalidatePlanos()
  return { ok: true }
}

export async function atualizarPlanoAssociacao(
  _prev: PlanoState,
  formData: FormData,
): Promise<PlanoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  const parsed = AtualizarPlanoAssociacaoSchema.safeParse({
    id: formData.get('id'),
    ...formToPlanoPayload(formData),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { id, nome, descricao, valor, periodicidade, beneficios, ativo } = parsed.data

  const existente: { id: string } | null = await db.planoAssociacao.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true },
  })
  if (!existente) return { error: 'Plano não encontrado' }

  await db.planoAssociacao.update({
    where: { id: existente.id },
    data: {
      nome,
      descricao: descricao ?? null,
      valor,
      periodicidade,
      beneficios: beneficios ?? null,
      ativo,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PLANO_ASSOCIACAO_ATUALIZADO',
      entidade: 'PlanoAssociacao',
      entidadeId: existente.id,
      detalhes: { nome, valor: Number(valor), periodicidade, ativo },
    },
  })

  revalidatePlanos()
  return { ok: true }
}
