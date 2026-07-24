'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertAffiliationManage, assertTenantOwner } from '@/lib/authz'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { ExpectedError } from '@/lib/expected-error'
import { invalidateHierarchyCache } from '@/lib/hierarquia'
import {
  transicionarSolicitacao,
  type AtorSolicitacao,
  type StatusSolicitacaoUnidade,
} from '@/lib/afiliacao-unidade'
import { criarUnidadeDaSolicitacao } from '@/lib/afiliacao'

/**
 * Server Actions da SOLICITAÇÃO de unidade (afiliação de subsede/PDE — proposta
 * §9). A solicitação nasce no onboarding; aqui o super-admin ou o Presidente
 * (owner) da torcida-alvo revisam, editam e decidem. Aprovar cria a Sede.
 * Toda mutação grava AuditLog (entidade `SolicitacaoUnidade`).
 */

export type SolicitacaoActionState = {
  success?: boolean
  message?: string
}

interface AtorResolvido {
  userId: string
  /** null = super-admin fora de contexto de tenant. */
  tenantId: string | null
  ator: AtorSolicitacao
}

async function resolverAtor(): Promise<AtorResolvido> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  if (isSuperAdminEmail(session.user.email)) {
    return {
      userId: session.user.id,
      tenantId: null,
      ator: { isSuperAdmin: true, isOwner: false, temAffiliationManage: true },
    }
  }

  const { tenant } = await assertAffiliationManage()
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

interface SolicitacaoLite {
  id: string
  status: StatusSolicitacaoUnidade
  tenantId: string
  nome: string
  tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string
  estado: string
  endereco: string | null
  contatoNome: string
  solicitadoPorId: string | null
}

async function carregarSolicitacao(id: string): Promise<SolicitacaoLite> {
  const s: SolicitacaoLite | null = await db.solicitacaoUnidade.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      tenantId: true,
      nome: true,
      tipo: true,
      cidade: true,
      estado: true,
      endereco: true,
      contatoNome: true,
      solicitadoPorId: true,
    },
  })
  if (!s) throw new ExpectedError('Solicitação não encontrada.')
  return s
}

/** Ator não-super-admin só mexe em solicitações da própria torcida. */
function assertMesmoTenant(ator: AtorResolvido, solicitacao: SolicitacaoLite): void {
  if (ator.tenantId && ator.tenantId !== solicitacao.tenantId) {
    throw new ExpectedError('Esta solicitação não pertence à sua torcida.')
  }
}

function revalidar(): void {
  revalidatePath('/admin/afiliacoes')
  revalidatePath('/admin/torcida')
  revalidatePath('/super-admin/afiliacoes')
}

function erroState(error: unknown): SolicitacaoActionState {
  if (error instanceof ExpectedError) return { message: error.message }
  throw error
}

const idSchema = z.object({ solicitacaoId: z.string().min(1, 'Solicitação inválida') })

