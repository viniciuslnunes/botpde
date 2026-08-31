'use server'

/**
 * Fase 2–3: ativar/adiar fluxo do cockpit e gravar as 3 alavancas.
 * Materializa primitivas que já existem (Projeto, checklist de área, Evento).
 * Prefs em `Departamento.meta.fluxos`. Sem tabela nova, sem conceder permissão.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import {
  applyAreaChecklistModelo,
  calculateEffectivePermissions,
  canManageDepartamento,
  capabilityPorSlug,
  desfileEmFromMeta,
  FLUXO_ADIAR_DIAS,
  FLUXO_RECEITAS_ATIVAVEIS,
  FLUXO_RECEITAS_DO_PANEL,
  hasPermission,
  horizonteJogoDias,
  hrefHomeDepartamento,
  janelaCampanhaDoAno,
  lerFluxoPrefs,
  mergeAdiarFluxo,
  mergeReceitaFluxo,
  mergeValeFluxo,
  mesDisparaCampanha,
  PERMISSIONS,
  proximaDataEnsaio,
  slugCampanhaDoAno,
  statusInicialCampanhaDoAno,
  tituloCampanhaDoAno,
} from '@torcida/types'
import { getAfiliacaoIdDoTenant } from '@/lib/partidas'
import { listarEventosPorTipo } from '@/lib/eventos-tipo'

export type FluxoActionState = { ok?: boolean; error?: string; href?: string }

const IdSchema = z.string().min(1)
const ReceitaSchema = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/)

const EntradaSchema = z.object({
  departamentoId: IdSchema,
  slug: z.string().min(1).max(80),
  receitaId: ReceitaSchema,
})

async function assertPodeGerirDepartamento(departamentoId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Não autorizado')

  const tenant = await getTenantFromHost()
  if (!tenant) throw new Error('Não autorizado')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  if (hasPermission(effective, PERMISSIONS.ROLES_MANAGE)) {
    return { session, tenant, effective }
  }

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
  return { session, tenant, effective }
}

type DeptoFluxo = { id: string; nome: string; slug: string; meta: unknown }

async function assertDepartamentoNoTenant(
  tenantId: string,
  departamentoId: string,
): Promise<DeptoFluxo> {
  const depto: DeptoFluxo | null = await db.departamento.findFirst({
    where: { id: departamentoId, tenantId },
    select: { id: true, nome: true, slug: true, meta: true },
  })
  if (!depto) throw new Error('Departamento não encontrado')
  return depto
}

function podeCriarEvento(effective: string[]): boolean {
  return (
    hasPermission(effective, PERMISSIONS.EVENTS_CREATE) ||
    hasPermission(effective, PERMISSIONS.EVENTS_MANAGE)
  )
}

function revalidateFluxo(slug: string, eventoId?: string) {
  revalidatePath(hrefHomeDepartamento(slug))
  revalidatePath('/portal/eventos')
  revalidatePath('/admin/departamentos/projetos')
  if (eventoId) revalidatePath(`/portal/eventos/${eventoId}`)
}

export async function ativarFluxoDepartamento(
  departamentoId: string,
  slug: string,
  receitaId: string,
): Promise<FluxoActionState> {
  const parsed = EntradaSchema.safeParse({ departamentoId, slug, receitaId })
  if (!parsed.success) return { error: 'Dados inválidos' }
  if (!(parsed.data.receitaId in FLUXO_RECEITAS_ATIVAVEIS)) {
    return { error: 'Esta sugestão não se ativa — só navega.' }
  }

  try {
    const { session, tenant, effective } = await assertPodeGerirDepartamento(
      parsed.data.departamentoId,
    )
    const depto = await assertDepartamentoNoTenant(tenant.id, parsed.data.departamentoId)
    if (depto.slug !== parsed.data.slug) return { error: 'Departamento inválido' }
    const receita = FLUXO_RECEITAS_ATIVAVEIS[parsed.data.receitaId]
    if (receita?.precisaEvento && !podeCriarEvento(effective)) {
      return { error: 'Sem permissão para criar eventos' }
    }

    if (parsed.data.receitaId === 'campanha-do-ano') {
      return ativarCampanhaDoAno(session.user.id, tenant.id, depto)
    }
    if (parsed.data.receitaId === 'partida-fora-sem-caravana') {
      return ativarCaravanaDoJogo(session.user.id, tenant.id, depto)
    }
    if (parsed.data.receitaId === 'ensaio-da-semana') {
      return ativarEnsaioDaSemana(session.user.id, tenant.id, depto)
    }
    if (parsed.data.receitaId === 'escala-de-bandeira') {
      return ativarEscalaDeBandeira(session.user.id, tenant.id, depto)
    }
    if (parsed.data.receitaId === 'ensaios-de-rua') {
      return ativarEnsaiosDeRua(session.user.id, tenant.id, depto)
    }
    return { error: 'Receita desconhecida' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível ativar o fluxo' }
  }
}

export async function adiarFluxoDepartamento(
  departamentoId: string,
  slug: string,
  receitaId: string,
): Promise<FluxoActionState> {
  const parsed = EntradaSchema.safeParse({ departamentoId, slug, receitaId })
  if (!parsed.success) return { error: 'Dados inválidos' }

  try {
    const { session, tenant } = await assertPodeGerirDepartamento(parsed.data.departamentoId)
    const depto = await assertDepartamentoNoTenant(tenant.id, parsed.data.departamentoId)
    if (depto.slug !== parsed.data.slug) return { error: 'Departamento inválido' }
    const ate = new Date(Date.now() + FLUXO_ADIAR_DIAS * 24 * 60 * 60 * 1000)
    const nextMeta = mergeAdiarFluxo(depto.meta, parsed.data.receitaId, ate)

    await db.departamento.update({
      where: { id: depto.id },
      data: { meta: nextMeta },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPTO_FLUXO_ADIADO',
        entidade: 'Departamento',
        entidadeId: depto.id,
        detalhes: {
          receitaId: parsed.data.receitaId,
          ate: ate.toISOString(),
          dias: FLUXO_ADIAR_DIAS,
        },
      },
    })
    revalidateFluxo(depto.slug)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível adiar' }
  }
}

const PrefsEntradaSchema = z.object({
  departamentoId: IdSchema,
  slug: z.string().min(1).max(80),
  receitaId: ReceitaSchema,
  vale: z.enum(['sim', 'nao']).optional(),
  responsavel: z.enum(['gestor', 'area']).optional(),
  horizonteDias: z.coerce.number().int().min(7).max(90).optional(),
  meses: z.string().optional(),
  diaSemana: z.coerce.number().int().min(0).max(6).optional(),
})

/** Alavancas: vale nesta torcida, quando, quem responde. */
export async function salvarPreferenciaFluxo(
  entrada: z.infer<typeof PrefsEntradaSchema>,
): Promise<FluxoActionState> {
  const parsed = PrefsEntradaSchema.safeParse(entrada)
  if (!parsed.success) return { error: 'Dados inválidos' }
  const receitaConhecida = Object.values(FLUXO_RECEITAS_DO_PANEL).some((lista) =>
    lista.some((r) => r.id === parsed.data.receitaId),
  )
  if (!receitaConhecida) return { error: 'Receita desconhecida' }

  try {
    const { session, tenant } = await assertPodeGerirDepartamento(parsed.data.departamentoId)
    const depto = await assertDepartamentoNoTenant(tenant.id, parsed.data.departamentoId)
    if (depto.slug !== parsed.data.slug) return { error: 'Departamento inválido' }

    let nextMeta: object = (depto.meta && typeof depto.meta === 'object' ? depto.meta : {}) as object
    if (parsed.data.vale) {
      nextMeta = mergeValeFluxo(nextMeta, parsed.data.receitaId, parsed.data.vale === 'sim')
    }
    const patch: {
      responsavel?: 'gestor' | 'area'
      horizonteDias?: number
      meses?: number[]
      diaSemana?: number
    } = {}
    if (parsed.data.responsavel) patch.responsavel = parsed.data.responsavel
    if (parsed.data.horizonteDias != null) patch.horizonteDias = parsed.data.horizonteDias
    if (parsed.data.diaSemana != null) patch.diaSemana = parsed.data.diaSemana
    if (parsed.data.meses != null) {
      patch.meses = parsed.data.meses
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
    }
    if (Object.keys(patch).length > 0) {
      nextMeta = mergeReceitaFluxo(nextMeta, parsed.data.receitaId, patch)
    }

    await db.departamento.update({
      where: { id: depto.id },
      data: { meta: nextMeta },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'DEPTO_FLUXO_PREFS',
        entidade: 'Departamento',
        entidadeId: depto.id,
        detalhes: parsed.data,
      },
    })
    revalidateFluxo(depto.slug)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível salvar' }
  }
}

