'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import {
  BaixarCobrancaManualSchema,
  CancelarCobrancaSchema,
  CriarCobrancaSchema,
  parseDataCompetencia,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import {
  baixarCobrancaComoPaga,
  recalcularAdimplencia,
  sincronizarCobrancasVencidas,
} from '@/lib/cobrancas'
import { criarCobrancaPix } from '@/lib/pix-gateway'
import { notificarSafe } from '@/lib/notificacoes'
import { notificarAdminsPorPermissao } from '@/lib/notificacoes-routing'

export type CobrancaActionState = {
  ok?: boolean
  error?: string
  errors?: Record<string, string[]>
}

function revalidateCobrancas() {
  revalidatePath('/admin/cobrancas')
  revalidatePath('/portal')
  revalidatePath('/portal/cobrancas')
}

function formToCobrancaPayload(formData: FormData) {
  const planoRaw = formData.get('planoAssociacaoId')
  return {
    userId: formData.get('userId'),
    planoAssociacaoId: planoRaw && String(planoRaw).length > 0 ? planoRaw : undefined,
    tipo: formData.get('tipo') ?? 'MENSALIDADE',
    descricao: formData.get('descricao'),
    valor: formData.get('valor'),
    vencimento: formData.get('vencimento'),
  }
}

export async function criarCobranca(
  _prev: CobrancaActionState,
  formData: FormData,
): Promise<CobrancaActionState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  const parsed = CriarCobrancaSchema.safeParse(formToCobrancaPayload(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { userId, planoAssociacaoId, tipo, descricao, valor, vencimento } = parsed.data
  const venc = parseDataCompetencia(vencimento)
  if (!venc) return { errors: { vencimento: ['Vencimento inválido'] } }

  type MembroLite = { id: string }
  const membro: MembroLite | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
    select: { id: true },
  })
  if (!membro) return { error: 'Membro não encontrado nesta torcida' }

  if (planoAssociacaoId) {
    const plano: { id: string } | null = await db.planoAssociacao.findFirst({
      where: { id: planoAssociacaoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!plano) return { errors: { planoAssociacaoId: ['Plano inválido'] } }
  }

  const cobranca = await db.cobrancaAssociacao.create({
    data: {
      tenantId: tenant.id,
      userId,
      membroId: membro.id,
      planoAssociacaoId: planoAssociacaoId ?? null,
      tipo,
      descricao,
      valor,
      vencimento: venc,
      status: 'PENDENTE',
      criadoPorId: session.user.id,
    },
    select: { id: true },
  })

  await recalcularAdimplencia(tenant.id, userId)

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COBRANCA_CRIADA',
      entidade: 'CobrancaAssociacao',
      entidadeId: cobranca.id,
      detalhes: { userId, tipo, valor: Number(valor), vencimento },
    },
  })

  await notificarSafe({
    userId,
    tenantId: tenant.id,
    tipo: 'COBRANCA_PENDENTE',
    titulo: 'Nova cobrança disponível',
    corpo: descricao,
    link: `/portal/cobrancas/${cobranca.id}`,
  })

  revalidateCobrancas()
  return { ok: true }
}

export async function baixarCobrancaManual(cobrancaId: string): Promise<CobrancaActionState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  const parsed = BaixarCobrancaManualSchema.safeParse({ cobrancaId })
  if (!parsed.success) return { error: 'Cobrança inválida' }

  const result = await baixarCobrancaComoPaga({
    tenantId: tenant.id,
    cobrancaId: parsed.data.cobrancaId,
    atorId: session.user.id!,
    metodo: 'MANUAL',
  })
  if (!result.ok) return { error: result.error }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COBRANCA_BAIXA_MANUAL',
      entidade: 'CobrancaAssociacao',
      entidadeId: parsed.data.cobrancaId,
    },
  })

  revalidateCobrancas()
  return { ok: true }
}

