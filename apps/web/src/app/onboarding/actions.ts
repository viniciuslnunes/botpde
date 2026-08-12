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
import { getDescendantTenantIds, getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import {
  listarMunicipiosPorUf,
  cidadePertenceUf,
  buscarMunicipiosBrasil,
  type MunicipioBrasil,
} from '@/lib/municipios-ibge'
import { clearTenantContextSlug, setTenantContextSlug } from '@/lib/tenant-context'
import { lerSlugConviteDoCookie, limparSlugConviteCookie } from '@/lib/convite-cookie-server'
import { resolverAfiliacaoIdEfetiva, resolverConvite } from '@/lib/convite'
import {
  criarOuAtualizarPendenciaEspelhoNaSede,
  encontrarConflitoCpf,
  encontrarConflitoNumeroAssociado,
  encontrarConflitoRg,
  encontrarConflitoTelefone,
  estaBloqueadoNoTenant,
  lockNumeroAssociadoDaTorcida,
  resolverTenantRaizId,
  sincronizarSocioNaSedeRaiz,
  REPROVACAO_LIMPA,
  type MembroParaEspelho,
} from '@/lib/membros-sede'
import { diffCamposMembro, MEMBRO_DIFF_SELECT } from '@/lib/membro-audit-diff'
import { ExpectedError, isExpectedError } from '@/lib/expected-error'
import { notificarNovoMembroPendente } from '@/lib/notificacoes-routing'
import { notificarUsuariosComPermissao } from '@/lib/notificacoes'
import { vincularMembroCanaisAposAprovacao } from '@/lib/canais'
import {
  isDepartamentoLegado,
  maskTelefone,
  normalizarCpf,
  normalizarRg,
  normalizarTelefone,
  validarCpfDigitos,
  validarRg,
  validarTelefoneBr,
  parseDataCompetencia,
  PERMISSIONS,
  formatNomeTorcida,
  resolverPeriodicidadesOnboarding,
} from '@torcida/types'

/**
 * O vínculo de sócio toma o advisory lock do nº de associado da torcida e só
 * então checa unicidade de nº/CPF/RG/telefone na linhagem inteira. Numa
 * torcida grande (Gaviões: 700+ membros, 14 unidades) com o banco atrás do
 * proxy, os 5s de default do Prisma estouram e o solicitante recebe
 * "Aguarde e tente novamente" numa inscrição perfeitamente válida. Mesmo
 * remédio de `TRANSACAO_DECISAO_MEMBRO_OPTS` em `admin/membros/actions.ts`.
 */
const TRANSACAO_VINCULO_OPTS = { timeout: 20_000, maxWait: 10_000 }

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

const buscaRegiaoSchema = z.string().trim().min(2).max(60)

/** Busca cidade+UF para o combobox do passo Região. `uf` opcional restringe ao estado. */
export async function buscarRegioesPorTexto(
  query: string,
  uf?: string,
): Promise<MunicipioBrasil[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const parsed = buscaRegiaoSchema.safeParse(query)
  if (!parsed.success) return []
  const ufParsed =
    typeof uf === 'string' && UFS_BRASIL.includes(uf.trim().toUpperCase())
      ? uf.trim().toUpperCase()
      : undefined
  return buscarMunicipiosBrasil(parsed.data, 20, ufParsed)
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
 * Convite ativo (URL ou cookie) ⇒ o «torcedor global» vira torcedor DA UNIDADE.
 *
 * Devolve `null` quando não há convite utilizável — e aí o chamador segue com o
 * caminho global normal. Nunca lança: um convite quebrado não pode prender a
 * pessoa na última etapa do wizard.
 */
async function tentarVincularTorcedorPorConvite(
  slugInformado: string | undefined,
  nomeDaSessao: string,
): Promise<OnboardingActionState | null> {
  const slug = slugInformado ?? (await lerSlugConviteDoCookie())
  if (!slug) return null

  // `nome` tem mínimo de 3 caracteres no schema do vínculo. Conta social sem
  // nome utilizável cai no caminho global em vez de falhar o onboarding.
  const nome = nomeDaSessao.trim()
  if (nome.length < 3) return null

  try {
    const convite = await resolverConvite(slug)
    if (!convite) return null

    const res = await solicitarVinculo({
      tenantId: convite.tenantId,
      tipo: 'TORCEDOR',
      nome,
      sedeId: convite.unidadeId ?? undefined,
      unidadeNaoListada: convite.unidadeId ? undefined : true,
      conviteSlug: slug,
    })
    // Recusa legítima (bloqueio da diretoria, unidade inativa): a pessoa não
    // pode ficar presa no wizard por causa do atalho — segue como torcedor
    // global, que é exatamente o que este botão prometia.
    if (!res.ok) {
      console.warn('[concluirComoTorcedor] convite não gerou vínculo', {
        slug,
        motivo: res.message ?? res.errors,
      })
      return null
    }
    return res
  } catch (err) {
    console.error('[concluirComoTorcedor] vínculo pelo convite falhou', err)
    return null
  }
}

/**
 * Marca o onboarding como concluído para um torcedor global (não pertence a
 * nenhuma torcida da plataforma). Redireciona para a comunidade.
 *
 * **Quem chegou por convite nunca sai global.** O card «sou só torcedor do
 * clube» é o botão mais destacado do passo Torcida, e quando o contexto do
 * convite sobrevive só no cookie (o `?convite=` se perdeu num elo do login) a
 * pessoa terminava sem `SaasMembro` nenhum — invisível na unidade e na Sede,
 * sem nada para espelhar. Com convite resolvível, este caminho delega a
 * `solicitarVinculo` com `tipo: 'TORCEDOR'` na unidade convidada, que é o
 * fluxo que grava o vínculo e sincroniza o espelho na Sede raiz.
 *
 * A checagem é no SERVIDOR de propósito: o cliente pode não ter o slug, e a
 * regra "convite ⇒ vínculo" não pode depender da UI ter acertado.
 */
export async function concluirComoTorcedor(
  conviteSlugInformado?: string,
): Promise<OnboardingActionState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { message: 'Você precisa estar logado.' }
  }

  const vinculado = await tentarVincularTorcedorPorConvite(
    conviteSlugInformado,
    session.user.name ?? '',
  )
  if (vinculado) return vinculado

  await db.perfilTorcedor.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, onboardingConcluidoEm: new Date() },
    update: { onboardingConcluidoEm: new Date() },
  })

  // Limpa cookie de contexto de tentativa anterior (ex.: usuário já tinha
  // fixado uma torcida específica) — torcedor global cai na Comunidade Nacional.
  await clearTenantContextSlug()
  await limparSlugConviteCookie()

  return { ok: true, redirectTo: '/portal/comunidade' }
}

