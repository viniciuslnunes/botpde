'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import type { CategoriaPatrimonioItem } from '@torcida/db'
import {
  AbrirEmprestimoPatrimonioSchema,
  DevolverEmprestimoPatrimonioSchema,
  MarcarDanoEmprestimoSchema,
  podeGerirCategoriaPatrimonio,
  podeVerCategoriaPatrimonio,
} from '@torcida/types'
import {
  assertAcervoEscrita,
  assertAcervoView,
  garantirCategoriaPermitida,
} from '@/lib/patrimonio-authz'
import { isExpectedError } from '@/lib/expected-error'

export type EmprestimoState = {
  ok?: boolean
  error?: string
  errors?: Record<string, string[]>
}

function revalidateEmprestimos() {
  revalidatePath('/admin/patrimonio')
  revalidatePath('/admin/bandeiras')
  revalidatePath('/portal/patrimonio')
  revalidatePath('/portal/departamentos/patrimonio')
  revalidatePath('/portal/departamentos/bandeiras')
  revalidatePath('/portal/departamentos', 'layout')
}

/**
 * Retirada com foto — colaborador com `patrimony:view` (inventário inteiro) ou
 * `flags:view` (só bandeira). Auto-conclui (EM_USO).
 */
export async function abrirEmprestimoPatrimonio(
  _prev: EmprestimoState,
  formData: FormData,
): Promise<EmprestimoState> {
  const { session, tenant, escopo } = await assertAcervoView()
  const userId = session.user.id
  if (!userId) return { error: 'Sessão inválida' }

  const parsed = AbrirEmprestimoPatrimonioSchema.safeParse({
    itemId: formData.get('itemId'),
    fotoSaidaUrl: formData.get('fotoSaidaUrl'),
    eventoId: formData.get('eventoId') ?? undefined,
    observacao: formData.get('observacao') ?? undefined,
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { itemId, fotoSaidaUrl, eventoId, observacao } = parsed.data

  type ItemRow = {
    id: string
    nome: string
    status: string
    categoria: CategoriaPatrimonioItem
  }
  const item: ItemRow | null = await db.patrimonioItem.findFirst({
    where: {
      id: itemId,
      tenantId: tenant.id,
      // Recorte do RBAC na própria query: quem só tem `flags:view` não retira
      // o projetor nem descobre que ele existe.
      ...(escopo.categoriaTravada ? { categoria: escopo.categoriaTravada } : {}),
    },
    select: { id: true, nome: true, status: true, categoria: true },
  })
  if (!item) return { error: 'Item não encontrado' }
  if (item.status === 'BAIXADO') return { error: 'Item baixado — não pode sair' }
  if (item.status === 'MANUTENCAO') return { error: 'Item em manutenção' }
  if (item.status === 'EM_USO') return { error: 'Item já está em uso' }

  const abertoExistente: { id: string } | null = await db.patrimonioEmprestimo.findFirst({
    where: { tenantId: tenant.id, itemId: item.id, status: 'ABERTO' },
    select: { id: true },
  })
  if (abertoExistente) return { error: 'Já existe empréstimo aberto deste item' }

  // A operação tem de ser desta torcida — o mesmo cuidado do rateio no caixa.
  let operacaoId: string | null = null
  if (eventoId) {
    const evento: { id: string } | null = await db.evento.findFirst({
      where: { id: eventoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!evento) return { errors: { eventoId: ['Operação não encontrada nesta torcida'] } }
    operacaoId = evento.id
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const emp = await tx.patrimonioEmprestimo.create({
      data: {
        tenantId: tenant.id,
        itemId: item.id,
        userId,
        status: 'ABERTO',
        fotoSaidaUrl,
        eventoId: operacaoId,
        observacao: observacao ?? null,
      },
      select: { id: true },
    })
    await tx.patrimonioItem.update({
      where: { id: item.id },
      data: { status: 'EM_USO', responsavelId: userId },
    })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: userId,
        acao: 'PATRIMONIO_EMPRESTIMO_ABERTO',
        entidade: 'PatrimonioEmprestimo',
        entidadeId: emp.id,
        detalhes: { itemId: item.id, nome: item.nome, eventoId: operacaoId },
      },
    })
  })

  revalidateEmprestimos()
  return { ok: true }
}

