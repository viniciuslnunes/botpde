'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  getAfiliacoesParaOnboarding,
  getTorcidasPorAfiliacao,
  getDepartamentosDoTenant,
  type AfiliacaoOnboarding,
  type TorcidaOnboarding,
  type DepartamentoOnboarding,
} from '@/lib/onboarding'
import { setTenantContextSlug } from '@/lib/tenant-context'

// ─── Leituras auxiliares (chamadas pelo wizard entre passos) ────────────────────

export async function buscarAfiliacoes(busca?: string): Promise<AfiliacaoOnboarding[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  return getAfiliacoesParaOnboarding(busca)
}

export async function buscarTorcidas(afiliacaoId: string): Promise<TorcidaOnboarding[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  if (!z.string().uuid().safeParse(afiliacaoId).success) return []
  return getTorcidasPorAfiliacao(afiliacaoId)
}

export async function buscarDepartamentos(
  tenantId: string,
): Promise<DepartamentoOnboarding[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  if (!z.string().uuid().safeParse(tenantId).success) return []
  return getDepartamentosDoTenant(tenantId)
}

// ─── Resultado padrão das actions do onboarding ─────────────────────────────────

export type OnboardingActionState = {
  ok?: boolean
  errors?: Record<string, string[]>
  message?: string
}

// ─── 1. Clube + região ─────────────────────────────────────────────────────────

const clubeRegiaoSchema = z.object({
  afiliacaoId: z.string().uuid('Clube inválido'),
  regiao: z
    .string()
    .max(120)
    .optional()
    .transform((v) => v?.trim() || undefined),
})

/**
 * Salva o clube que o usuário torce e (opcionalmente) a região, criando ou
 * atualizando o PerfilTorcedor. Valida que a Afiliacao existe.
 */
export async function salvarClubeRegiao(input: {
  afiliacaoId: string
  regiao?: string
}): Promise<OnboardingActionState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { message: 'Você precisa estar logado.' }
  }

  const parsed = clubeRegiaoSchema.safeParse(input)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { afiliacaoId, regiao } = parsed.data

  const afiliacao = await db.afiliacao.findUnique({
    where: { id: afiliacaoId },
    select: { id: true },
  })
  if (!afiliacao) {
    return { errors: { afiliacaoId: ['Clube não encontrado'] } }
  }

  await db.perfilTorcedor.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, afiliacaoId, regiao },
    update: { afiliacaoId, regiao },
  })

  return { ok: true }
}

// ─── 2. Concluir como torcedor global (sem torcida) ─────────────────────────────

/**
 * Marca o onboarding como concluído para um torcedor global (não pertence a
 * nenhuma torcida da plataforma). Redireciona para a comunidade.
 */
export async function concluirComoTorcedor(): Promise<OnboardingActionState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { message: 'Você precisa estar logado.' }
  }

  await db.perfilTorcedor.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, onboardingConcluidoEm: new Date() },
    update: { onboardingConcluidoEm: new Date() },
  })

  redirect('/portal/comunidade')
}

// ─── 3. Solicitar vínculo com uma torcida (sócio ou torcedor da torcida) ─────────

