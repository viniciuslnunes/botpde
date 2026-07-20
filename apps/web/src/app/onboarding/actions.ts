'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  getAfiliacoesParaOnboarding,
  getTorcidasPorAfiliacao,
  getDepartamentosDoTenant,
  UFS_BRASIL,
  type AfiliacaoOnboarding,
  type TorcidaOnboarding,
  type DepartamentoOnboarding,
} from '@/lib/onboarding'
import { listarMunicipiosPorUf, cidadePertenceUf } from '@/lib/municipios-ibge'
import { clearTenantContextSlug } from '@/lib/tenant-context'
import { notificarNovoMembroPendente } from '@/lib/notificacoes-routing'
import { isDepartamentoLegado } from '@torcida/types'

// ─── Leituras auxiliares (chamadas pelo wizard entre passos) ────────────────────

export async function buscarAfiliacoes(
  busca?: string,
  uf?: string,
): Promise<AfiliacaoOnboarding[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  return getAfiliacoesParaOnboarding(busca, uf)
}

export async function buscarTorcidas(afiliacaoId: string): Promise<TorcidaOnboarding[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  if (!z.string().uuid().safeParse(afiliacaoId).success) return []
  return getTorcidasPorAfiliacao(afiliacaoId)
}

export async function buscarCidadesDaUf(uf: string): Promise<string[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const ufUpper = uf.toUpperCase()
  if (!UFS_BRASIL.includes(ufUpper)) return []
  return listarMunicipiosPorUf(ufUpper)
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
  emailHref?: string
}

function getSuperAdminEmails(): string[] {
  return process.env.SUPER_ADMIN_EMAILS
    ? process.env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)
    : []
}

// ─── 1. Clube + região ─────────────────────────────────────────────────────────

const clubeRegiaoSchema = z.object({
  afiliacaoId: z.string().uuid('Clube inválido'),
  uf: z
    .string()
    .length(2, 'Estado inválido')
    .transform((v) => v.toUpperCase())
    .refine((v) => UFS_BRASIL.includes(v), 'Estado inválido'),
  cidade: z
    .string()
    .min(2, 'Informe a cidade')
    .max(120)
    .transform((v) => v.trim()),
})

/**
 * Salva o clube que o usuário torce e a região (UF + cidade, obrigatórias),
 * criando ou atualizando o PerfilTorcedor. Valida que a Afiliacao existe e que
 * a cidade pertence à UF segundo o IBGE — só aceita seleção da lista.
 */