async function ativarCampanhaDoAno(
  atorId: string,
  tenantId: string,
  depto: DeptoFluxo,
): Promise<FluxoActionState> {
  const ano = new Date().getFullYear()
  type AreaSazonal = {
    id: string
    nome: string
    slug: string
    descricao: string | null
    meta: unknown
  }
  const sazonais: AreaSazonal[] = await db.departamentoArea.findMany({
    where: { tenantId, departamentoId: depto.id, ativa: true, sazonal: true },
    select: { id: true, nome: true, slug: true, descricao: true, meta: true },
    orderBy: { ordem: 'asc' },
    take: 20,
  })
  if (sazonais.length === 0) return { error: 'Não há área sazonal neste departamento' }

  const slugsAno = sazonais.map((a) => slugCampanhaDoAno(a.slug, ano))
  const existentes: Array<{ slug: string }> = await db.projeto.findMany({
    where: { tenantId, departamentoId: depto.id, slug: { in: slugsAno } },
    select: { slug: true },
  })
  const abertos = new Set(existentes.map((p) => p.slug))
  const prefs = lerFluxoPrefs(depto.meta)
  const mes = new Date().getMonth() + 1
  const area =
    sazonais.find(
      (a) =>
        !abertos.has(slugCampanhaDoAno(a.slug, ano)) && mesDisparaCampanha(a.slug, mes, prefs),
    ) ?? sazonais.find((a) => !abertos.has(slugCampanhaDoAno(a.slug, ano)))
  if (!area) return { error: 'As campanhas do ano já estão abertas' }

  const slug = slugCampanhaDoAno(area.slug, ano)
  const { inicio, fim } = janelaCampanhaDoAno(ano)
  const status = statusInicialCampanhaDoAno(ano)
  const titulo = tituloCampanhaDoAno(area.nome, ano)

  const projeto = await db.projeto.create({
    data: {
      tenantId,
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
      criadoPorId: atorId,
    },
    select: { id: true, titulo: true },
  })

  const checklist = applyAreaChecklistModelo(area.meta, area.slug)
  let checklistItens = 0
  if (!('error' in checklist)) {
    await db.departamentoArea.update({
      where: { id: area.id },
      data: { meta: checklist.meta },
    })
    checklistItens = checklist.adicionados
  }

  await db.auditLog.create({
    data: {
      tenantId,
      atorId,
      acao: 'DEPTO_FLUXO_ATIVADO',
      entidade: 'Projeto',
      entidadeId: projeto.id,
      detalhes: {
        receitaId: 'campanha-do-ano',
        titulo: projeto.titulo,
        departamentoId: depto.id,
        areaId: area.id,
        ano,
        checklistItens,
      },
    },
  })

  revalidateFluxo(depto.slug)
  return { ok: true, href: hrefHomeDepartamento(depto.slug, 'projetos') }
}

