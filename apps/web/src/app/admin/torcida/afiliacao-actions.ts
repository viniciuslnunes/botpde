'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertPermission, assertTenantOwner } from '@/lib/authz'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { ExpectedError } from '@/lib/expected-error'
import {
  transicionarAfiliacao,
  type AtorAfiliacao,
  type StatusAfiliacaoUnidade,
} from '@/lib/afiliacao-unidade'
import {
  desfazerMaterializacaoAfiliacao,
  materializarAfiliacaoAprovada,
} from '@/lib/afiliacao'
import { PERMISSIONS } from '@torcida/types'

/**
 * Server Actions do workflow de afiliação de unidade (Fase 2 — proposta §9).
 * Suporte registra → Vice recomenda (permanece PENDENTE) → Presidente (owner)
 * aprova/recusa — ou super-admin em qualquer ponto. Toda transição grava
 * AuditLog na entidade `AfiliacaoUnidade`.
 */

export type AfiliacaoActionState = {
  success?: boolean
  message?: string
}

interface AtorResolvido {
  userId: string
  /** null = super-admin operando fora de contexto de tenant. */
  tenantId: string | null
  ator: AtorAfiliacao
}

async function resolverAtorAfiliacao(): Promise<AtorResolvido> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  if (isSuperAdminEmail(session.user.email)) {
    return {
      userId: session.user.id,
      tenantId: null,
      ator: { isSuperAdmin: true, isOwner: false, temAffiliationManage: true },
    }
  }

  const { tenant } = await assertPermission(PERMISSIONS.AFFILIATION_MANAGE)
  let isOwner = false
  try {
    await assertTenantOwner(session.user.id, tenant.id)
    isOwner = true
  } catch {
    isOwner = false
  }

  return {
    userId: session.user.id,
    tenantId: tenant.id,
    ator: { isSuperAdmin: false, isOwner, temAffiliationManage: true },
  }
}

interface AfiliacaoComUnidade {
  id: string
  status: StatusAfiliacaoUnidade
  sedePaiTenantId: string | null
  unidadeSede: { id: string; tenantId: string | null; nome: string }
}

async function carregarAfiliacao(afiliacaoId: string): Promise<AfiliacaoComUnidade> {
  const afiliacao: AfiliacaoComUnidade | null = await db.afiliacaoUnidade.findUnique({
    where: { id: afiliacaoId },
    select: {
      id: true,
      status: true,
      sedePaiTenantId: true,
      unidadeSede: { select: { id: true, tenantId: true, nome: true } },
    },
  })
  if (!afiliacao) throw new ExpectedError('Pedido de afiliação não encontrado.')
  return afiliacao
}

/** Tenant do AuditLog: a Sede-mãe quando existe; senão o tenant da unidade. */
function auditTenantId(afiliacao: AfiliacaoComUnidade): string {
  const tenantId = afiliacao.sedePaiTenantId ?? afiliacao.unidadeSede.tenantId
  if (!tenantId) throw new ExpectedError('Afiliação sem tenant para auditoria.')
  return tenantId
}

function revalidarTelas(): void {
  revalidatePath('/admin/torcida')
  revalidatePath('/super-admin/afiliacoes')
}

function mensagemDeErro(error: unknown): AfiliacaoActionState {
  if (error instanceof ExpectedError) return { message: error.message }
  throw error
}

// ── Registrar (intake do suporte — super-admin only) ─────────────────────────

const registrarSchema = z.object({
  unidadeSedeId: z.string().uuid('Unidade inválida'),
  sedePaiTenantId: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : null))
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: 'Sede-mãe inválida',
    }),
})

