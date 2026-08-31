'use server'

/**
 * Projetos de um departamento (campanhas, projetos contínuos, ações,
 * parcerias). Mesma autorização das áreas — `assertPodeGerirDepartamento`:
 * `roles:manage` ∪ gestor daquele departamento (SA operador = só leitura).
 *
 * Projeto NÃO concede permissão: `responsavelId` e participantes são
 * accountability e organização, nunca RBAC.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import {
  calculateEffectivePermissions,
  canManageDepartamento,
  hasPermission,
  isMembroElegivelDepartamento,
  janelaCampanhaDoAno,
  parseDataCompetencia,
  ProjetoFormSchema,
  slugCampanhaDoAno,
  slugifyProjeto,
  statusInicialCampanhaDoAno,
  StatusProjetoSchema,
  tituloCampanhaDoAno,
  PERMISSIONS,
  hrefHomeDepartamento,
} from '@torcida/types'
import { getAreasEfetivadasPorUser } from '@/lib/get-areas-efetivadas'
import { notificarSafe } from '@/lib/notificacoes'

export type ActionState = { ok?: boolean; error?: string }

const IdSchema = z.string().min(1)

async function assertPodeGerirDepartamento(departamentoId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await getTenantFromHost()
  if (!tenant) throw new Error('Não autorizado')

  // SA operador = só leitura; gestão exige RBAC/gestor real (dual-hat ok).
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  if (hasPermission(effective, PERMISSIONS.ROLES_MANAGE)) return { session, tenant }

  const gestao: Array<{ departamentoId: string }> = await db.departamentoGestor.findMany({
    where: { userId: session.user.id, departamento: { tenantId: tenant.id } },
    select: { departamentoId: true },
  })
  if (
    !canManageDepartamento(
      effective,
      gestao.map((g) => g.departamentoId),
      departamentoId,
    )
  ) {
    throw new Error('Sem permissão')
  }
  return { session, tenant }
}

/** O departamento é do tenant ativo — nunca confiar no id vindo do cliente. */
async function assertDepartamentoNoTenant(
  tenantId: string,
  departamentoId: string,
): Promise<{ id: string; nome: string; slug: string }> {
  const depto: { id: string; nome: string; slug: string } | null =
    await db.departamento.findFirst({
      where: { id: departamentoId, tenantId },
      select: { id: true, nome: true, slug: true },
    })
  if (!depto) throw new Error('Departamento não encontrado')
  return depto
}

type ProjetoEscopo = {
  id: string
  titulo: string
  slug: string
  departamentoId: string
  status: string
}

/** O projeto pertence ao departamento e ao tenant ativo. */
async function assertProjetoNoDepartamento(
  tenantId: string,
  departamentoId: string,
  projetoId: string,
): Promise<ProjetoEscopo> {
  const projeto: ProjetoEscopo | null = await db.projeto.findFirst({
    where: { id: projetoId, departamentoId, tenantId },
    select: { id: true, titulo: true, slug: true, departamentoId: true, status: true },
  })
  if (!projeto) throw new Error('Projeto não encontrado')
  return projeto
}

/** Área informada, quando houver, é do próprio departamento. */
async function resolverAreaDoDepartamento(
  tenantId: string,
  departamentoId: string,
  areaId: string,
): Promise<string | null> {
  if (!areaId) return null
  const area: { id: string } | null = await db.departamentoArea.findFirst({
    where: { id: areaId, departamentoId, tenantId },
    select: { id: true },
  })
  if (!area) throw new Error('Área não pertence a este departamento')
  return area.id
}

/**
 * Responsável e participantes saem da equipe do departamento — quem não está
 * no departamento não entra no projeto dele.
 */
async function assertNoDepartamento(
  tenantId: string,
  departamentoId: string,
  targetUserId: string,
): Promise<void> {
  const efetivadas = await getAreasEfetivadasPorUser(tenantId, [targetUserId])
  if (!efetivadas.get(targetUserId)?.has(departamentoId)) {
    throw new Error('A pessoa precisa estar no departamento antes de entrar no projeto')
  }

  type SaasMembroLite = {
    tenantId: string
    tipo: string
    status: string
    desligadoEm: Date | null
    espelhado: boolean
    membroOrigemId: string | null
  }
  const membro: SaasMembroLite | null = await db.saasMembro.findFirst({
    where: { tenantId, userId: targetUserId },
    select: {
      tenantId: true,
      tipo: true,
      status: true,
      desligadoEm: true,
      espelhado: true,
      membroOrigemId: true,
    },
  })
  if (!isMembroElegivelDepartamento(membro, tenantId)) {
    throw new Error('Sócio não está mais elegível para projetos deste departamento')
  }
}