async function ativarCaravanaDoJogo(
  atorId: string,
  tenantId: string,
  depto: DeptoFluxo,
): Promise<FluxoActionState> {
  const panel = capabilityPorSlug(depto.slug)?.portalPanel
  if (panel !== 'caravanas') return { error: 'Esta receita só vale no departamento de Caravanas' }

  const partida = await encontrarPartidaSemCobertura(tenantId, {
    mando: 'FORA',
    tipoEvento: 'CARAVANA',
    horizonteDias: horizonteJogoDias(lerFluxoPrefs(depto.meta), 'partida-fora-sem-caravana'),
  })
  if (!partida) return { error: 'Não há jogo fora sem caravana neste horizonte' }

  const titulo = `Caravana · ${partida.adversario}`.slice(0, 200)
  const evento = await db.evento.create({
    data: {
      tenantId,
      tipo: 'CARAVANA',
      titulo,
      descricao: `Viagem para o jogo fora contra ${partida.adversario}. Ajuste lotação e valor da vaga na agenda.`,
      data: partida.dataHora,
      local: partida.local,
      partidaId: partida.id,
      criadoPorId: atorId,
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId,
      atorId,
      acao: 'DEPTO_FLUXO_ATIVADO',
      entidade: 'Evento',
      entidadeId: evento.id,
      detalhes: {
        receitaId: 'partida-fora-sem-caravana',
        tipo: 'CARAVANA',
        partidaId: partida.id,
        adversario: partida.adversario,
        departamentoId: depto.id,
      },
    },
  })

  revalidateFluxo(depto.slug, evento.id)
  revalidatePath('/portal/departamentos/caravanas')
  return { ok: true, href: `/portal/eventos/${evento.id}` }
}