const motivoSchema = z.object({
  solicitacaoId: z.string().min(1, 'Solicitação inválida'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Informe o motivo (mínimo 3 caracteres).')
    .max(500, 'Motivo muito longo.'),
})

// ── Aprovar (cria a Sede) ─────────────────────────────────────────────────────

export async function aprovarSolicitacao(
  _prev: SolicitacaoActionState,
  formData: FormData,
): Promise<SolicitacaoActionState> {
  const ator = await resolverAtor()
  const parsed = idSchema.safeParse({ solicitacaoId: String(formData.get('solicitacaoId') ?? '') })
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const solicitacao = await carregarSolicitacao(parsed.data.solicitacaoId)
    assertMesmoTenant(ator, solicitacao)

    const transicao = transicionarSolicitacao(solicitacao.status, 'aprovar', ator.ator)
    if (!transicao.ok) throw new ExpectedError(transicao.erro)

    if (solicitacao.tipo === 'SEDE') {
      throw new ExpectedError('Solicitação inválida: tipo deve ser subsede ou ponto de encontro.')
    }
    // const narrowed: o closure da transação "alarga" o narrowing da propriedade.
    const tipoUnidade: 'SUBSEDE' | 'PONTO_ENCONTRO' = solicitacao.tipo

    const criada = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const unidade = await criarUnidadeDaSolicitacao(
        tx,
        {
          tenantId: solicitacao.tenantId,
          nome: solicitacao.nome,
          tipo: tipoUnidade,
          cidade: solicitacao.cidade,
          estado: solicitacao.estado,
          endereco: solicitacao.endereco,
          contatoNome: solicitacao.contatoNome,
          solicitadoPorId: solicitacao.solicitadoPorId,
        },
        ator.userId,
      )
      await tx.solicitacaoUnidade.update({
        where: { id: solicitacao.id },
        data: {
          status: 'APROVADA',
          sedeId: unidade.sedeId,
          decididoPorId: ator.userId,
          decididoEm: new Date(),
        },
      })
      return unidade
    })

    await db.auditLog.create({
      data: {
        tenantId: solicitacao.tenantId,
        atorId: ator.userId,
        acao: 'SOLICITACAO_UNIDADE_APROVADA',
        entidade: 'SolicitacaoUnidade',
        entidadeId: solicitacao.id,
        detalhes: { nome: solicitacao.nome, sedeId: criada.sedeId },
      },
    })

    invalidateHierarchyCache(solicitacao.tenantId)
    revalidar()
    return { success: true, message: `Unidade "${solicitacao.nome}" criada e vinculada.` }
  } catch (error) {
    return erroState(error)
  }
}

// ── Recusar ───────────────────────────────────────────────────────────────────

export async function recusarSolicitacao(
  _prev: SolicitacaoActionState,
  formData: FormData,
): Promise<SolicitacaoActionState> {
  const ator = await resolverAtor()
  const parsed = motivoSchema.safeParse({
    solicitacaoId: String(formData.get('solicitacaoId') ?? ''),
    motivo: String(formData.get('motivo') ?? ''),
  })
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const solicitacao = await carregarSolicitacao(parsed.data.solicitacaoId)
    assertMesmoTenant(ator, solicitacao)

    const transicao = transicionarSolicitacao(solicitacao.status, 'recusar', ator.ator)
    if (!transicao.ok) throw new ExpectedError(transicao.erro)

    await db.solicitacaoUnidade.update({
      where: { id: solicitacao.id },
      data: {
        status: 'RECUSADA',
        motivo: parsed.data.motivo,
        decididoPorId: ator.userId,
        decididoEm: new Date(),
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: solicitacao.tenantId,
        atorId: ator.userId,
        acao: 'SOLICITACAO_UNIDADE_RECUSADA',
        entidade: 'SolicitacaoUnidade',
        entidadeId: solicitacao.id,
        detalhes: { nome: solicitacao.nome, motivo: parsed.data.motivo },
      },
    })

    revalidar()
    return { success: true, message: `Solicitação de "${solicitacao.nome}" recusada.` }
  } catch (error) {
    return erroState(error)
  }
}

// ── Editar (super-admin ou owner da torcida) ──────────────────────────────────

const editarSchema = z.object({
  solicitacaoId: z.string().min(1, 'Solicitação inválida'),
  nome: z.string().trim().min(3, 'Nome muito curto').max(100),
  tipo: z.enum(['SUBSEDE', 'PONTO_ENCONTRO'], { message: 'Tipo inválido' }),
  cidade: z.string().trim().min(2, 'Informe a cidade').max(80),
  estado: z.string().trim().length(2, 'Use a sigla da UF').transform((v) => v.toUpperCase()),
  endereco: z
    .string()
    .max(160)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
})