function numeroOuNulo(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function lerFormulario(formData: FormData) {
  return ProjetoFormSchema.safeParse({
    titulo: formData.get('titulo'),
    descricao: formData.get('descricao'),
    tipo: formData.get('tipo'),
    status: formData.get('status'),
    areaId: formData.get('areaId'),
    inicio: formData.get('inicio'),
    fim: formData.get('fim'),
    recorrenteAnual: formData.get('recorrenteAnual') === 'on',
    metaQuantidade: numeroOuNulo(formData.get('metaQuantidade')),
    metaUnidade: formData.get('metaUnidade'),
    orcamentoPrevisto: numeroOuNulo(formData.get('orcamentoPrevisto')),
    responsavelId: formData.get('responsavelId'),
  })
}

/**
 * Abre a campanha do ano a partir de uma área sazonal: cria `Projeto` CAMPANHA
 * com `areaId`, janela do ano civil e `recorrenteAnual`. Idempotente por
 * `(departamentoId, slug = área-ano)` — não duplica nem cria evento.
 */
export async function abrirCampanhaDoAno(
  departamentoId: string,
  areaId: string,
  slugDepto: string,
  ano?: number,
): Promise<ActionState> {
  if (!IdSchema.safeParse(departamentoId).success || !IdSchema.safeParse(areaId).success) {
    return { error: 'Área inválida' }
  }

  const anoAlvo = Number.isInteger(ano) && (ano as number) >= 2000
    ? (ano as number)
    : new Date().getFullYear()

  try {
    const { session, tenant } = await assertPodeGerirDepartamento(departamentoId)
    const depto = await assertDepartamentoNoTenant(tenant.id, departamentoId)

    type AreaLite = {
      id: string
      nome: string
      slug: string
      ativa: boolean
      sazonal: boolean
      descricao: string | null
    }
    const area: AreaLite | null = await db.departamentoArea.findFirst({
      where: { id: areaId, departamentoId: depto.id, tenantId: tenant.id },
      select: {
        id: true,
        nome: true,
        slug: true,
        ativa: true,
        sazonal: true,
        descricao: true,
      },
    })
    if (!area) return { error: 'Área não encontrada neste departamento' }
    if (!area.ativa) return { error: 'Reative a área antes de abrir a campanha' }
    if (!area.sazonal) {
      return { error: 'Só áreas sazonais abrem campanha do ano por este atalho' }
    }

    const slug = slugCampanhaDoAno(area.slug, anoAlvo)
    const existente: { id: string; titulo: string } | null = await db.projeto.findFirst({
      where: { departamentoId: depto.id, slug },
      select: { id: true, titulo: true },
    })
    if (existente) {
      return { error: `Já existe ${existente.titulo} neste departamento.` }
    }

    const { inicio, fim } = janelaCampanhaDoAno(anoAlvo)
    const status = statusInicialCampanhaDoAno(anoAlvo)
    const titulo = tituloCampanhaDoAno(area.nome, anoAlvo)

    const projeto = await db.projeto.create({
      data: {
        tenantId: tenant.id,
        departamentoId: depto.id,
        areaId: area.id,
        titulo,
        slug,
        descricao: area.descricao,
        tipo: 'CAMPANHA',
        status,
        inicio,
        fim,
        recorrenteAnual: true,
        criadoPorId: session.user.id,
      },
      select: { id: true, titulo: true },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PROJETO_CAMPANHA_ANO_ABERTA',
        entidade: 'Projeto',
        entidadeId: projeto.id,
        detalhes: {
          titulo: projeto.titulo,
          departamentoId: depto.id,
          areaId: area.id,
          ano: anoAlvo,
          status,
        },
      },
    })

    revalidatePath(`/portal/departamentos/${slugDepto || depto.slug}`)
    revalidatePath('/admin/departamentos/projetos')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível abrir a campanha' }
  }
}