export async function cancelarCobranca(cobrancaId: string): Promise<CobrancaActionState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  const parsed = CancelarCobrancaSchema.safeParse({ cobrancaId })
  if (!parsed.success) return { error: 'Cobranca inválida' }

  type Row = { id: string; userId: string; status: string }
  const cob: Row | null = await db.cobrancaAssociacao.findFirst({
    where: { id: parsed.data.cobrancaId, tenantId: tenant.id },
    select: { id: true, userId: true, status: true },
  })
  if (!cob) return { error: 'Cobrança não encontrada' }
  if (cob.status === 'PAGA') return { error: 'Cobrança já paga' }
  if (cob.status === 'CANCELADA') return { ok: true }

  await db.cobrancaAssociacao.update({
    where: { id: cob.id },
    data: { status: 'CANCELADA' },
  })

  await recalcularAdimplencia(tenant.id, cob.userId)

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COBRANCA_CANCELADA',
      entidade: 'CobrancaAssociacao',
      entidadeId: cob.id,
    },
  })

  revalidateCobrancas()
  return { ok: true }
}

export async function gerarPixCobranca(cobrancaId: string): Promise<CobrancaActionState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  type Row = {
    id: string
    descricao: string
    valor: { toNumber(): number }
    status: string
    user: { email: string | null }
  }
  const cob: Row | null = await db.cobrancaAssociacao.findFirst({
    where: { id: cobrancaId, tenantId: tenant.id },
    select: {
      id: true,
      descricao: true,
      valor: true,
      status: true,
      user: { select: { email: true } },
    },
  })
  if (!cob) return { error: 'Cobrança não encontrada' }
  if (cob.status !== 'PENDENTE' && cob.status !== 'VENCIDA') {
    return { error: 'Só é possível gerar Pix para cobranças abertas' }
  }

  try {
    const pix = await criarCobrancaPix({
      cobrancaId: cob.id,
      tenantSlug: tenant.slug,
      valor: cob.valor.toNumber(),
      descricao: cob.descricao,
      payerEmail: cob.user.email,
    })

    await db.cobrancaAssociacao.update({
      where: { id: cob.id },
      data: {
        pixCopiaCola: pix.copiaCola,
        gatewayProvider: pix.provider,
        gatewayExternalId: pix.externalId,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'COBRANCA_PIX_GERADO',
        entidade: 'CobrancaAssociacao',
        entidadeId: cob.id,
        detalhes: { provider: pix.provider },
      },
    })

    revalidateCobrancas()
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao gerar Pix'
    return { error: msg }
  }
}

export async function dispararLembretesCobrancas(): Promise<CobrancaActionState & { enviados?: number }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE)

  await sincronizarCobrancasVencidas(tenant.id)

  type CobLite = {
    id: string
    userId: string
    descricao: string
    status: 'PENDENTE' | 'VENCIDA'
  }
  const abertas: CobLite[] = await db.cobrancaAssociacao.findMany({
    where: {
      tenantId: tenant.id,
      status: { in: ['PENDENTE', 'VENCIDA'] },
    },
    select: { id: true, userId: true, descricao: true, status: true },
    take: 200,
  })

  let enviados = 0
  for (const cob of abertas) {
    const tipo = cob.status === 'VENCIDA' ? 'COBRANCA_VENCIDA' : 'COBRANCA_PENDENTE'
    const titulo =
      cob.status === 'VENCIDA' ? 'Cobrança vencida' : 'Lembrete de cobrança pendente'

    await notificarSafe({
      userId: cob.userId,
      tenantId: tenant.id,
      tipo,
      titulo,
      corpo: cob.descricao,
      link: `/portal/cobrancas/${cob.id}`,
    })
    enviados++

    if (cob.status === 'VENCIDA') {
      await notificarAdminsPorPermissao(PERMISSIONS.FINANCE_MANAGE, {
        tenantId: tenant.id,
        tipo: 'COBRANCA_VENCIDA',
        titulo: 'Cobrança vencida',
        corpo: cob.descricao,
        link: '/admin/cobrancas?status=VENCIDA',
        atorId: session.user.id,
      })
    }
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'COBRANCA_LEMBRETES_DISPARADOS',
      entidade: 'CobrancaAssociacao',
      detalhes: { quantidade: enviados },
    },
  })

  return { ok: true, enviados }
}