export async function registrarPedidoAfiliacao(
  _prev: AfiliacaoActionState,
  formData: FormData,
): Promise<AfiliacaoActionState> {
  const session = await auth()
  if (!session?.user?.id || !isSuperAdminEmail(session.user.email)) {
    return { message: 'Acesso negado — o registro do pedido é feito pelo suporte.' }
  }

  const parsed = registrarSchema.safeParse({
    unidadeSedeId: String(formData.get('unidadeSedeId') ?? ''),
    sedePaiTenantId: String(formData.get('sedePaiTenantId') ?? ''),
  })
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }
  const { unidadeSedeId, sedePaiTenantId } = parsed.data

  try {
    const unidade: { id: string; tenantId: string | null; nome: string } | null =
      await db.sede.findUnique({
        where: { id: unidadeSedeId },
        select: { id: true, tenantId: true, nome: true },
      })
    if (!unidade) throw new ExpectedError('Unidade não encontrada.')
    if (!unidade.tenantId) {
      throw new ExpectedError(
        'A unidade candidata precisa ter portal próprio (tenant) antes da afiliação.',
      )
    }

    if (sedePaiTenantId) {
      if (sedePaiTenantId === unidade.tenantId) {
        throw new ExpectedError('A unidade não pode se afiliar a si mesma.')
      }
      const sedePai: { id: string } | null = await db.tenant.findFirst({
        where: { id: sedePaiTenantId, ativo: true, sintetico: false },
        select: { id: true },
      })
      if (!sedePai) throw new ExpectedError('Sede-mãe não encontrada.')
    }

    const existente: { id: string; status: StatusAfiliacaoUnidade } | null =
      await db.afiliacaoUnidade.findUnique({
        where: { unidadeSedeId },
        select: { id: true, status: true },
      })
    if (existente && (existente.status === 'PENDENTE' || existente.status === 'ATIVA')) {
      throw new ExpectedError(
        existente.status === 'PENDENTE'
          ? 'Já existe um pedido pendente para esta unidade.'
          : 'Esta unidade já tem um vínculo ativo. Encerre-o antes de registrar outro pedido.',
      )
    }

    const dados = {
      sedePaiTenantId,
      status: 'PENDENTE' as const,
      decididoPor: sedePaiTenantId ? ('SEDE' as const) : ('SUPER_ADMIN' as const),
      solicitadoPorId: session.user.id,
      recomendadoPorId: null,
      recomendadoEm: null,
      decididoPorId: null,
      decididoEm: null,
      motivo: null,
    }

    const afiliacao: { id: string } = existente
      ? await db.afiliacaoUnidade.update({
          where: { id: existente.id },
          data: dados,
          select: { id: true },
        })
      : await db.afiliacaoUnidade.create({
          data: { unidadeSedeId, ...dados },
          select: { id: true },
        })

    await db.auditLog.create({
      data: {
        tenantId: sedePaiTenantId ?? unidade.tenantId,
        atorId: session.user.id,
        acao: 'AFILIACAO_UNIDADE_REGISTRADA',
        entidade: 'AfiliacaoUnidade',
        entidadeId: afiliacao.id,
        detalhes: {
          unidadeSedeId,
          unidadeNome: unidade.nome,
          sedePaiTenantId,
          reaproveitouPedido: Boolean(existente),
        },
      },
    })

    revalidarTelas()
    return { success: true, message: `Pedido de afiliação de ${unidade.nome} registrado.` }
  } catch (error) {
    return mensagemDeErro(error)
  }
}

// ── Recomendar (Vice — permanece PENDENTE) ───────────────────────────────────

const afiliacaoIdSchema = z.object({ afiliacaoId: z.string().uuid('Pedido inválido') })

export async function recomendarAfiliacao(
  _prev: AfiliacaoActionState,
  formData: FormData,
): Promise<AfiliacaoActionState> {
  const { userId, tenantId, ator } = await resolverAtorAfiliacao()

  const parsed = afiliacaoIdSchema.safeParse({
    afiliacaoId: String(formData.get('afiliacaoId') ?? ''),
  })
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const afiliacao = await carregarAfiliacao(parsed.data.afiliacaoId)
    if (tenantId && afiliacao.sedePaiTenantId !== tenantId) {
      throw new ExpectedError('Este pedido não pertence à sua Sede.')
    }

    const transicao = transicionarAfiliacao(afiliacao.status, 'recomendar', ator)
    if (!transicao.ok) throw new ExpectedError(transicao.erro)

    await db.afiliacaoUnidade.update({
      where: { id: afiliacao.id },
      data: { recomendadoPorId: userId, recomendadoEm: new Date() },
    })

    await db.auditLog.create({
      data: {
        tenantId: auditTenantId(afiliacao),
        atorId: userId,
        acao: 'AFILIACAO_UNIDADE_RECOMENDADA',
        entidade: 'AfiliacaoUnidade',
        entidadeId: afiliacao.id,
        detalhes: { unidadeNome: afiliacao.unidadeSede.nome },
      },
    })

    revalidarTelas()
    return {
      success: true,
      message: `Recomendação registrada — a decisão final é do Presidente.`,
    }
  } catch (error) {
    return mensagemDeErro(error)
  }
}

// ── Aprovar (owner ou super-admin — dispara a materialização) ────────────────