export async function criarProjeto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const departamentoId = String(formData.get('departamentoId') ?? '')
  const slugDepto = String(formData.get('slug') ?? '')
  if (!IdSchema.safeParse(departamentoId).success) return { error: 'Departamento inválido' }

  const parsed = lerFormulario(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const inicio = parseDataCompetencia(parsed.data.inicio)
  if (!inicio) return { error: 'Data de início inválida' }
  const fim = parsed.data.fim ? parseDataCompetencia(parsed.data.fim) : null
  if (parsed.data.fim && !fim) return { error: 'Data de término inválida' }
  if (fim && fim < inicio) return { error: 'O término não pode ser antes do início' }

  try {
    const { session, tenant } = await assertPodeGerirDepartamento(departamentoId)
    const depto = await assertDepartamentoNoTenant(tenant.id, departamentoId)
    const areaId = await resolverAreaDoDepartamento(
      tenant.id,
      depto.id,
      parsed.data.areaId ?? '',
    )

    if (parsed.data.responsavelId) {
      await assertNoDepartamento(tenant.id, depto.id, parsed.data.responsavelId)
    }

    const slug = slugifyProjeto(parsed.data.titulo)
    const existente: { id: string } | null = await db.projeto.findFirst({
      where: { departamentoId: depto.id, slug },
      select: { id: true },
    })
    if (existente) return { error: 'Já existe um projeto com esse nome neste departamento.' }

    const projeto = await db.projeto.create({
      data: {
        tenantId: tenant.id,
        departamentoId: depto.id,
        areaId,
        titulo: parsed.data.titulo,
        slug,
        descricao: parsed.data.descricao || null,
        tipo: parsed.data.tipo,
        status: parsed.data.status,
        inicio,
        fim,
        recorrenteAnual: parsed.data.recorrenteAnual,
        metaQuantidade: parsed.data.metaQuantidade,
        metaUnidade: parsed.data.metaUnidade || null,
        orcamentoPrevisto: parsed.data.orcamentoPrevisto,
        responsavelId: parsed.data.responsavelId || null,
        criadoPorId: session.user.id,
      },
      select: { id: true, titulo: true },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PROJETO_CRIADO',
        entidade: 'Projeto',
        entidadeId: projeto.id,
        detalhes: {
          titulo: projeto.titulo,
          departamentoId: depto.id,
          areaId,
          tipo: parsed.data.tipo,
          status: parsed.data.status,
        },
      },
    })

    revalidatePath(`/portal/departamentos/${slugDepto || depto.slug}`)
    revalidatePath('/admin/departamentos/projetos')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível criar o projeto' }
  }
}

export async function atualizarProjeto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const departamentoId = String(formData.get('departamentoId') ?? '')
  const projetoId = String(formData.get('projetoId') ?? '')
  const slugDepto = String(formData.get('slug') ?? '')
  if (!IdSchema.safeParse(departamentoId).success || !IdSchema.safeParse(projetoId).success) {
    return { error: 'Projeto inválido' }
  }

  const parsed = lerFormulario(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const inicio = parseDataCompetencia(parsed.data.inicio)
  if (!inicio) return { error: 'Data de início inválida' }
  const fim = parsed.data.fim ? parseDataCompetencia(parsed.data.fim) : null
  if (parsed.data.fim && !fim) return { error: 'Data de término inválida' }
  if (fim && fim < inicio) return { error: 'O término não pode ser antes do início' }

  try {
    const { session, tenant } = await assertPodeGerirDepartamento(departamentoId)
    const depto = await assertDepartamentoNoTenant(tenant.id, departamentoId)
    const projeto = await assertProjetoNoDepartamento(tenant.id, depto.id, projetoId)
    const areaId = await resolverAreaDoDepartamento(
      tenant.id,
      depto.id,
      parsed.data.areaId ?? '',
    )

    if (parsed.data.responsavelId) {
      await assertNoDepartamento(tenant.id, depto.id, parsed.data.responsavelId)
    }

    const novoSlug = slugifyProjeto(parsed.data.titulo)
    if (novoSlug !== projeto.slug) {
      const colisao: { id: string } | null = await db.projeto.findFirst({
        where: { departamentoId: depto.id, slug: novoSlug, id: { not: projeto.id } },
        select: { id: true },
      })
      if (colisao) return { error: 'Já existe um projeto com esse nome neste departamento.' }
    }

    await db.projeto.update({
      where: { id: projeto.id },
      data: {
        areaId,
        titulo: parsed.data.titulo,
        slug: novoSlug,
        descricao: parsed.data.descricao || null,
        tipo: parsed.data.tipo,
        status: parsed.data.status,
        inicio,
        fim,
        recorrenteAnual: parsed.data.recorrenteAnual,
        metaQuantidade: parsed.data.metaQuantidade,
        metaUnidade: parsed.data.metaUnidade || null,
        orcamentoPrevisto: parsed.data.orcamentoPrevisto,
        responsavelId: parsed.data.responsavelId || null,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PROJETO_ATUALIZADO',
        entidade: 'Projeto',
        entidadeId: projeto.id,
        detalhes: {
          de: { titulo: projeto.titulo, status: projeto.status },
          para: { titulo: parsed.data.titulo, status: parsed.data.status },
          areaId,
        },
      },
    })

    revalidatePath(`/portal/departamentos/${slugDepto || depto.slug}`)
    revalidatePath('/admin/departamentos/projetos')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível salvar o projeto' }
  }
}