async function ativarEnsaioDaSemana(
  atorId: string,
  tenantId: string,
  depto: DeptoFluxo,
): Promise<FluxoActionState> {
  const panel = capabilityPorSlug(depto.slug)?.portalPanel
  if (panel !== 'bateria') return { error: 'Esta receita só vale no departamento da Bateria' }

  const futuros = await listarEventosPorTipo(tenantId, 'ENSAIO', { futuros: true, limite: 8 })
  const agora = new Date()
  if (futuros.some((e) => e.data.getTime() <= agora.getTime() + 7 * 24 * 60 * 60 * 1000)) {
    return { error: 'Já existe um ensaio nesta semana' }
  }

  const passados = await listarEventosPorTipo(tenantId, 'ENSAIO', { futuros: false, limite: 1 })
  const ultimo = passados[0]
  const diaSemana = lerFluxoPrefs(depto.meta).receitas['ensaio-da-semana']?.diaSemana
  const data = proximaDataEnsaio(ultimo?.data ?? null, agora, diaSemana)
  const titulo = (ultimo?.titulo || 'Ensaio da semana').slice(0, 200)

  const evento = await db.evento.create({
    data: {
      tenantId,
      tipo: 'ENSAIO',
      titulo,
      descricao: 'Ensaio da semana — confirme presença no RSVP.',
      data,
      local: ultimo?.local ?? null,
      criadoPorId: atorId,
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId,
      atorId,
      acao: 'DEPTO_FLUXO_ATIVADO',
      entidade: 'Evento',
      entidadeId: evento.id,
      detalhes: {
        receitaId: 'ensaio-da-semana',
        tipo: 'ENSAIO',
        departamentoId: depto.id,
        replicou: Boolean(ultimo),
      },
    },
  })

  revalidateFluxo(depto.slug, evento.id)
  revalidatePath('/portal/departamentos/bateria')
  return { ok: true, href: `/portal/eventos/${evento.id}` }
}

async function ativarEscalaDeBandeira(
  atorId: string,
  tenantId: string,
  depto: DeptoFluxo,
): Promise<FluxoActionState> {
  const panel = capabilityPorSlug(depto.slug)?.portalPanel
  if (panel !== 'bandeiras') return { error: 'Esta receita só vale no departamento de Bandeiras' }

  const partida = await encontrarPartidaSemCobertura(tenantId, {
    tipoEvento: 'GERAL',
    horizonteDias: horizonteJogoDias(lerFluxoPrefs(depto.meta), 'escala-de-bandeira'),
  })
  if (!partida) return { error: 'Não há jogo sem escala neste horizonte' }

  const titulo = `Escala · ${partida.adversario}`.slice(0, 200)
  const evento = await db.evento.create({
    data: {
      tenantId,
      tipo: 'GERAL',
      titulo,
      descricao: `Quem leva, estende e recolhe o trapo no jogo contra ${partida.adversario}. Confirme presença no RSVP.`,
      data: partida.dataHora,
      local: partida.local,
      partidaId: partida.id,
      criadoPorId: atorId,
    },
    select: { id: true },
  })

  const area: { id: string; nome: string; meta: unknown } | null =
    await db.departamentoArea.findFirst({
      where: { tenantId, departamentoId: depto.id, slug: 'escala-de-jogo', ativa: true },
      select: { id: true, nome: true, meta: true },
    })
  let checklistItens = 0
  if (area) {
    const checklist = applyAreaChecklistModelo(area.meta, 'escala-de-jogo')
    if (!('error' in checklist)) {
      await db.departamentoArea.update({
        where: { id: area.id },
        data: { meta: checklist.meta },
      })
      checklistItens = checklist.adicionados
    }
  }

  await db.auditLog.create({
    data: {
      tenantId,
      atorId,
      acao: 'DEPTO_FLUXO_ATIVADO',
      entidade: 'Evento',
      entidadeId: evento.id,
      detalhes: {
        receitaId: 'escala-de-bandeira',
        tipo: 'GERAL',
        partidaId: partida.id,
        adversario: partida.adversario,
        departamentoId: depto.id,
        checklistItens,
      },
    },
  })

  revalidateFluxo(depto.slug, evento.id)
  return { ok: true, href: `/portal/eventos/${evento.id}` }
}