export async function salvarClubeRegiao(input: {
  afiliacaoId: string
  uf: string
  cidade: string
}): Promise<OnboardingActionState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { message: 'Você precisa estar logado.' }
  }

  const parsed = clubeRegiaoSchema.safeParse(input)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { afiliacaoId, uf, cidade } = parsed.data

  const afiliacao = await db.afiliacao.findUnique({
    where: { id: afiliacaoId },
    select: { id: true },
  })
  if (!afiliacao) {
    return { errors: { afiliacaoId: ['Clube não encontrado'] } }
  }

  const cidadeCanonica = await cidadePertenceUf(cidade, uf)
  if (!cidadeCanonica) {
    return {
      errors: { cidade: ['Selecione uma cidade válida da lista para o estado escolhido.'] },
    }
  }

  const regiao = `${cidadeCanonica} - ${uf}`

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

  // Limpa cookie de contexto de tentativa anterior (ex.: usuário já tinha
  // fixado uma torcida específica) — torcedor global cai na Comunidade Nacional.
  await clearTenantContextSlug()

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
    .transform((v) => v?.trim() || undefined)
    .refine((v) => v === undefined || /^\(\d{2}\) \d{4,5}-\d{4}$/.test(v), 'Telefone inválido'),
  cidade: z
    .string()
    .max(60)
    .optional()
    .transform((v) => v?.trim() || undefined),
  // Obrigatório só para SOCIO (checado no `.superRefine` abaixo).
  cep: z
    .string()
    .trim()
    .regex(/^\d{5}-?\d{3}$/, 'CEP inválido')
    .optional(),
  numero: z
    .string()
    .max(60)
    .optional()
    .transform((v) => v?.trim() || undefined),
  bloco: z
    .string()
    .max(60)
    .optional()
    .transform((v) => v?.trim() || undefined),
  complemento: z
    .string()
    .max(60)
    .optional()
    .transform((v) => v?.trim() || undefined),
  // Obrigatório só para SOCIO (checado no `.superRefine` abaixo). Só dígitos —
  // nenhuma torcida na base passa de 6 dígitos hoje; 7 dá folga sem abrir mão
  // do formato numérico que o funil de aprovação usa para conferência.
  numeroAssociado: z
    .string()
    .trim()
    .max(7, 'Máximo 7 dígitos')
    .regex(/^\d*$/, 'Use só números')
    .optional()
    .transform((v) => v || undefined),
  // Obrigatório só para SOCIO — exigência aplicada no `.superRefine` abaixo.
  anosSocio: z
    .union([z.string(), z.number(), z.undefined()])
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .pipe(z.number().min(0, 'Valor inválido').max(100, 'Valor inválido').optional()),
  // Obrigatória só para SOCIO — exigência aplicada no `.superRefine` abaixo.
  // Torcedor da torcida entra sem comprovante (spec-onboarding §vínculo).
  imagemProva: z
    .string()
    .url('Envie uma foto da carteirinha ou comprovante de vínculo')
    .optional(),
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
  unidadeNaoListada: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.tipo !== 'SOCIO') return
  if (!data.imagemProva) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['imagemProva'],
      message: 'Envie uma foto da carteirinha ou comprovante de vínculo',
    })
  }
  if (!data.numeroAssociado) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['numeroAssociado'],
      message: 'Informe seu número de associado',
    })
  }
  if (data.anosSocio === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['anosSocio'],
      message: 'Informe há quantos anos é sócio',
    })
  }
  if (!data.cep) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cep'],
      message: 'Informe seu CEP',
    })
  }
})

export type SolicitarVinculoInput = z.input<typeof solicitarVinculoSchema>

const interesseUnidadeSchema = z.object({
  tenantId: z.string().uuid('Torcida inválida'),
  regiao: z
    .string()
    .max(120)
    .optional()
    .transform((v) => v?.trim() || undefined),
  nomeUnidade: z
    .string()
    .min(3, 'Informe o nome da unidade')
    .max(100)
    .transform((v) => v.trim()),
  tipoUnidade: z.enum(['SUBSEDE', 'PONTO_ENCONTRO'], {
    message: 'Informe se é subsede ou ponto de encontro',
  }),
  cidade: z
    .string()
    .min(2, 'Informe a cidade')
    .max(80)
    .transform((v) => v.trim()),
  estado: z
    .string()
    .min(2, 'Informe a UF')
    .max(2, 'Use a sigla do estado')
    .transform((v) => v.trim().toUpperCase()),
  endereco: z
    .string()
    .max(160)
    .optional()
    .transform((v) => v?.trim() || undefined),
  contatoNome: z
    .string()
    .min(3, 'Informe seu nome')
    .max(100)
    .transform((v) => v.trim()),
  contatoEmail: z
    .string()
    .email('E-mail inválido')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  contatoTelefone: z
    .string()
    .max(30)
    .optional()
    .transform((v) => v?.trim() || undefined),
  vinculo: z
    .string()
    .min(20, 'Explique o vínculo da unidade com a sede da torcida')
    .max(1200)
    .transform((v) => v.trim()),
  provasUrls: z.array(z.string().url()).max(5).default([]),
  observacao: z
    .string()
    .max(800)
    .optional()
    .transform((v) => v?.trim() || undefined),
}).refine((data) => data.contatoEmail || data.contatoTelefone, {
  message: 'Informe e-mail ou telefone para retorno',
  path: ['contatoEmail'],
})

/**
 * Registra interesse em cadastrar subsede/PDE ausente no onboarding.
 * A liderança local pode comprovar vínculo com a sede para inclusão na base.
 */