/** Devolução com foto de guarda — só o titular do empréstimo (ou manage). */
export async function devolverEmprestimoPatrimonio(
  _prev: EmprestimoState,
  formData: FormData,
): Promise<EmprestimoState> {
  const { session, tenant, permissoesEfetivas, isSuperAdmin } = await assertAcervoView()
  const userId = session.user.id
  if (!userId) return { error: 'Sessão inválida' }

  const parsed = DevolverEmprestimoPatrimonioSchema.safeParse({
    emprestimoId: formData.get('emprestimoId'),
    fotoGuardaUrl: formData.get('fotoGuardaUrl'),
    observacao: formData.get('observacao') ?? undefined,
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { emprestimoId, fotoGuardaUrl, observacao } = parsed.data

  type EmpRow = {
    id: string
    userId: string
    itemId: string
    status: string
    item: { nome: string; categoria: CategoriaPatrimonioItem }
  }
  const emp: EmpRow | null = await db.patrimonioEmprestimo.findFirst({
    where: { id: emprestimoId, tenantId: tenant.id },
    select: {
      id: true,
      userId: true,
      itemId: true,
      status: true,
      item: { select: { nome: true, categoria: true } },
    },
  })
  if (!emp) return { error: 'Empréstimo não encontrado' }
  if (emp.status !== 'ABERTO') return { error: 'Empréstimo já encerrado' }
  if (
    !podeVerCategoriaPatrimonio(permissoesEfetivas ?? [], emp.item.categoria, {
      isSuperAdmin: Boolean(isSuperAdmin),
    })
  ) {
    return { error: 'Empréstimo não encontrado' }
  }

  // Gestor "por cima" do titular vale dentro do próprio escopo: o gestor de
  // Bandeiras encerra empréstimo de bandeira, não de mobiliário.
  const podeManage = podeGerirCategoriaPatrimonio(
    permissoesEfetivas ?? [],
    emp.item.categoria,
    { isSuperAdmin: Boolean(isSuperAdmin) },
  )
  if (emp.userId !== userId && !podeManage) {
    return { error: 'Só quem retirou (ou o gestor) pode devolver' }
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.patrimonioEmprestimo.update({
      where: { id: emp.id },
      data: {
        status: 'DEVOLVIDO',
        fotoGuardaUrl,
        observacao: observacao ?? undefined,
        devolvidoEm: new Date(),
      },
    })
    await tx.patrimonioItem.update({
      where: { id: emp.itemId },
      data: { status: 'DISPONIVEL' },
    })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: userId,
        acao: 'PATRIMONIO_EMPRESTIMO_DEVOLVIDO',
        entidade: 'PatrimonioEmprestimo',
        entidadeId: emp.id,
        detalhes: { itemId: emp.itemId, nome: emp.item.nome },
      },
    })
  })

  revalidateEmprestimos()
  return { ok: true }
}

/** Gestor marca dano após auditar fotos — item vai para MANUTENCAO. */
export async function marcarDanoEmprestimoPatrimonio(
  _prev: EmprestimoState,
  formData: FormData,
): Promise<EmprestimoState> {
  const authz = await assertAcervoEscrita()
  const { session, tenant } = authz
  const atorId = session.user.id
  if (!atorId) return { error: 'Sessão inválida' }

  const parsed = MarcarDanoEmprestimoSchema.safeParse({
    emprestimoId: formData.get('emprestimoId'),
    danoObservacao: formData.get('danoObservacao'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  type EmpRow = {
    id: string
    itemId: string
    status: string
    item: { nome: string; categoria: CategoriaPatrimonioItem }
  }
  const emp: EmpRow | null = await db.patrimonioEmprestimo.findFirst({
    where: { id: parsed.data.emprestimoId, tenantId: tenant.id },
    select: {
      id: true,
      itemId: true,
      status: true,
      item: { select: { nome: true, categoria: true } },
    },
  })
  if (!emp) return { error: 'Empréstimo não encontrado' }
  try {
    garantirCategoriaPermitida(authz, emp.item.categoria)
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.patrimonioEmprestimo.update({
      where: { id: emp.id },
      data: {
        status: 'COM_DANO',
        danoReportado: true,
        danoObservacao: parsed.data.danoObservacao,
        ...(emp.status === 'ABERTO' ? { devolvidoEm: new Date() } : {}),
      },
    })
    await tx.patrimonioItem.update({
      where: { id: emp.itemId },
      data: { status: 'MANUTENCAO' },
    })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId,
        acao: 'PATRIMONIO_EMPRESTIMO_DANO',
        entidade: 'PatrimonioEmprestimo',
        entidadeId: emp.id,
        detalhes: {
          itemId: emp.itemId,
          nome: emp.item.nome,
          danoObservacao: parsed.data.danoObservacao,
        },
      },
    })
  })

  revalidateEmprestimos()
  return { ok: true }
}
