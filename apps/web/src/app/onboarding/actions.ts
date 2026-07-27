'use server'

import { auth } from '@/lib/auth'
import { db, Prisma } from '@torcida/db'
import { z } from 'zod'
import {
  getAfiliacoesParaOnboarding,
  getTorcidasPorAfiliacao,
  getSedesDaTorcidaOnboarding,
  getDepartamentosDoTenant,
  UFS_BRASIL,
  type AfiliacaoOnboarding,
  type TorcidaOnboarding,
  type DepartamentoOnboarding,
  type SedeOnboarding,
} from '@/lib/onboarding'
import { getDescendantTenantIds } from '@/lib/hierarquia'
import { listarMunicipiosPorUf, cidadePertenceUf } from '@/lib/municipios-ibge'
import { clearTenantContextSlug } from '@/lib/tenant-context'
import {
  criarOuAtualizarPendenciaEspelhoNaSede,
  type MembroParaEspelho,
} from '@/lib/membros-sede'
import { isExpectedError } from '@/lib/expected-error'
import { notificarNovoMembroPendente } from '@/lib/notificacoes-routing'
import { notificarUsuariosComPermissao } from '@/lib/notificacoes'
import {
  isDepartamentoLegado,
  normalizarCpf,
  normalizarRg,
  validarCpfDigitos,
  validarRg,
  parseDataCompetencia,
  PERMISSIONS,
} from '@torcida/types'

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

/** Unidades da torcida (Caso A + Caso B) — usado no polling do passo Unidade. */
export async function buscarSedesDaTorcida(tenantId: string): Promise<SedeOnboarding[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  if (!z.string().uuid().safeParse(tenantId).success) return []
  return getSedesDaTorcidaOnboarding(tenantId)
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
  /**
   * Navegação no cliente (`window.location` / router). Evita `redirect()` na
   * Server Action — em produção o App Router re-renderiza o destino no mesmo
   * flight e qualquer falha vira digest genérico após o vínculo já gravado.
   */
  redirectTo?: string
}

/**
 * next/react-server-dom-webpack pode serializar `undefined`/`null` em strings
 * sentinela (ex.: "$undefined"). Isso bagunça Zod (campos opcionais passam a
 * ser strings literais) e pode provocar erro no Prisma.
 *
 * Normalizamos esses sentinelas para valores reais antes de validar.
 */