async function ativarEnsaiosDeRua(
  atorId: string,
  tenantId: string,
  depto: DeptoFluxo,
): Promise<FluxoActionState> {
  const panel = capabilityPorSlug(depto.slug)?.portalPanel
  if (panel !== 'carnaval') return { error: 'Esta receita só vale no Carnaval' }

  const agora = new Date()
  const existente: { id: string } | null = await db.evento.findFirst({
    where: {
      tenantId,
      tipo: 'GERAL',
      titulo: { contains: 'Ensaio de rua', mode: 'insensitive' },
      data: { gte: agora },
    },
    select: { id: true },
  })
  if (existente) {
    return { error: 'Já existe um ensaio de rua na agenda', href: `/portal/eventos/${existente.id}` }
  }

  const desfile = desfileEmFromMeta(depto.meta)
  const data = new Date(agora.getTime())
  data.setDate(data.getDate() + 7)
  data.setHours(20, 0, 0, 0)
  if (desfile && data.getTime() > desfile.getTime()) {
    data.setTime(desfile.getTime() - 2 * 24 * 60 * 60 * 1000)
  }

  const evento = await db.evento.create({
    data: {
      tenantId,
      tipo: 'GERAL',
      titulo: 'Ensaio de rua',
      descricao: 'Ensaio de rua até o desfile — confirme presença no RSVP.',
      data,
      criadoPorId: atorId,
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId,
      atorId,
      acao: 'DEPTO_FLUXO_ATIVADO',
      entidade: 'Evento',
      entidadeId: evento.id,
      detalhes: { receitaId: 'ensaios-de-rua', tipo: 'GERAL', departamentoId: depto.id },
    },
  })

  revalidateFluxo(depto.slug, evento.id)
  return { ok: true, href: `/portal/eventos/${evento.id}` }
}

async function encontrarPartidaSemCobertura(
  tenantId: string,
  opts: { mando?: 'FORA' | 'CASA'; tipoEvento: 'CARAVANA' | 'GERAL'; horizonteDias: number },
): Promise<{
  id: string
  adversario: string
  dataHora: Date
  local: string | null
} | null> {
  const afiliacaoId = await getAfiliacaoIdDoTenant(tenantId)
  if (!afiliacaoId) return null
  const agora = new Date()
  const ate = new Date(agora.getTime() + opts.horizonteDias * 24 * 60 * 60 * 1000)

  type PartidaRow = { id: string; adversario: string; dataHora: Date; local: string | null }
  const [partidas, cobertos]: [PartidaRow[], Array<{ partidaId: string | null }>] = await Promise.all([
    db.partida.findMany({
      where: {
        afiliacaoId,
        ...(opts.mando ? { mando: opts.mando } : {}),
        status: { in: ['AGENDADA', 'AO_VIVO'] },
        dataHora: { gte: agora, lte: ate },
      },
      orderBy: { dataHora: 'asc' },
      take: 8,
      select: { id: true, adversario: true, dataHora: true, local: true },
    }),
    db.evento.findMany({
      where: {
        tenantId,
        tipo: opts.tipoEvento,
        partidaId: { not: null },
        data: { gte: agora, lte: ate },
      },
      select: { partidaId: true },
      take: 40,
    }),
  ])
  const cobertas = new Set(
    cobertos.map((c) => c.partidaId).filter((id): id is string => Boolean(id)),
  )
  return partidas.find((p) => !cobertas.has(p.id)) ?? null
}