export async function aprovarAfiliacao(
  _prev: AfiliacaoActionState,
  formData: FormData,
): Promise<AfiliacaoActionState> {
  const { userId, tenantId, ator } = await resolverAtorAfiliacao()

  const parsed = afiliacaoIdSchema.safeParse({
    afiliacaoId: String(formData.get('afiliacaoId') ?? ''),
  })
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const afiliacao = await carregarAfiliacao(parsed.data.afiliacaoId)
    if (tenantId && afiliacao.sedePaiTenantId !== tenantId) {
      throw new ExpectedError('Este pedido não pertence à sua Sede.')
    }

    const transicao = transicionarAfiliacao(afiliacao.status, 'aprovar', ator)
    if (!transicao.ok) throw new ExpectedError(transicao.erro)

    // Flip de status + materialização na MESMA transação — falhou a árvore,
    // o pedido continua PENDENTE.
    const materializacao = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.afiliacaoUnidade.update({
        where: { id: afiliacao.id },
        data: { status: 'ATIVA', decididoPorId: userId, decididoEm: new Date() },
      })
      return materializarAfiliacaoAprovada(
        {
          unidadeSedeId: afiliacao.unidadeSede.id,
          sedePaiTenantId: afiliacao.sedePaiTenantId,
          atorId: userId,
        },
        tx,
      )
    })

    await db.auditLog.create({
      data: {
        tenantId: auditTenantId(afiliacao),
        atorId: userId,
        acao: 'AFILIACAO_UNIDADE_APROVADA',
        entidade: 'AfiliacaoUnidade',
        entidadeId: afiliacao.id,
        detalhes: {
          unidadeNome: afiliacao.unidadeSede.nome,
          sedeRaizId: materializacao.sedeRaizId,
          canalConversaId: materializacao.canalConversaId,
          membrosVinculados: materializacao.membrosVinculados,
        },
      },
    })

    revalidarTelas()
    return { success: true, message: `Afiliação de ${afiliacao.unidadeSede.nome} aprovada.` }
  } catch (error) {
    return mensagemDeErro(error)
  }
}

// ── Recusar / Encerrar (owner ou super-admin, com motivo) ────────────────────

const decisaoComMotivoSchema = z.object({
  afiliacaoId: z.string().uuid('Pedido inválido'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Informe o motivo (mínimo 3 caracteres).')
    .max(500, 'Motivo muito longo.'),
})

export async function recusarAfiliacao(
  _prev: AfiliacaoActionState,
  formData: FormData,
): Promise<AfiliacaoActionState> {
  const { userId, tenantId, ator } = await resolverAtorAfiliacao()

  const parsed = decisaoComMotivoSchema.safeParse({
    afiliacaoId: String(formData.get('afiliacaoId') ?? ''),
    motivo: String(formData.get('motivo') ?? ''),
  })
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const afiliacao = await carregarAfiliacao(parsed.data.afiliacaoId)
    if (tenantId && afiliacao.sedePaiTenantId !== tenantId) {
      throw new ExpectedError('Este pedido não pertence à sua Sede.')
    }

    const transicao = transicionarAfiliacao(afiliacao.status, 'recusar', ator)
    if (!transicao.ok) throw new ExpectedError(transicao.erro)

    await db.afiliacaoUnidade.update({
      where: { id: afiliacao.id },
      data: {
        status: 'RECUSADA',
        motivo: parsed.data.motivo,
        decididoPorId: userId,
        decididoEm: new Date(),
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: auditTenantId(afiliacao),
        atorId: userId,
        acao: 'AFILIACAO_UNIDADE_RECUSADA',
        entidade: 'AfiliacaoUnidade',
        entidadeId: afiliacao.id,
        detalhes: { unidadeNome: afiliacao.unidadeSede.nome, motivo: parsed.data.motivo },
      },
    })

    revalidarTelas()
    return { success: true, message: `Pedido de ${afiliacao.unidadeSede.nome} recusado.` }
  } catch (error) {
    return mensagemDeErro(error)
  }
}

export async function encerrarAfiliacao(
  _prev: AfiliacaoActionState,
  formData: FormData,
): Promise<AfiliacaoActionState> {
  const { userId, tenantId, ator } = await resolverAtorAfiliacao()

  const parsed = decisaoComMotivoSchema.safeParse({
    afiliacaoId: String(formData.get('afiliacaoId') ?? ''),
    motivo: String(formData.get('motivo') ?? ''),
  })
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const afiliacao = await carregarAfiliacao(parsed.data.afiliacaoId)
    if (tenantId && afiliacao.sedePaiTenantId !== tenantId) {
      throw new ExpectedError('Este vínculo não pertence à sua Sede.')
    }

    const transicao = transicionarAfiliacao(afiliacao.status, 'encerrar', ator)
    if (!transicao.ok) throw new ExpectedError(transicao.erro)

    await db.afiliacaoUnidade.update({
      where: { id: afiliacao.id },
      data: {
        status: 'ENCERRADA',
        motivo: parsed.data.motivo,
        decididoPorId: userId,
        decididoEm: new Date(),
      },
    })

    await desfazerMaterializacaoAfiliacao({
      unidadeSedeId: afiliacao.unidadeSede.id,
      sedePaiTenantId: afiliacao.sedePaiTenantId,
    })

    await db.auditLog.create({
      data: {
        tenantId: auditTenantId(afiliacao),
        atorId: userId,
        acao: 'AFILIACAO_UNIDADE_ENCERRADA',
        entidade: 'AfiliacaoUnidade',
        entidadeId: afiliacao.id,
        detalhes: { unidadeNome: afiliacao.unidadeSede.nome, motivo: parsed.data.motivo },
      },
    })

    revalidarTelas()
    return { success: true, message: `Vínculo de ${afiliacao.unidadeSede.nome} encerrado.` }
  } catch (error) {
    return mensagemDeErro(error)
  }
}