function coerceFlightSentinels<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = { ...input }
  for (const [k, v] of Object.entries(out)) {
    if (v === '$undefined') out[k] = undefined
    else if (v === '$null') out[k] = null
  }
  return out as T
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

  return { ok: true, redirectTo: '/portal/comunidade' }
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
  // ─── LGE / cadastro completo (2026-07): coletado direto no onboarding ────────
  // Obrigatória só para SOCIO (checado no `.superRefine` abaixo).
  dataNascimento: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  sexo: z
    .string()
    .max(40)
    .optional()
    .transform((v) => v?.trim() || undefined),
  estadoCivil: z
    .string()
    .max(40)
    .optional()
    .transform((v) => v?.trim() || undefined),
  nacionalidade: z
    .string()
    .max(40)
    .optional()
    .transform((v) => v?.trim() || undefined),
  // Obrigatório só para SOCIO — exigência aplicada no `.superRefine` abaixo.
  // Mesma regra de `AtualizarMembroLgeSchema` / `validarRg` + `normalizarRg`.
  rg: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .superRefine((v, ctx) => {
      if (!v) return
      if (!validarRg(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'RG inválido' })
      }
    })
    .transform((v) => (v ? (normalizarRg(v) ?? undefined) : undefined)),
  // Obrigatório só para SOCIO — exigência aplicada no `.superRefine` abaixo.
  cpf: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .superRefine((v, ctx) => {
      if (!v) return
      const n = normalizarCpf(v)
      if (!n || !validarCpfDigitos(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CPF inválido' })
      }
    })
    .transform((v) => (v ? (normalizarCpf(v) ?? undefined) : undefined)),
  nomePai: z
    .string()
    .max(100)
    .optional()
    .transform((v) => v?.trim() || undefined),
  nomeMae: z
    .string()
    .max(100)
    .optional()
    .transform((v) => v?.trim() || undefined),
  profissao: z
    .string()
    .max(100)
    .optional()
    .transform((v) => v?.trim() || undefined),
  // Endereço — obrigatórios só para SOCIO (mesmo padrão de `cep`).
  logradouro: z
    .string()
    .max(160)
    .optional()
    .transform((v) => v?.trim() || undefined),
  bairro: z
    .string()
    .max(100)
    .optional()
    .transform((v) => v?.trim() || undefined),
  uf: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined))
    .refine((v) => v === undefined || /^[A-Z]{2}$/.test(v), 'UF inválida'),
  // Documentos de identidade/residência — obrigatoriedade depende de
  // Tenant.exigirDocumentosCadastro (default true); checado após carregar o tenant.
  fotoDocumentoUrl: z.string().url().optional(),
  comprovanteResidenciaUrl: z.string().url().optional(),
  // Responsável legal — obrigatório só quando SOCIO é menor de idade.
  responsavelNome: z
    .string()
    .max(100)
    .optional()
    .transform((v) => v?.trim() || undefined),
  responsavelDocumento: z
    .string()
    .max(30)
    .optional()
    .transform((v) => v?.trim() || undefined),
  termoResponsabilidadeAceito: z.boolean().optional(),
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
  if (!data.logradouro) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['logradouro'],
      message: 'Informe seu endereço',
    })
  }
  if (!data.bairro) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bairro'],
      message: 'Informe seu bairro',
    })
  }
  if (!data.uf) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['uf'],
      message: 'Informe o estado',
    })
  }
  if (!data.rg) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rg'],
      message: 'Informe seu RG',
    })
  }
  if (!data.cpf) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cpf'],
      message: 'Informe seu CPF',
    })
  }
  let nascimento: Date | null = null
  if (!data.dataNascimento) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataNascimento'],
      message: 'Informe sua data de nascimento',
    })
  } else {
    nascimento = parseDataCompetencia(data.dataNascimento)
    if (!nascimento || nascimento > new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataNascimento'],
        message: 'Data de nascimento inválida',
      })
      nascimento = null
    } else if (calcularIdadeAnos(nascimento) < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataNascimento'],
        message: 'Idade mínima: 6 anos',
      })
    }
  }
  if (nascimento && calcularIdadeAnos(nascimento) < 18) {
    if (!data.responsavelNome) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['responsavelNome'],
        message: 'Informe o nome do responsável legal',
      })
    }
    if (!data.responsavelDocumento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['responsavelDocumento'],
        message: 'Informe o documento do responsável legal',
      })
    }
  }
  if (data.termoResponsabilidadeAceito !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['termoResponsabilidadeAceito'],
      message: 'É necessário aceitar o termo de responsabilidade',
    })
  }
})

