'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import {
  AtualizarPatrimonioItemSchema,
  CriarPatrimonioItemSchema,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'

export type PatrimonioState = {
  ok?: boolean
  error?: string
  errors?: Record<string, string[]>
}

function revalidatePatrimonio() {
  revalidatePath('/admin/patrimonio')
  revalidatePath('/portal/patrimonio')
  revalidatePath('/portal/departamentos/patrimonio')
  revalidatePath('/portal/departamentos', 'layout')
}

function formToPayload(formData: FormData) {
  return {
    nome: formData.get('nome'),
    categoria: formData.get('categoria'),
    status: formData.get('status') || 'DISPONIVEL',
    quantidade: formData.get('quantidade') || '1',
    localizacao: formData.get('localizacao') ?? undefined,
    valorEstimado: formData.get('valorEstimado') ?? undefined,
    observacao: formData.get('observacao') ?? undefined,
    responsavelId: formData.get('responsavelId') ?? undefined,
  }
}

async function assertResponsavelNoTenant(
  tenantId: string,
  responsavelId: string | undefined,
): Promise<string | null> {
  if (!responsavelId) return null
  const membro: { id: string } | null = await db.saasMembro.findFirst({
    where: { tenantId, userId: responsavelId, status: 'APROVADO' },
    select: { id: true },
  })
  if (!membro) return 'Responsável precisa ser membro aprovado desta torcida'
  return null
}

export async function criarPatrimonioItem(
  _prev: PatrimonioState,
  formData: FormData,
): Promise<PatrimonioState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.PATRIMONY_MANAGE)

  const parsed = CriarPatrimonioItemSchema.safeParse(formToPayload(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const data = parsed.data
  const respErr = await assertResponsavelNoTenant(tenant.id, data.responsavelId)
  if (respErr) return { errors: { responsavelId: [respErr] } }

  const created = await db.patrimonioItem.create({
    data: {
      tenantId: tenant.id,
      nome: data.nome,
      categoria: data.categoria,
      status: data.status,
      quantidade: data.quantidade,
      localizacao: data.localizacao ?? null,
      valorEstimado: data.valorEstimado ?? null,
      observacao: data.observacao ?? null,
      responsavelId: data.responsavelId ?? null,
      criadoPorId: session.user.id!,
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PATRIMONIO_ITEM_CRIADO',
      entidade: 'PatrimonioItem',
      entidadeId: created.id,
      detalhes: { nome: data.nome, categoria: data.categoria, status: data.status },
    },
  })

  revalidatePatrimonio()
  return { ok: true }
}

export async function editarPatrimonioItem(
  _prev: PatrimonioState,
  formData: FormData,
): Promise<PatrimonioState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.PATRIMONY_MANAGE)

  const parsed = AtualizarPatrimonioItemSchema.safeParse({
    id: formData.get('id'),
    ...formToPayload(formData),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const data = parsed.data
  const existente: { id: string } | null = await db.patrimonioItem.findFirst({
    where: { id: data.id, tenantId: tenant.id },
    select: { id: true },
  })
  if (!existente) return { error: 'Item não encontrado' }

  const respErr = await assertResponsavelNoTenant(tenant.id, data.responsavelId)
  if (respErr) return { errors: { responsavelId: [respErr] } }

  await db.patrimonioItem.update({
    where: { id: existente.id },
    data: {
      nome: data.nome,
      categoria: data.categoria,
      status: data.status,
      quantidade: data.quantidade,
      localizacao: data.localizacao ?? null,
      valorEstimado: data.valorEstimado ?? null,
      observacao: data.observacao ?? null,
      responsavelId: data.responsavelId ?? null,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PATRIMONIO_ITEM_EDITADO',
      entidade: 'PatrimonioItem',
      entidadeId: existente.id,
      detalhes: { nome: data.nome, categoria: data.categoria, status: data.status },
    },
  })

  revalidatePatrimonio()
  return { ok: true }
}

export async function baixarPatrimonioItem(itemId: string): Promise<PatrimonioState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.PATRIMONY_MANAGE)

  const existente: { id: string; nome: string; status: string } | null =
    await db.patrimonioItem.findFirst({
      where: { id: itemId, tenantId: tenant.id },
      select: { id: true, nome: true, status: true },
    })
  if (!existente) return { error: 'Item não encontrado' }
  if (existente.status === 'BAIXADO') return { ok: true }

  await db.patrimonioItem.update({
    where: { id: existente.id },
    data: { status: 'BAIXADO' },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PATRIMONIO_ITEM_BAIXADO',
      entidade: 'PatrimonioItem',
      entidadeId: existente.id,
      detalhes: { nome: existente.nome },
    },
  })

  revalidatePatrimonio()
  return { ok: true }
}

export async function excluirPatrimonioItem(itemId: string): Promise<PatrimonioState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.PATRIMONY_MANAGE)

  const existente: { id: string; nome: string; categoria: string; status: string } | null =
    await db.patrimonioItem.findFirst({
      where: { id: itemId, tenantId: tenant.id },
      select: { id: true, nome: true, categoria: true, status: true },
    })
  if (!existente) return { error: 'Item não encontrado' }

  await db.patrimonioItem.delete({ where: { id: existente.id } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PATRIMONIO_ITEM_EXCLUIDO',
      entidade: 'PatrimonioItem',
      entidadeId: existente.id,
      detalhes: {
        nome: existente.nome,
        categoria: existente.categoria,
        status: existente.status,
      },
    },
  })

  revalidatePatrimonio()
  return { ok: true }
}