/**
 * O wizard já montou com o convite resolvido (URL/estado): descarta o cookie
 * de curto prazo para não reaplicar o atalho num onboarding futuro na mesma aba.
 */
export async function consumirConviteCookie(): Promise<void> {
  await limparSlugConviteCookie()
}

// ─── 3. Solicitar vínculo com uma torcida (sócio ou torcedor da torcida) ─────────

const solicitarVinculoSchema = z.object({
  tenantId: z.string().uuid('Torcida inválida'),
  tipo: z.enum(['SOCIO', 'TORCEDOR'], { message: 'Escolha um tipo de vínculo' }),
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  idade: z
    .union([z.string(), z.number(), z.undefined()])
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .pipe(z.number().min(6, 'Idade mínima: 6 anos').max(120, 'Idade inválida').optional()),
  telefone: z
    .string()
    .max(20)
    .optional()
    .transform((v) => v?.trim() || undefined)
    .superRefine((v, ctx) => {
      if (!v) return
      if (!validarTelefoneBr(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Telefone inválido' })
      }
    })
    .transform((v) => (v ? maskTelefone(v) || undefined : undefined)),
  // Contato da conta — obrigatório para SOCIO; unicidade global em User.email.
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v.toLowerCase() : undefined))
    .superRefine((v, ctx) => {
      if (!v) return
      if (!z.string().email().safeParse(v).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'E-mail inválido' })
      }
    }),
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
  // Área pretendida na SEDE quando o vínculo nasce numa unidade promovida a
  // tenant próprio (Caso B). `Departamento` é por tenant: a área na unidade vai
  // em `departamentoId`, a da Sede aqui. Rejeitada se o vínculo já nasce na raiz.
  departamentoSedeId: z
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
  /**
   * Slug do link `/convite/<slug>` que trouxe a pessoa, quando houve um.
   * Decide se o SOCIO PENDENTE entra no canal da unidade enquanto espera a
   * aprovação (ARCHITECTURE.md §7 22): quem chegou pela vitrine pública fica
   * só na Comunidade Nacional do clube até a diretoria decidir.
   *
   * É **procedência declarada pelo cliente**, então nunca vale sozinha — o
   * servidor confere abaixo que o slug resolve para a linhagem do tenant do
   * vínculo. Sem essa checagem, bastaria mandar qualquer string para ganhar
   * acesso antecipado ao canal.
   */
  conviteSlug: z
    .string()
    .trim()
    .max(64)
    .optional()
    .or(z.literal('').transform(() => undefined)),
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
  // EXISTENTE = já tem nº/carteirinha; NOVO = primeira associação (sem nº).
  caminhoSocio: z.enum(['EXISTENTE', 'NOVO']).optional(),
  // Data de expedição da carteirinha física (só EXISTENTE).
  dataExpedicaoCarteirinha: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  // Periodicidade do plano pretendido (só EXISTENTE).
  periodicidadePretendida: z
    .enum(['MENSAL', 'TRIMESTRAL', 'QUADRIMENSAL', 'SEMESTRAL', 'ANUAL', 'UNICA'])
    .optional(),
}).superRefine((data, ctx) => {
  if (data.tipo !== 'SOCIO') return
  const caminho = data.caminhoSocio ?? 'EXISTENTE'
  if (!data.caminhoSocio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['caminhoSocio'],
      message: 'Escolha se você já é sócio ou quer se associar',
    })
  }
  if (caminho === 'EXISTENTE') {
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
    if (!data.dataExpedicaoCarteirinha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataExpedicaoCarteirinha'],
        message: 'Informe a data da última expedição da carteirinha',
      })
    } else {
      const exp = parseDataCompetencia(data.dataExpedicaoCarteirinha)
      if (!exp || exp > new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dataExpedicaoCarteirinha'],
          message: 'A data da última expedição não pode ser futura',
        })
      }
    }
    if (!data.periodicidadePretendida) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodicidadePretendida'],
        message: 'Informe o plano (periodicidade) do seu associado',
      })
    }
  } else {
    // NOVO: sem nº/expedição/prova de carteirinha — ficha LGE na fila de emissão.
    if (data.numeroAssociado) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['numeroAssociado'],
        message: 'Quem ainda vai se associar não informa número — use «Já sou sócio»',
      })
    }
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
  if (!data.telefone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['telefone'],
      message: 'Informe seu telefone',
    })
  }
  if (!data.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['email'],
      message: 'Informe seu e-mail',
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

/** Marca o onboarding como concluído e fixa a afiliação resolvida do tenant. */
async function concluirPerfilTorcedor(
  userId: string,
  afiliacaoId: string | null,
): Promise<void> {
  await db.perfilTorcedor.upsert({
    where: { userId },
    create: {
      userId,
      onboardingConcluidoEm: new Date(),
      ...(afiliacaoId ? { afiliacaoId } : {}),
    },
    update: {
      onboardingConcluidoEm: new Date(),
      ...(afiliacaoId ? { afiliacaoId } : {}),
    },
  })
}

/**
 * Inscreve nos canais oficiais sem poder derrubar o onboarding: o vínculo
 * canônico já está gravado, e uma falha aqui (canal sem responsável, canal
 * emprestado no tenant da mãe) deixava o usuário preso na etapa de vínculo,
 * inclusive nas tentativas seguintes. `repair-*-canal-membro` cobre a sobra.
 */
/**
 * O link de convite realmente leva a esta torcida?
 *
 * Procedência é declarada pelo cliente, então precisa ser conferida contra o
 * banco: o slug tem de resolver para um tenant da **linhagem** do vínculo (a
 * própria unidade, a Sede, ou uma irmã do worktree — o convite da Sede raiz
 * leva a uma unidade filha, e isso é legítimo). Sem a checagem, mandar
 * qualquer string daria acesso antecipado ao canal.
 *
 * Cai no cookie (`lerSlugConviteDoCookie`) quando o wizard não repassou o
 * slug — ele o consome ao montar com o convite na URL.
 */
async function conviteAutorizaAcessoAntecipado(
  slugInformado: string | undefined,
  tenantVinculoId: string,
): Promise<boolean> {
  const slug = slugInformado ?? (await lerSlugConviteDoCookie())
  if (!slug) return false

  const tenantDoConvite: { id: string } | null = await db.tenant.findFirst({
    where: { conviteSlug: slug, conviteAtivo: true, ativo: true },
    select: { id: true },
  })
  if (!tenantDoConvite) return false
  if (tenantDoConvite.id === tenantVinculoId) return true

  const linhagem = await getTorcidaLineageTenantIds(tenantVinculoId)
  return linhagem.includes(tenantDoConvite.id)
}

async function vincularCanaisBestEffort(opts: {
  tenantId: string
  userId: string
  sedeId: string | null
  /** TORCEDOR entra só no canal da unidade — o da Sede é espaço de sócio. */
  tipo?: 'SOCIO' | 'TORCEDOR'
  /**
   * Barra o canal da Sede mesmo quando a unidade do convite **é** a Sede raiz
   * — caso em que "canal da unidade" e "canal da torcida" são a mesma
   * `Conversa` e a regra do tipo era burlada pela geometria (§7 17).
   */
  recusarCanalDaSede?: boolean
}): Promise<void> {
  try {
    await vincularMembroCanaisAposAprovacao({
      tenantId: opts.tenantId,
      userId: opts.userId,
      sedeId: opts.sedeId,
      fallbackCriadoPorId: opts.userId,
      tipo: opts.tipo,
      recusarCanalDaSede: opts.recusarCanalDaSede,
    })
  } catch (err) {
    if (isExpectedError(err)) {
      console.warn(
        '[solicitarVinculo] inscrição nos canais oficiais:',
        err instanceof Error ? err.message : err,
      )
    } else {
      console.error('[solicitarVinculo] inscrição nos canais oficiais falhou', err)
    }
  }
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
      select: {
        id: true,
        slug: true,
        nome: true,
        exigirDocumentosCadastro: true,
        periodicidadesOnboarding: true,
        afiliacaoId: true,
      },
    })
    if (!tenant) {
      return { message: 'Torcida não encontrada.' }
    }
    const afiliacaoIdEfetiva = await resolverAfiliacaoIdEfetiva(tenant.id, tenant.afiliacaoId)

    if (
      data.tipo === 'SOCIO' &&
      data.caminhoSocio === 'EXISTENTE' &&
      data.periodicidadePretendida
    ) {
      const permitidas = resolverPeriodicidadesOnboarding(tenant.periodicidadesOnboarding)
      if (!permitidas.includes(data.periodicidadePretendida)) {
        return {
          errors: {
            periodicidadePretendida: [
              'Esta periodicidade não está disponível nesta torcida',
            ],
          },
        }
      }
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
      numeroAssociado: data.caminhoSocio === 'NOVO' ? undefined : data.numeroAssociado,
      anosSocio: data.caminhoSocio === 'NOVO' ? undefined : data.anosSocio,
      imagemProva: data.caminhoSocio === 'NOVO' ? undefined : data.imagemProva,
      dataExpedicaoCarteirinha:
        data.caminhoSocio === 'EXISTENTE' && data.dataExpedicaoCarteirinha
          ? parseDataCompetencia(data.dataExpedicaoCarteirinha) ?? undefined
          : undefined,
      periodicidadePretendida:
        data.caminhoSocio === 'EXISTENTE' ? data.periodicidadePretendida : undefined,
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
      departamentoSedeId: null as string | null,
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

    // Área na SEDE: só existe quando o vínculo nasce num tenant-filho (Caso B).
    // Validada contra a RAIZ da hierarquia, não contra `tenantDestino`.
    let departamentoSedeId: string | null = null
    if (data.tipo === 'SOCIO' && data.departamentoSedeId) {
      const raizId = await resolverTenantRaizId(tenantDestino.id)
      if (raizId === tenantDestino.id) {
        return {
          errors: {
            departamentoSedeId: [
              'Você entrou direto pela sede — informe só o departamento pretendido.',
            ],
          },
        }
      }
      const depSede: { id: string; slug: string; nome: string } | null =
        await db.departamento.findFirst({
          where: { id: data.departamentoSedeId, tenantId: raizId },
          select: { id: true, slug: true, nome: true },
        })
      if (!depSede || isDepartamentoLegado(depSede)) {
        return { errors: { departamentoSedeId: ['Departamento da sede inválido'] } }
      }
      departamentoSedeId = depSede.id
    }
    dadosMembro.departamentoSedeId = departamentoSedeId

    // TORCEDOR entra sem fila (CN do clube). SOCIO fica PENDENTE e usa a CN +
    // unidade do convite como torcedor até a diretoria aprovar (sem aba da Sede).
    const statusInicial = data.tipo === 'SOCIO' ? 'PENDENTE' : 'APROVADO'

    const existing:
      | ({
          id: string
          status: string
          reprovadoPermiteReenvio: boolean
          sedeId: string | null
        } & Record<string, unknown>)
      | null = await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: tenantDestino.id, userId } },
      select: {
        id: true,
        status: true,
        reprovadoPermiteReenvio: true,
        ...MEMBRO_DIFF_SELECT,
      },
    })

    if (existing?.status === 'APROVADO') {
      // Também cura tentativas anteriores em que o vínculo foi persistido,
      // mas o provisionamento dos canais falhou depois da transação.
      // Best-effort: canal com problema não pode prender a pessoa no wizard.
      await vincularCanaisBestEffort({
        tenantId: tenantDestino.id,
        userId,
        sedeId: existing.sedeId,
        // Mesma leitura de `tipoExistente` abaixo: o vínculo já gravado manda,
        // e o do wizard só cobre o registro legado sem `tipo`.
        tipo:
          (typeof existing.tipo === 'string' ? existing.tipo : data.tipo) === 'TORCEDOR'
            ? 'TORCEDOR'
            : 'SOCIO',
      })
      // Já é membro: isso não é erro. Conclui o onboarding e segue para a
      // comunidade — antes o wizard travava na última etapa sem saída.
      await concluirPerfilTorcedor(userId, afiliacaoIdEfetiva)
      await limparSlugConviteCookie()
      const tipoExistente = typeof existing.tipo === 'string' ? existing.tipo : data.tipo
      if (tipoExistente === 'TORCEDOR') {
        await clearTenantContextSlug()
        return { ok: true, redirectTo: '/portal/comunidade?escopo=nacional' }
      }
      await setTenantContextSlug(tenantDestino.slug)
      return { ok: true, redirectTo: '/portal/comunidade' }
    }

    // Bloqueio da diretoria: barra o usuário mesmo sem cadastro anterior, e
    // herda da Sede para as unidades. Precede a checagem de reprovação porque
    // é uma decisão sobre a pessoa, não sobre esta solicitação.
    if (await estaBloqueadoNoTenant(userId, tenantDestino.id)) {
      return {
        message:
          'A diretoria bloqueou seu acesso a esta torcida. Novas solicitações não são aceitas. Fale com a diretoria.',
      }
    }

    // Reprovação definitiva: só um admin revertendo para PENDENTE reabre a fila.
    if (existing?.status === 'REPROVADO' && !existing.reprovadoPermiteReenvio) {
      return {
        message:
          'A diretoria encerrou a análise do seu cadastro nesta torcida e o reenvio está bloqueado. Fale com a torcida antes de tentar de novo.',
      }
    }

    // E-mail: formato já no Zod; conta com e-mail deve confirmar o mesmo;
    // conta sem e-mail (OAuth) grava o informado se estiver livre.
    if (data.tipo === 'SOCIO' && data.email) {
      const emailNorm = data.email.trim().toLowerCase()
      const sessionEmail = session.user.email?.trim().toLowerCase() ?? null
      if (sessionEmail) {
        if (sessionEmail !== emailNorm) {
          return {
            errors: {
              email: [
                'Use o e-mail da sua conta. Para alterá-lo, ajuste o perfil depois do cadastro.',
              ],
            },
          }
        }
      } else {
        const emailEmUso: { id: string } | null = await db.user.findFirst({
          where: {
            email: { equals: emailNorm, mode: 'insensitive' },
            id: { not: userId },
          },
          select: { id: true },
        })
        if (emailEmUso) {
          return { errors: { email: ['Este e-mail já está em uso por outra conta.'] } }
        }
        await db.user.update({
          where: { id: userId },
          data: { email: emailNorm },
        })
      }
    }

    // Sócio: lock + unicidade de nº/CPF/RG/telefone na mesma transaction —
    // impede race e garante que identidade nunca entre duplicada na lineage.
    try {
      await db.$transaction(async (tx: Prisma.TransactionClient) => {
        if (data.tipo === 'SOCIO') {
          await lockNumeroAssociadoDaTorcida(tx, tenantDestino.id)

          if (data.numeroAssociado) {
            const conflitoNumero = await encontrarConflitoNumeroAssociado(tx, {
              tenantOrigemId: tenantDestino.id,
              userId,
              numeroAssociado: data.numeroAssociado,
              excludeMembroId: existing?.id,
            })
            if (conflitoNumero) {
              throw new ExpectedError(
                `Número de associado ${data.numeroAssociado} já está em uso nesta torcida.`,
                { field: 'numeroAssociado' },
              )
            }
          }

          if (data.cpf) {
            const conflitoCpf = await encontrarConflitoCpf(tx, {
              tenantOrigemId: tenantDestino.id,
              userId,
              cpf: data.cpf,
              excludeMembroId: existing?.id,
            })
            if (conflitoCpf) {
              throw new ExpectedError('Este CPF já está cadastrado nesta torcida.', {
                field: 'cpf',
              })
            }
          }

          if (data.rg) {
            const conflitoRg = await encontrarConflitoRg(tx, {
              tenantOrigemId: tenantDestino.id,
              userId,
              rg: data.rg,
              excludeMembroId: existing?.id,
            })
            if (conflitoRg) {
              throw new ExpectedError('Este RG já está cadastrado nesta torcida.', {
                field: 'rg',
              })
            }
          }

          const telDigits = data.telefone ? normalizarTelefone(data.telefone) : null
          if (telDigits) {
            const conflitoTel = await encontrarConflitoTelefone(tx, {
              tenantOrigemId: tenantDestino.id,
              userId,
              telefoneDigits: telDigits,
              excludeMembroId: existing?.id,
            })
            if (conflitoTel) {
              throw new ExpectedError('Este telefone já está cadastrado nesta torcida.', {
                field: 'telefone',
              })
            }
          }
        }

        if (existing) {
          if (existing.status === 'PENDENTE') {
            await tx.saasMembro.update({
              where: { id: existing.id },
              data: {
                ...dadosMembro,
                status: statusInicial,
              },
            })
          } else {
            // REPROVADO — permite nova tentativa (atualiza o registro).
            await tx.saasMembro.update({
              where: { id: existing.id },
              data: {
                ...dadosMembro,
                status: statusInicial,
                aprovadoPorId: null,
                aprovadoPorNome: null,
                aprovadoEm: null,
                ...REPROVACAO_LIMPA,
              },
            })
            await tx.auditLog.create({
              data: {
                tenantId: tenantDestino.id,
                atorId: userId,
                acao: 'RECADASTRO_SOLICITADO',
                entidade: 'SaasMembro',
                entidadeId: existing.id,
                // O histórico do card mostra o que o solicitante corrigiu
                // depois da reprovação, não só que houve reenvio.
                detalhes: { alteracoes: diffCamposMembro(existing, dadosMembro) },
              },
            })
          }
        } else {
          const novo: { id: string } = await tx.saasMembro.create({
            data: {
              tenantId: tenantDestino.id,
              userId,
              ...dadosMembro,
              status: statusInicial,
            },
            select: { id: true },
          })
          await tx.auditLog.create({
            data: {
              tenantId: tenantDestino.id,
              atorId: userId,
              acao: 'CADASTRO_SOLICITADO',
              entidade: 'SaasMembro',
              entidadeId: novo.id,
            },
          })
        }
      }, TRANSACAO_VINCULO_OPTS)
    } catch (err) {
      if (isExpectedError(err)) {
        const field = err.field ?? 'numeroAssociado'
        return { errors: { [field]: [err.message] } }
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = err.meta?.target
        const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '')
        if (targetStr.toLowerCase().includes('cpf')) {
          return { errors: { cpf: ['Este CPF já está cadastrado nesta torcida.'] } }
        }
        if (targetStr.toLowerCase().includes('email')) {
          return { errors: { email: ['Este e-mail já está em uso por outra conta.'] } }
        }
        return {
          message:
            'Não foi possível concluir: dados duplicados (CPF, e-mail ou vínculo). Confira o cadastro.',
        }
      }
      throw err
    }

    // Conclui o onboarding (garante que o perfil exista) ANTES do fan-out /
    // notificações — se o espelho falhar, o sócio já está na fila da unidade.
    // Grava afiliacaoId do tenant (ou ancestral): convite pula o passo Clube e
    // sem isso o portal caía no TENANT_SLUG do deploy.
    await concluirPerfilTorcedor(userId, afiliacaoIdEfetiva)

    // Torcedor entra APROVADO e seu perfil social deve ser público na torcida escolhida.
    // Criamos (ou reforçamos) PerfilMembro para não depender de interações futuras.
    if (data.tipo === 'TORCEDOR') {
      await db.perfilMembro.upsert({
        where: { userId_tenantId: { userId, tenantId: tenantDestino.id } },
        create: { userId, tenantId: tenantDestino.id, perfilPrivado: false },
        update: { perfilPrivado: false },
      })
      // Best-effort: o vínculo já está gravado e APROVADO. Um canal oficial
      // com problema (ex.: emprestado no tenant da mãe) não pode derrubar o
      // onboarding inteiro e prender a pessoa na última etapa do wizard.
      await vincularCanaisBestEffort({
        tenantId: tenantDestino.id,
        userId,
        sedeId: dadosMembro.sedeId ?? null,
        tipo: data.tipo === 'TORCEDOR' ? 'TORCEDOR' : 'SOCIO',
      })

      // Caso B: o registro na unidade espelha na Sede (quadro da diretoria).
      // Best-effort — falha não desfaz o vínculo na unidade nem a inscrição nos canais.
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
            dataExpedicaoCarteirinha: true,
            periodicidadePretendida: true,
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
            departamentoSedeId: true,
          },
        })
        if (membroOrigem) {
          await db.$transaction(async (tx: Prisma.TransactionClient) =>
            sincronizarSocioNaSedeRaiz(tx, {
              tenantOrigemId: tenantDestino.id,
              membro: membroOrigem,
              aprovadoPorUserId: userId,
              aprovadoPorNome: data.nome,
            }),
          )
        }
      } catch (err) {
        if (isExpectedError(err)) {
          console.warn(
            '[solicitarVinculo] espelho TORCEDOR na sede:',
            err instanceof Error ? err.message : err,
          )
        } else {
          console.error('[solicitarVinculo] espelho TORCEDOR na sede falhou', err)
        }
      }
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
            dataExpedicaoCarteirinha: true,
            periodicidadePretendida: true,
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
            departamentoSedeId: true,
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
          tenantNome: formatNomeTorcida(tenantDestino.nome),
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
            tenantNome: formatNomeTorcida(sedeNome?.nome ?? 'Sede'),
            solicitanteUserId: userId,
            solicitanteNome: data.nome,
            tipoVinculo: data.tipo,
            notificarSolicitante: false,
            corpoAdmin: `${data.nome} solicitou ingresso como sócio em ${formatNomeTorcida(tenantDestino.nome)}. A Sede também pode aprovar ou recusar.`,
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

    await limparSlugConviteCookie()

    if (data.tipo === 'TORCEDOR') {
      // Torcedor fica na Comunidade Nacional do clube (afiliacaoId), com aba
      // Minha unidade só para o canal do convite — não abre o portal de sócios.
      // Limpa cookie para não herdar TENANT_SLUG/contexto de outra torcida.
      await clearTenantContextSlug()
      return { ok: true, redirectTo: '/portal/comunidade?escopo=nacional' }
    }

    // Sócio pendente: mesma experiência de torcedor (CN + unidade) até a
    // aprovação. Não grava torcida_ctx — senão o portal abria a Sede (Gaviões)
    // sem vínculo.
    await clearTenantContextSlug()

    // ARCHITECTURE.md §7 22 — quem espera aprovação só acompanha o canal da
    // unidade se **chegou por um link de convite**. Pela vitrine pública, fica
    // na Comunidade Nacional do clube até a diretoria decidir. E em nenhum dos
    // dois casos vê a comunidade da torcida (canal da Sede) antes de aprovado —
    // é o que `vincularCanaisBestEffort` garante com `tipo: 'TORCEDOR'` +
    // `recusarCanalDaSede`.
    //
    // A entrada é de leitura: publicar no mural exige `assertMembroAtivo`
    // (status APROVADO), então o pendente lê e não escreve sem nenhum gate
    // extra.
    if (dadosMembro.sedeId && (await conviteAutorizaAcessoAntecipado(data.conviteSlug, tenantDestino.id))) {
      await vincularCanaisBestEffort({
        tenantId: tenantDestino.id,
        userId,
        sedeId: dadosMembro.sedeId,
        tipo: 'TORCEDOR',
        recusarCanalDaSede: true,
      })
    }
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