export async function registrarInteresseUnidade(input: {
  tenantId: string
  regiao?: string
  nomeUnidade?: string
  tipoUnidade?: 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade?: string
  estado?: string
  endereco?: string
  contatoNome?: string
  contatoEmail?: string
  contatoTelefone?: string
  vinculo?: string
  provasUrls?: string[]
  observacao?: string
}): Promise<OnboardingActionState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { message: 'Você precisa estar logado.' }
  }

  const parsed = interesseUnidadeSchema.safeParse(input)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const tenant = await db.tenant.findFirst({
    where: { id: parsed.data.tenantId, ativo: true },
    select: { id: true, nome: true },
  })
  if (!tenant) {
    return { message: 'Torcida não encontrada.' }
  }

  // Persiste a solicitação como fila gerenciável (super-admin / presidente).
  // O e-mail abaixo continua como notificação de conveniência.
  const solicitacao = await db.solicitacaoUnidade.create({
    data: {
      tenantId: tenant.id,
      nome: parsed.data.nomeUnidade,
      tipo: parsed.data.tipoUnidade,
      cidade: parsed.data.cidade,
      estado: parsed.data.estado,
      endereco: parsed.data.endereco ?? null,
      regiao: parsed.data.regiao ?? null,
      contatoNome: parsed.data.contatoNome,
      contatoEmail: parsed.data.contatoEmail ?? null,
      contatoTelefone: parsed.data.contatoTelefone ?? null,
      vinculo: parsed.data.vinculo,
      observacao: parsed.data.observacao ?? null,
      provasUrls: parsed.data.provasUrls,
      solicitadoPorId: session.user.id,
    },
    select: { id: true },
  })

  const assunto = `[Onboarding] Unidade não listada — ${parsed.data.nomeUnidade} (${tenant.nome})`
  const tipoLabel = parsed.data.tipoUnidade === 'SUBSEDE' ? 'Subsede' : 'Ponto de encontro'
  const superAdminEmails = getSuperAdminEmails()
  const linhasEmail = [
    `Nova solicitação de cadastro de unidade afiliada no onboarding.`,
    '',
    `Torcida: ${tenant.nome}`,
    `Unidade: ${parsed.data.nomeUnidade}`,
    `Tipo: ${tipoLabel}`,
    `Região informada no onboarding: ${parsed.data.regiao ?? 'não informada'}`,
    `Local: ${parsed.data.cidade} - ${parsed.data.estado}`,
    `Endereço: ${parsed.data.endereco ?? 'não informado'}`,
    '',
    `Contato para retorno:`,
    `Nome: ${parsed.data.contatoNome}`,
    `E-mail: ${parsed.data.contatoEmail ?? 'não informado'}`,
    `Telefone/WhatsApp: ${parsed.data.contatoTelefone ?? 'não informado'}`,
    '',
    `Vínculo e credenciamento:`,
    parsed.data.vinculo,
    '',
    `Observações:`,
    parsed.data.observacao ?? 'sem observações',
    '',
    `Provas/anexos:`,
    parsed.data.provasUrls.length > 0
      ? parsed.data.provasUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')
      : 'nenhuma imagem anexada',
    '',
    `Usuário solicitante: ${session.user.email ?? session.user.name ?? session.user.id}`,
  ]
  const emailHref =
    superAdminEmails.length > 0
      ? `mailto:${encodeURIComponent(superAdminEmails.join(','))}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(linhasEmail.join('\n'))}`
      : undefined

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'UNIDADE_CADASTRO_SOLICITADO',
      entidade: 'SolicitacaoUnidade',
      entidadeId: solicitacao.id,
      detalhes: {
        regiao: parsed.data.regiao ?? null,
        nomeUnidade: parsed.data.nomeUnidade,
        tipoUnidade: parsed.data.tipoUnidade,
        cidade: parsed.data.cidade,
        estado: parsed.data.estado,
        endereco: parsed.data.endereco ?? null,
        contatoNome: parsed.data.contatoNome,
        contatoEmail: parsed.data.contatoEmail ?? null,
        contatoTelefone: parsed.data.contatoTelefone ?? null,
        vinculo: parsed.data.vinculo,
        provasUrls: parsed.data.provasUrls,
        observacao: parsed.data.observacao ?? null,
        emailDestinatarios: superAdminEmails,
        origem: 'onboarding',
      },
    },
  })

  return { ok: true, emailHref }
}