export async function editarSolicitacao(
  _prev: SolicitacaoActionState,
  formData: FormData,
): Promise<SolicitacaoActionState> {
  const ator = await resolverAtor()
  const parsed = editarSchema.safeParse({
    solicitacaoId: String(formData.get('solicitacaoId') ?? ''),
    nome: String(formData.get('nome') ?? ''),
    tipo: String(formData.get('tipo') ?? ''),
    cidade: String(formData.get('cidade') ?? ''),
    estado: String(formData.get('estado') ?? ''),
    endereco: String(formData.get('endereco') ?? ''),
  })
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const solicitacao = await carregarSolicitacao(parsed.data.solicitacaoId)
    assertMesmoTenant(ator, solicitacao)
    if (!ator.ator.isSuperAdmin && !ator.ator.isOwner) {
      throw new ExpectedError('Só o Presidente (owner) ou o super-admin podem editar.')
    }
    if (solicitacao.status !== 'PENDENTE') {
      throw new ExpectedError('Só solicitações pendentes podem ser editadas.')
    }

    await db.solicitacaoUnidade.update({
      where: { id: solicitacao.id },
      data: {
        nome: parsed.data.nome,
        tipo: parsed.data.tipo,
        cidade: parsed.data.cidade,
        estado: parsed.data.estado,
        endereco: parsed.data.endereco,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: solicitacao.tenantId,
        atorId: ator.userId,
        acao: 'SOLICITACAO_UNIDADE_EDITADA',
        entidade: 'SolicitacaoUnidade',
        entidadeId: solicitacao.id,
        detalhes: { nome: parsed.data.nome, tipo: parsed.data.tipo },
      },
    })

    revalidar()
    return { success: true, message: 'Solicitação atualizada.' }
  } catch (error) {
    return erroState(error)
  }
}

// ── Criar manualmente (intake do suporte — super-admin) ───────────────────────

const criarManualSchema = z.object({
  tenantId: z.string().min(1, 'Torcida inválida'),
  nome: z.string().trim().min(3, 'Nome muito curto').max(100),
  tipo: z.enum(['SUBSEDE', 'PONTO_ENCONTRO'], { message: 'Escolha subsede ou PDE' }),
  cidade: z.string().trim().min(2, 'Informe a cidade').max(80),
  estado: z.string().trim().length(2, 'Use a sigla da UF').transform((v) => v.toUpperCase()),
  endereco: z
    .string()
    .max(160)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  contatoNome: z.string().trim().min(3, 'Informe o contato').max(100),
})

export async function criarSolicitacaoManual(
  _prev: SolicitacaoActionState,
  formData: FormData,
): Promise<SolicitacaoActionState> {
  const session = await auth()
  if (!session?.user?.id || !isSuperAdminEmail(session.user.email)) {
    return { message: 'Acesso negado — apenas o super-admin registra manualmente.' }
  }

  const parsed = criarManualSchema.safeParse({
    tenantId: String(formData.get('tenantId') ?? ''),
    nome: String(formData.get('nome') ?? ''),
    tipo: String(formData.get('tipo') ?? ''),
    cidade: String(formData.get('cidade') ?? ''),
    estado: String(formData.get('estado') ?? ''),
    endereco: String(formData.get('endereco') ?? ''),
    contatoNome: String(formData.get('contatoNome') ?? ''),
  })
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  try {
    const tenant: { id: string; nome: string } | null = await db.tenant.findFirst({
      where: { id: parsed.data.tenantId, ativo: true, sintetico: false },
      select: { id: true, nome: true },
    })
    if (!tenant) throw new ExpectedError('Torcida não encontrada.')

    const s: { id: string } = await db.solicitacaoUnidade.create({
      data: {
        tenantId: tenant.id,
        nome: parsed.data.nome,
        tipo: parsed.data.tipo,
        cidade: parsed.data.cidade,
        estado: parsed.data.estado,
        endereco: parsed.data.endereco,
        contatoNome: parsed.data.contatoNome,
        solicitadoPorId: session.user.id,
      },
      select: { id: true },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'SOLICITACAO_UNIDADE_REGISTRADA',
        entidade: 'SolicitacaoUnidade',
        entidadeId: s.id,
        detalhes: { nome: parsed.data.nome, tipo: parsed.data.tipo, origem: 'super-admin' },
      },
    })

    revalidar()
    return { success: true, message: `Solicitação de "${parsed.data.nome}" registrada.` }
  } catch (error) {
    return erroState(error)
  }
}