const StatusSchema = z.object({
  departamentoId: IdSchema,
  projetoId: IdSchema,
  slug: z.string(),
  status: StatusProjetoSchema,
})

export async function atualizarStatusProjeto(
  departamentoId: string,
  projetoId: string,
  slugDepto: string,
  status: string,
): Promise<ActionState> {
  const parsed = StatusSchema.safeParse({ departamentoId, projetoId, slug: slugDepto, status })
  if (!parsed.success) return { error: 'Status inválido' }

  try {
    const { session, tenant } = await assertPodeGerirDepartamento(parsed.data.departamentoId)
    const depto = await assertDepartamentoNoTenant(tenant.id, parsed.data.departamentoId)
    const projeto = await assertProjetoNoDepartamento(tenant.id, depto.id, parsed.data.projetoId)

    if (projeto.status === parsed.data.status) return { ok: true }

    await db.projeto.update({
      where: { id: projeto.id },
      data: { status: parsed.data.status },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PROJETO_STATUS_ALTERADO',
        entidade: 'Projeto',
        entidadeId: projeto.id,
        detalhes: { titulo: projeto.titulo, de: projeto.status, para: parsed.data.status },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug || depto.slug}`)
    revalidatePath('/admin/departamentos/projetos')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível mudar o status' }
  }
}

const RealizadoSchema = z.object({
  departamentoId: IdSchema,
  projetoId: IdSchema,
  slug: z.string(),
  realizado: z.number().int().min(0).max(10_000_000),
})

/** Atualiza quanto a campanha já alcançou (ex.: 6.200 de 10.000 atendidos). */
export async function registrarRealizadoProjeto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = RealizadoSchema.safeParse({
    departamentoId: String(formData.get('departamentoId') ?? ''),
    projetoId: String(formData.get('projetoId') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    realizado: numeroOuNulo(formData.get('realizado')) ?? -1,
  })
  if (!parsed.success) return { error: 'Informe um número válido' }

  try {
    const { session, tenant } = await assertPodeGerirDepartamento(parsed.data.departamentoId)
    const depto = await assertDepartamentoNoTenant(tenant.id, parsed.data.departamentoId)
    const projeto = await assertProjetoNoDepartamento(tenant.id, depto.id, parsed.data.projetoId)

    await db.projeto.update({
      where: { id: projeto.id },
      data: { realizadoQuantidade: parsed.data.realizado },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PROJETO_REALIZADO_ATUALIZADO',
        entidade: 'Projeto',
        entidadeId: projeto.id,
        detalhes: { titulo: projeto.titulo, realizado: parsed.data.realizado },
      },
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug || depto.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível registrar' }
  }
}

const ParticipanteSchema = z.object({
  departamentoId: IdSchema,
  projetoId: IdSchema,
  slug: z.string(),
  targetUserId: IdSchema,
})

export async function adicionarParticipanteProjeto(
  departamentoId: string,
  projetoId: string,
  slugDepto: string,
  targetUserId: string,
): Promise<ActionState> {
  const parsed = ParticipanteSchema.safeParse({
    departamentoId,
    projetoId,
    slug: slugDepto,
    targetUserId,
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirDepartamento(parsed.data.departamentoId)
    const depto = await assertDepartamentoNoTenant(tenant.id, parsed.data.departamentoId)
    const projeto = await assertProjetoNoDepartamento(tenant.id, depto.id, parsed.data.projetoId)
    await assertNoDepartamento(tenant.id, depto.id, parsed.data.targetUserId)

    await db.projetoParticipante.upsert({
      where: {
        projetoId_userId: { projetoId: projeto.id, userId: parsed.data.targetUserId },
      },
      create: { projetoId: projeto.id, userId: parsed.data.targetUserId },
      update: {},
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PROJETO_PARTICIPANTE_ADICIONADO',
        entidade: 'Projeto',
        entidadeId: projeto.id,
        detalhes: { titulo: projeto.titulo, userId: parsed.data.targetUserId },
      },
    })

    await notificarSafe({
      userId: parsed.data.targetUserId,
      tenantId: tenant.id,
      tipo: 'DEPARTAMENTO_ADICIONADO',
      titulo: `Você entrou no projeto ${projeto.titulo}`,
      corpo: 'Você foi incluído na equipe deste projeto.',
      link: hrefHomeDepartamento(parsed.data.slug || depto.slug, 'projetos'),
      atorId: session.user.id,
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug || depto.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível adicionar' }
  }
}

export async function removerParticipanteProjeto(
  departamentoId: string,
  projetoId: string,
  slugDepto: string,
  targetUserId: string,
): Promise<ActionState> {
  const parsed = ParticipanteSchema.safeParse({
    departamentoId,
    projetoId,
    slug: slugDepto,
    targetUserId,
  })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirDepartamento(parsed.data.departamentoId)
    const depto = await assertDepartamentoNoTenant(tenant.id, parsed.data.departamentoId)
    const projeto = await assertProjetoNoDepartamento(tenant.id, depto.id, parsed.data.projetoId)

    await db.projetoParticipante.deleteMany({
      where: { projetoId: projeto.id, userId: parsed.data.targetUserId },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PROJETO_PARTICIPANTE_REMOVIDO',
        entidade: 'Projeto',
        entidadeId: projeto.id,
        detalhes: { titulo: projeto.titulo, userId: parsed.data.targetUserId },
      },
    })

    await notificarSafe({
      userId: parsed.data.targetUserId,
      tenantId: tenant.id,
      tipo: 'DEPARTAMENTO_REMOVIDO',
      titulo: `Você saiu do projeto ${projeto.titulo}`,
      corpo: 'Você não faz mais parte da equipe deste projeto.',
      link: hrefHomeDepartamento(parsed.data.slug || depto.slug, 'projetos'),
      atorId: session.user.id,
    })

    revalidatePath(`/portal/departamentos/${parsed.data.slug || depto.slug}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível remover' }
  }
}

/**
 * Candidatos ao projeto: quem está no departamento e ainda não participa.
 * Espelha `buscarCandidatosArea`.
 */
export async function buscarCandidatosProjeto(
  departamentoId: string,
  projetoId: string,
  query: string,
): Promise<Array<{ id: string; nome: string | null; email: string; nickname: string | null }>> {
  const entrada = z
    .object({ departamentoId: IdSchema, projetoId: IdSchema, query: z.string().trim().min(2) })
    .safeParse({ departamentoId, projetoId, query })
  if (!entrada.success) return []

  const { tenant } = await assertPodeGerirDepartamento(entrada.data.departamentoId)

  const projeto: { id: string } | null = await db.projeto.findFirst({
    where: {
      id: entrada.data.projetoId,
      departamentoId: entrada.data.departamentoId,
      tenantId: tenant.id,
    },
    select: { id: true },
  })
  if (!projeto) return []

  const jaNoProjeto: Array<{ userId: string }> = await db.projetoParticipante.findMany({
    where: { projetoId: projeto.id },
    select: { userId: true },
  })
  const excluir = new Set(jaNoProjeto.map((p) => p.userId))

  const q = entrada.data.query
  const membrosDepto: Array<{
    user: { id: string; nome: string | null; email: string; nickname: string | null }
  }> = await db.userDepartamento.findMany({
    where: {
      departamentoId: entrada.data.departamentoId,
      tenantId: tenant.id,
      user: {
        OR: [
          { nome: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { nickname: { contains: q, mode: 'insensitive' } },
        ],
      },
    },
    take: 12,
    select: { user: { select: { id: true, nome: true, email: true, nickname: true } } },
  })

  return membrosDepto.map((m) => m.user).filter((u) => !excluir.has(u.id))
}