/** Idade em anos completos na data atual, a partir da data de nascimento. */
function calcularIdadeAnos(nascimento: Date): number {
  const hoje = new Date()
  let idade = hoje.getFullYear() - nascimento.getFullYear()
  const aindaNaoFezAniversario =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate())
  if (aindaNaoFezAniversario) idade -= 1
  return idade
}

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
  endereco: z.string().trim().min(5, 'Informe o endereço completo').max(160),
  cep: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 8, 'Informe um CEP válido (8 dígitos)')
    .transform((v) => `${v.slice(0, 5)}-${v.slice(5)}`),
  lat: z
    .number()
    .nullable()
    .optional()
    .refine((n) => n == null || (n >= -90 && n <= 90), 'Latitude inválida'),
  lng: z
    .number()
    .nullable()
    .optional()
    .refine((n) => n == null || (n >= -180 && n <= 180), 'Longitude inválida'),
  mapsUrl: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined)),
  fotoUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
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
  cep?: string
  lat?: number | null
  lng?: number | null
  mapsUrl?: string
  fotoUrl?: string
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

  let lat = parsed.data.lat ?? null
  let lng = parsed.data.lng ?? null
  // Fallback: link curto do Maps pode falhar no client; resolve no servidor.
  if ((lat == null || lng == null) && parsed.data.mapsUrl) {
    const { resolveCoordsFromGoogleMapsLink } = await import('@/lib/google-maps')
    const coords = await resolveCoordsFromGoogleMapsLink(parsed.data.mapsUrl)
    if (coords) {
      lat = coords.lat
      lng = coords.lng
    }
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
      endereco: parsed.data.endereco,
      regiao: parsed.data.regiao ?? null,
      cep: parsed.data.cep,
      lat,
      lng,
      fotoUrl: parsed.data.fotoUrl ?? null,
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
    `Endereço: ${parsed.data.endereco}`,
    `CEP: ${parsed.data.cep}`,
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
        endereco: parsed.data.endereco,
        cep: parsed.data.cep,
        lat,
        lng,
        fotoUrl: parsed.data.fotoUrl ?? null,
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

  await notificarUsuariosComPermissao(PERMISSIONS.AFFILIATION_MANAGE, {
    tenantId: tenant.id,
    tipo: 'SOLICITACAO_UNIDADE_CRIADA',
    titulo: `Nova solicitação de unidade: ${parsed.data.nomeUnidade}`,
    corpo: `${parsed.data.contatoNome} solicitou cadastro de ${tipoLabel.toLowerCase()} via onboarding.`,
    link: '/admin/afiliacoes',
    atorId: session.user.id,
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

  const parsed = solicitarVinculoSchema.safeParse(
    coerceFlightSentinels(input as unknown as Record<string, unknown>),
  )
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }
  const data = parsed.data

  try {
    const tenant = await db.tenant.findFirst({
      where: { id: data.tenantId, ativo: true },
      select: { id: true, slug: true, nome: true, exigirDocumentosCadastro: true },
    })
    if (!tenant) {
      return { message: 'Torcida não encontrada.' }
    }

    if (data.tipo === 'SOCIO' && tenant.exigirDocumentosCadastro) {
      const docErrors: Record<string, string[]> = {}
      if (!data.fotoDocumentoUrl) {
        docErrors.fotoDocumentoUrl = ['Envie a foto do RG']
      }
      if (!data.comprovanteResidenciaUrl) {
        docErrors.comprovanteResidenciaUrl = ['Envie o comprovante de residência']
      }
      if (Object.keys(docErrors).length > 0) {
        return { errors: docErrors }
      }
    }

    // `nomePai`/`nomeMae` não viram coluna própria — concatenam em `filiacao`.
    const partesFiliacao: string[] = []
    if (data.nomePai) partesFiliacao.push(`Pai: ${data.nomePai}`)
    if (data.nomeMae) partesFiliacao.push(`Mãe: ${data.nomeMae}`)
    const filiacao = partesFiliacao.length > 0 ? partesFiliacao.join(' · ') : undefined

    const dataNascimento = data.dataNascimento ? parseDataCompetencia(data.dataNascimento) : null
    const menorDeIdade = dataNascimento
      ? (() => {
          const hoje = new Date()
          let idade = hoje.getFullYear() - dataNascimento.getFullYear()
          const aindaNaoFezAniversario =
            hoje.getMonth() < dataNascimento.getMonth() ||
            (hoje.getMonth() === dataNascimento.getMonth() && hoje.getDate() < dataNascimento.getDate())
          if (aindaNaoFezAniversario) idade -= 1
          return idade < 18
        })()
      : false

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
      // LGE / cadastro completo (2026-07)
      dataNascimento: dataNascimento ?? undefined,
      sexo: data.sexo,
      estadoCivil: data.estadoCivil,
      nacionalidade: data.nacionalidade,
      rg: data.rg,
      cpf: data.cpf,
      filiacao,
      profissao: data.profissao,
      logradouro: data.logradouro,
      bairro: data.bairro,
      uf: data.uf,
      fotoDocumentoUrl: data.fotoDocumentoUrl,
      comprovanteResidenciaUrl: data.comprovanteResidenciaUrl,
      responsavelNome: menorDeIdade ? data.responsavelNome : undefined,
      responsavelDocumento: menorDeIdade ? data.responsavelDocumento : undefined,
      autorizacaoMenorAceitaEm:
        menorDeIdade && data.responsavelNome && data.responsavelDocumento ? new Date() : undefined,
      termoResponsabilidadeAceitoEm: data.termoResponsabilidadeAceito ? new Date() : undefined,
      sedeId: undefined as string | undefined,
      departamentoId: null as string | null,
    }

    // Vínculo territorial: worktree (Caso A + Caso B). Se a sede for de um
    // tenant-filho promovido, o SaasMembro nasce lá (origem canônica da fila
    // compartilhada) — o espelho na Sede é criado depois via fan-out.
    const sedesWorktree = await getSedesDaTorcidaOnboarding(tenant.id)
    let sedeId: string | undefined
    if (sedesWorktree.length === 1) {
      sedeId = sedesWorktree[0].id
    } else if (sedesWorktree.length > 1) {
      if (data.unidadeNaoListada) {
        sedeId = undefined
      } else if (!data.sedeId || !sedesWorktree.some((s) => s.id === data.sedeId)) {
        return { errors: { sedeId: ['Selecione sua unidade'] } }
      } else {
        sedeId = data.sedeId
      }
    }
    dadosMembro.sedeId = sedeId

    let tenantDestino = tenant
    if (sedeId) {
      const sedeEscolhida: { tenantId: string | null; ativa: boolean } | null =
        await db.sede.findUnique({
          where: { id: sedeId },
          select: { tenantId: true, ativa: true },
        })
      if (!sedeEscolhida?.ativa || !sedeEscolhida.tenantId) {
        return { errors: { sedeId: ['Unidade inválida ou inativa'] } }
      }
      if (sedeEscolhida.tenantId !== tenant.id) {
        const descendentes = await getDescendantTenantIds(tenant.id)
        if (!descendentes.includes(sedeEscolhida.tenantId)) {
          return { errors: { sedeId: ['Unidade não pertence a esta torcida'] } }
        }
        const filho: { id: string; slug: string; nome: string } | null =
          await db.tenant.findFirst({
            where: { id: sedeEscolhida.tenantId, ativo: true },
            select: { id: true, slug: true, nome: true },
          })
        if (!filho) {
          return { errors: { sedeId: ['Portal da unidade indisponível'] } }
        }
        tenantDestino = filho
      }
    }

    // Valida departamento (se informado) no tenant do vínculo. Preferência apenas —
    // não cria membership até o admin aprovar (aprovarMembro).
    let departamentoId: string | null = null
    if (data.tipo === 'SOCIO' && data.departamentoId) {
      const dep: { id: string; slug: string; nome: string } | null =
        await db.departamento.findFirst({
          where: { id: data.departamentoId, tenantId: tenantDestino.id },
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
      where: { tenantId_userId: { tenantId: tenantDestino.id, userId } },
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
            tenantId: tenantDestino.id,
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
          tenantId: tenantDestino.id,
          userId,
          ...dadosMembro,
          status: statusInicial,
        },
      })
      await db.auditLog.create({
        data: {
          tenantId: tenantDestino.id,
          atorId: userId,
          acao: 'CADASTRO_SOLICITADO',
          entidade: 'SaasMembro',
          entidadeId: novo.id,
        },
      })
    }

    // Conclui o onboarding (garante que o perfil exista) ANTES do fan-out /
    // notificações — se o espelho falhar, o sócio já está na fila da unidade.
    await db.perfilTorcedor.upsert({
      where: { userId },
      create: { userId, onboardingConcluidoEm: new Date() },
      update: { onboardingConcluidoEm: new Date() },
    })

    // Torcedor entra APROVADO e seu perfil social deve ser público na torcida escolhida.
    // Criamos (ou reforçamos) PerfilMembro para não depender de interações futuras.
    if (data.tipo === 'TORCEDOR') {
      await db.perfilMembro.upsert({
        where: { userId_tenantId: { userId, tenantId: tenantDestino.id } },
        create: { userId, tenantId: tenantDestino.id, perfilPrivado: false },
        update: { perfilPrivado: false },
      })
    }

    // Avisa o solicitante do fluxo até a aprovação — só SOCIO fica PENDENTE
    // (TORCEDOR já nasce APROVADO, sem fila). Caso B: fan-out da pendência
    // para a Sede raiz (fila compartilhada; first-wins na decisão).
    // Best-effort: falha aqui NÃO pode impedir a tela de sucesso — o vínculo
    // canônico na unidade já foi gravado.
    if (statusInicial === 'PENDENTE') {
      try {
        const membroOrigem: MembroParaEspelho | null = await db.saasMembro.findUnique({
          where: { tenantId_userId: { tenantId: tenantDestino.id, userId } },
          select: {
            id: true,
            userId: true,
            tipo: true,
            nome: true,
            idade: true,
            telefone: true,
            cidade: true,
            numeroAssociado: true,
            anosSocio: true,
            cep: true,
            numero: true,
            bloco: true,
            complemento: true,
            imagemProva: true,
            rg: true,
            cpf: true,
            filiacao: true,
            escolaridade: true,
            profissao: true,
            dataNascimento: true,
            sexo: true,
            estadoCivil: true,
            nacionalidade: true,
            logradouro: true,
            bairro: true,
            uf: true,
            fotoDocumentoUrl: true,
            comprovanteResidenciaUrl: true,
            responsavelNome: true,
            responsavelDocumento: true,
            autorizacaoMenorAceitaEm: true,
            termoResponsabilidadeAceitoEm: true,
          },
        })

        let sedeRaizId: string | null = null
        if (membroOrigem && data.tipo === 'SOCIO') {
          const fanout = await db.$transaction(async (tx: Prisma.TransactionClient) =>
            criarOuAtualizarPendenciaEspelhoNaSede(tx, {
              tenantOrigemId: tenantDestino.id,
              membro: membroOrigem,
              atorId: userId,
            }),
          )
          if (fanout.espelhoId && fanout.raizTenantId) {
            sedeRaizId = fanout.raizTenantId
          }
        }

        await notificarNovoMembroPendente({
          tenantId: tenantDestino.id,
          tenantNome: tenantDestino.nome,
          solicitanteUserId: userId,
          solicitanteNome: data.nome,
          tipoVinculo: data.tipo,
        })

        if (sedeRaizId) {
          const sedeNome: { nome: string } | null = await db.tenant.findFirst({
            where: { id: sedeRaizId },
            select: { nome: true },
          })
          await notificarNovoMembroPendente({
            tenantId: sedeRaizId,
            tenantNome: sedeNome?.nome ?? 'Sede',
            solicitanteUserId: userId,
            solicitanteNome: data.nome,
            tipoVinculo: data.tipo,
            notificarSolicitante: false,
            corpoAdmin: `${data.nome} solicitou ingresso como sócio em ${tenantDestino.nome}. A Sede também pode aprovar ou recusar.`,
          })
        }
      } catch (err) {
        if (isExpectedError(err)) {
          console.warn(
            '[solicitarVinculo] fan-out/notificação:',
            err instanceof Error ? err.message : err,
          )
        } else {
          console.error('[solicitarVinculo] fan-out/notificação falhou após vínculo gravado', err)
        }
      }
    }

    // Nunca fixa cookie de torcida aqui — SOCIO recém-solicitado ainda está
    // PENDENTE e não deve acessar a comunidade da torcida, só a Comunidade
    // Nacional do clube, até a diretoria aprovar (resolveUserTenantSlugForUser
    // só resolve tenant pra SOCIO APROVADO). Limpa explicitamente pra não
    // herdar um cookie de uma tentativa anterior.
    await clearTenantContextSlug()
    return {
      ok: true,
      redirectTo: `/onboarding/solicitado?torcida=${encodeURIComponent(tenantDestino.slug)}`,
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = err.meta?.target
      const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '')
      if (targetStr.includes('cpf')) {
        return { message: 'Este CPF já está cadastrado. Verifique seus dados ou use outra conta.' }
      }
      if (targetStr.includes('userId') || targetStr.includes('tenantId')) {
        return { message: 'Já existe um cadastro para este vínculo. Tente novamente ou aguarde a aprovação.' }
      }
    }
    console.error('[solicitarVinculo] erro ao concluir vínculo', err)
    return { message: 'Não foi possível concluir seu onboarding agora. Aguarde e tente novamente.' }
  }
}