/**
 * Cria (ou reenvia, se REPROVADO) um SaasMembro PENDENTE no tenant escolhido,
 * reaproveitando a lógica de dedup / re-tentativa / AuditLog do fluxo de cadastro.
 * Também marca o onboarding do PerfilTorcedor como concluído. Para SOCIO com
 * departamento informado, grava só a preferência em SaasMembro.departamentoId —
 * UserDepartamento / perfil de área só após aprovação do admin.
 * Redireciona para a tela de pendência.
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
    cep: data.cep,
    numero: data.numero,
    bloco: data.bloco,
    complemento: data.complemento,
    numeroAssociado: data.numeroAssociado,
    anosSocio: data.anosSocio,
    imagemProva: data.imagemProva,
    sedeId: undefined as string | undefined,
    departamentoId: null as string | null,
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
    if (data.unidadeNaoListada) {
      sedeId = undefined
    } else if (!data.sedeId || !sedesDoTenant.some((s) => s.id === data.sedeId)) {
      return { errors: { sedeId: ['Selecione sua unidade'] } }
    } else {
      sedeId = data.sedeId
    }
  }
  dadosMembro.sedeId = sedeId

  // Valida departamento (se informado) pertence ao tenant. Preferência apenas —
  // não cria membership até o admin aprovar (aprovarMembro).
  let departamentoId: string | null = null
  if (data.tipo === 'SOCIO' && data.departamentoId) {
    const dep: { id: string; slug: string; nome: string } | null =
      await db.departamento.findFirst({
        where: { id: data.departamentoId, tenantId: tenant.id },
        select: { id: true, slug: true, nome: true },
      })
    if (!dep || isDepartamentoLegado(dep)) {
      return { errors: { departamentoId: ['Departamento inválido'] } }
    }
    departamentoId = dep.id
  }
  dadosMembro.departamentoId = departamentoId

  // TORCEDOR entra sem fila de aprovação (copy do wizard: "entrada imediata,
  // sem aprovação nem comprovante") — só não abre tenant próprio no portal
  // (resolveUserTenantSlugForUser filtra tipo: 'SOCIO'), cai na Comunidade
  // Nacional do clube. Só SOCIO passa pela fila de aprovação do admin.
  const statusInicial = data.tipo === 'SOCIO' ? 'PENDENTE' : 'APROVADO'

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
          status: statusInicial,
        },
      })
    } else {
      // REPROVADO — permite nova tentativa (atualiza o registro).
      await db.saasMembro.update({
        where: { id: existing.id },
        data: {
          ...dadosMembro,
          status: statusInicial,
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
        status: statusInicial,
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

  // Conclui o onboarding (garante que o perfil exista).
  await db.perfilTorcedor.upsert({
    where: { userId },
    create: { userId, onboardingConcluidoEm: new Date() },
    update: { onboardingConcluidoEm: new Date() },
  })

  // Torcedor entra APROVADO e seu perfil social deve ser público na torcida escolhida.
  // Criamos (ou reforçamos) PerfilMembro para não depender de interações futuras.
  if (data.tipo === 'TORCEDOR') {
    await db.perfilMembro.upsert({
      where: { userId_tenantId: { userId, tenantId: tenant.id } },
      create: { userId, tenantId: tenant.id, perfilPrivado: false },
      update: { perfilPrivado: false },
    })
  }

  // Avisa o solicitante do fluxo até a aprovação — só SOCIO fica PENDENTE
  // (TORCEDOR já nasce APROVADO, sem fila).
  if (statusInicial === 'PENDENTE') {
    await notificarNovoMembroPendente({
      tenantId: tenant.id,
      tenantNome: tenant.nome,
      solicitanteUserId: userId,
      solicitanteNome: data.nome,
      tipoVinculo: data.tipo,
    })
  }

  // Nunca fixa cookie de torcida aqui — SOCIO recém-solicitado ainda está
  // PENDENTE e não deve acessar a comunidade da torcida, só a Comunidade
  // Nacional do clube, até a diretoria aprovar (resolveUserTenantSlugForUser
  // só resolve tenant pra SOCIO APROVADO). Limpa explicitamente pra não
  // herdar um cookie de uma tentativa anterior.
  await clearTenantContextSlug()
  redirect(`/onboarding/solicitado?torcida=${encodeURIComponent(tenant.slug)}`)
  return { ok: true }
}