const solicitarVinculoSchema = z.object({
  tenantId: z.string().uuid('Torcida inválida'),
  tipo: z.enum(['SOCIO', 'TORCEDOR'], { message: 'Escolha um tipo de vínculo' }),
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  idade: z
    .union([z.string(), z.number(), z.undefined()])
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .pipe(z.number().min(10, 'Idade mínima: 10 anos').max(120, 'Idade inválida').optional()),
  telefone: z
    .string()
    .max(20)
    .optional()
    .transform((v) => v?.trim() || undefined),
  cidade: z
    .string()
    .max(60)
    .optional()
    .transform((v) => v?.trim() || undefined),
  numeroAssociado: z
    .string()
    .max(40)
    .optional()
    .transform((v) => v?.trim() || undefined),
  imagemProva: z
    .string()
    .url('Envie uma foto da carteirinha ou comprovante de vínculo'),
  // Sem `.uuid()`: sede/departamento podem ter IDs não-UUID (dados legados/seed,
  // ex.: "sede-principal-pde"). A existência é validada contra o banco abaixo —
  // esse é o guard real; o formato UUID travava vínculos válidos.
  departamentoId: z
    .string()
    .max(64)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  sedeId: z
    .string()
    .max(64)
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export type SolicitarVinculoInput = z.input<typeof solicitarVinculoSchema>

/**
 * Cria (ou reenvia, se REPROVADO) um SaasMembro PENDENTE no tenant escolhido,
 * reaproveitando a lógica de dedup / re-tentativa / AuditLog do fluxo de cadastro.
 * Também marca o onboarding do PerfilTorcedor como concluído. Para SOCIO com
 * departamento informado, associa via UserDepartamento. Redireciona para a
 * comunidade (a tela de pendência já existe lá).
 */
export async function solicitarVinculo(
  input: SolicitarVinculoInput,
): Promise<OnboardingActionState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { message: 'Você precisa estar logado.' }
  }
  const userId = session.user.id

  const parsed = solicitarVinculoSchema.safeParse(input)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }
  const data = parsed.data

  const tenant = await db.tenant.findFirst({
    where: { id: data.tenantId, ativo: true },
    select: { id: true, slug: true, nome: true },
  })
  if (!tenant) {
    return { message: 'Torcida não encontrada.' }
  }

  const dadosMembro = {
    nome: data.nome,
    tipo: data.tipo,
    idade: data.idade,
    telefone: data.telefone,
    cidade: data.cidade,
    numeroAssociado: data.numeroAssociado,
    imagemProva: data.imagemProva,
    sedeId: undefined as string | undefined,
  }

  // Vínculo territorial: 1 sede → usa direto; várias → exige seleção válida.
  const sedesDoTenant: { id: string }[] = await db.sede.findMany({
    where: { tenantId: tenant.id, ativa: true },
    select: { id: true },
  })
  let sedeId: string | undefined
  if (sedesDoTenant.length === 1) {
    sedeId = sedesDoTenant[0].id
  } else if (sedesDoTenant.length > 1) {
    if (!data.sedeId || !sedesDoTenant.some((s) => s.id === data.sedeId)) {
      return { errors: { sedeId: ['Selecione sua unidade'] } }
    }
    sedeId = data.sedeId
  }
  dadosMembro.sedeId = sedeId

  // Valida departamento (se informado) pertence ao tenant.
  let departamentoId: string | undefined
  if (data.departamentoId) {
    const dep = await db.departamento.findFirst({
      where: { id: data.departamentoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!dep) {
      return { errors: { departamentoId: ['Departamento inválido'] } }
    }
    departamentoId = dep.id
  }

  const existing = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
    select: { id: true, status: true },
  })

  if (existing) {
    if (existing.status === 'APROVADO') {
      return { message: 'Você já é membro aprovado desta torcida.' }
    }
    if (existing.status === 'PENDENTE') {
      await db.saasMembro.update({
        where: { id: existing.id },
        data: {
          ...dadosMembro,
          status: 'PENDENTE',
        },
      })
    } else {
      // REPROVADO — permite nova tentativa (atualiza o registro).
      await db.saasMembro.update({
        where: { id: existing.id },
        data: {
          ...dadosMembro,
          status: 'PENDENTE',
          aprovadoPorId: null,
          aprovadoPorNome: null,
          aprovadoEm: null,
        },
      })
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          atorId: userId,
          acao: 'RECADASTRO_SOLICITADO',
          entidade: 'SaasMembro',
          entidadeId: existing.id,
        },
      })
    }
  } else {
    const novo = await db.saasMembro.create({
      data: {
        tenantId: tenant.id,
        userId,
        ...dadosMembro,
        status: 'PENDENTE',
      },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: userId,
        acao: 'CADASTRO_SOLICITADO',
        entidade: 'SaasMembro',
        entidadeId: novo.id,
      },
    })
  }

  // Departamento de atuação (só sócios) — idempotente.
  if (data.tipo === 'SOCIO' && departamentoId) {
    await db.userDepartamento.upsert({
      where: {
        userId_tenantId_departamentoId: {
          userId,
          tenantId: tenant.id,
          departamentoId,
        },
      },
      create: { userId, tenantId: tenant.id, departamentoId },
      update: {},
    })
  }

  // Conclui o onboarding (garante que o perfil exista).
  await db.perfilTorcedor.upsert({
    where: { userId },
    create: { userId, onboardingConcluidoEm: new Date() },
    update: { onboardingConcluidoEm: new Date() },
  })

  await setTenantContextSlug(tenant.slug)
  redirect(`/onboarding/solicitado?torcida=${encodeURIComponent(tenant.slug)}`)
  return { ok: true }
}
