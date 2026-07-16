'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import {
  AtualizarLancamentoSchema,
  CriarLancamentoSchema,
  formatDataCompetenciaInput,
  parseDataCompetencia,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'

export type LancamentoState = {
  ok?: boolean
  error?: string
  errors?: Record<string, string[]>
}

function revalidateFinanceiro() {
  revalidatePath('/admin/financeiro')
  revalidatePath('/portal/financeiro')
  revalidatePath('/portal/departamentos/financeiro')
  revalidatePath('/portal/departamentos', 'layout')
}

function formToLancamentoPayload(formData: FormData) {
  return {
    tipo: formData.get('tipo'),
    categoria: formData.get('categoria'),
    valor: formData.get('valor'),
    descricao: formData.get('descricao'),
    data: formData.get('data'),
    observacao: formData.get('observacao') ?? undefined,
  }
}

export async function criarLancamentoFinanceiro(
  _prev: LancamentoState,
  formData: FormData,
): Promise<LancamentoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  const parsed = CriarLancamentoSchema.safeParse(formToLancamentoPayload(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { tipo, categoria, valor, descricao, data, observacao } = parsed.data
  const dataComp = parseDataCompetencia(data)
  if (!dataComp) return { errors: { data: ['Data inválida'] } }

  const created = await db.financeiroLancamento.create({
    data: {
      tenantId: tenant.id,
      tipo,
      categoria,
      valor,
      descricao,
      data: dataComp,
      observacao: observacao ?? null,
      criadoPorId: session.user.id!,
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'FINANCEIRO_LANCAMENTO_CRIADO',
      entidade: 'FinanceiroLancamento',
      entidadeId: created.id,
      detalhes: { tipo, categoria, valor, data },
    },
  })

  revalidateFinanceiro()
  return { ok: true }
}

export async function editarLancamentoFinanceiro(
  _prev: LancamentoState,
  formData: FormData,
): Promise<LancamentoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  const parsed = AtualizarLancamentoSchema.safeParse({
    id: formData.get('id'),
    ...formToLancamentoPayload(formData),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { id, tipo, categoria, valor, descricao, data, observacao } = parsed.data
  const dataComp = parseDataCompetencia(data)
  if (!dataComp) return { errors: { data: ['Data inválida'] } }

  const existente: { id: string } | null = await db.financeiroLancamento.findFirst({
    where: { id, tenantId: tenant.id },
    select: { id: true },
  })
  if (!existente) return { error: 'Lançamento não encontrado' }

  await db.financeiroLancamento.update({
    where: { id: existente.id },
    data: {
      tipo,
      categoria,
      valor,
      descricao,
      data: dataComp,
      observacao: observacao ?? null,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'FINANCEIRO_LANCAMENTO_EDITADO',
      entidade: 'FinanceiroLancamento',
      entidadeId: existente.id,
      detalhes: { tipo, categoria, valor, data },
    },
  })

  revalidateFinanceiro()
  return { ok: true }
}

export async function excluirLancamentoFinanceiro(lancamentoId: string): Promise<LancamentoState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  if (!lancamentoId || typeof lancamentoId !== 'string') {
    return { error: 'Lançamento inválido' }
  }

  const existente: {
    id: string
    tipo: string
    categoria: string
    valor: unknown
    descricao: string
  } | null = await db.financeiroLancamento.findFirst({
    where: { id: lancamentoId, tenantId: tenant.id },
    select: { id: true, tipo: true, categoria: true, valor: true, descricao: true },
  })
  if (!existente) return { error: 'Lançamento não encontrado' }

  await db.financeiroLancamento.delete({ where: { id: existente.id } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'FINANCEIRO_LANCAMENTO_EXCLUIDO',
      entidade: 'FinanceiroLancamento',
      entidadeId: existente.id,
      detalhes: {
        tipo: existente.tipo,
        categoria: existente.categoria,
        valor: Number(existente.valor),
        descricao: existente.descricao,
      },
    },
  })

  revalidateFinanceiro()
  return { ok: true }
}

function csvEscape(val: string): string {
  if (/[",\n\r]/.test(val)) return `"${val.replace(/"/g, '""')}"`
  return val
}

export async function exportarLancamentosCsv(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; error: string }
> {
  const { tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  type Row = {
    tipo: string
    categoria: string
    valor: unknown
    descricao: string
    data: Date
    observacao: string | null
    criadoPor: { nome: string | null }
  }

  const rows: Row[] = await db.financeiroLancamento.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
    select: {
      tipo: true,
      categoria: true,
      valor: true,
      descricao: true,
      data: true,
      observacao: true,
      criadoPor: { select: { nome: true } },
    },
  })

  const header = 'data,tipo,categoria,valor,descricao,observacao,criadoPor'
  const lines = rows.map((r) =>
    [
      formatDataCompetenciaInput(r.data),
      r.tipo,
      r.categoria,
      Number(r.valor),
      r.descricao,
      r.observacao ?? '',
      r.criadoPor.nome ?? '',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  )

  const csv = [header, ...lines].join('\n')
  const filename = `financeiro-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.csv`
  return { ok: true, csv, filename }
}
