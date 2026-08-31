import { db } from '@torcida/db'
import {
  estaNaJanela,
  formatDataCompetenciaInput,
  formatNomeTorcida,
  slugCampanhaDoAno,
} from '@torcida/types'
import { getAreasEfetivadasPorUser } from '@/lib/get-areas-efetivadas'
import type { AreaAcesso } from '@/lib/departamentos-portal-access'
import type { AreaFiltro, MembroEquipe } from '../../_components/departamento-equipe'
import type { PendenteLite } from '../../_components/departamento-fila-membros'
import type { PedidoAreaLite } from '../../_components/departamento-fila-area'
import type { DiretoriaKpis } from '../../_components/departamento-diretoria-kpis'
import type { AreaMembroResumo, AreaResumo } from '../_components/departamento-areas-block'
import type { AreaOpcao, ProjetoResumo } from '../_components/departamento-projetos-block'

type EquipeUserLite = {
  id: string
  nome: string | null
  email: string
  nickname: string | null
  avatarUrl: string | null
}

const userSelect = {
  id: true,
  nome: true,
  email: true,
  nickname: true,
  avatarUrl: true,
} as const

export type AreaMembrosMapa = {
  membrosPorArea: Map<string, AreaMembroResumo[]>
  areasPorUsuario: Map<string, string[]>
}

export async function carregarAreaMembros(areaIds: string[]): Promise<AreaMembrosMapa> {
  const membrosPorArea = new Map<string, AreaMembroResumo[]>()
  const areasPorUsuario = new Map<string, string[]>()
  if (areaIds.length === 0) return { membrosPorArea, areasPorUsuario }

  type AreaMembroRow = {
    areaId: string
    userId: string
    papel: string
    user: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  }
  const rows: AreaMembroRow[] = await db.departamentoAreaMembro.findMany({
    where: { areaId: { in: areaIds } },
    select: {
      areaId: true,
      userId: true,
      papel: true,
      user: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
    },
  })
  for (const row of rows) {
    const lista = membrosPorArea.get(row.areaId) ?? []
    lista.push({
      userId: row.userId,
      nome: row.user.nome,
      nickname: row.user.nickname,
      avatarUrl: row.user.avatarUrl,
      papel: row.papel === 'RESPONSAVEL' ? 'RESPONSAVEL' : 'MEMBRO',
    })
    membrosPorArea.set(row.areaId, lista)
    const ids = areasPorUsuario.get(row.userId) ?? []
    ids.push(row.areaId)
    areasPorUsuario.set(row.userId, ids)
  }
  for (const lista of membrosPorArea.values()) {
    lista.sort((a, b) => {
      if (a.papel !== b.papel) return a.papel === 'RESPONSAVEL' ? -1 : 1
      return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR')
    })
  }
  return { membrosPorArea, areasPorUsuario }
}

export async function carregarSlugsCampanhaAno(
  tenantId: string,
  departamentoId: string,
): Promise<Set<string>> {
  const projetos: Array<{ slug: string }> = await db.projeto.findMany({
    where: { departamentoId, tenantId },
    select: { slug: true },
    take: 80,
  })
  return new Set(projetos.map((p) => p.slug))
}

export function montarAreasResumo(
  areas: AreaAcesso[],
  membrosPorArea: Map<string, AreaMembroResumo[]>,
  slugsCampanhaAno: Set<string>,
): AreaResumo[] {
  const anoAtual = new Date().getFullYear()
  return areas.map((a) => ({
    ...a,
    membros: membrosPorArea.get(a.id) ?? [],
    campanhaAnoAberta: slugsCampanhaAno.has(slugCampanhaDoAno(a.slug, anoAtual)),
  }))
}

export async function carregarEquipe(opts: {
  tenantId: string
  departamentoId: string
  areasPorUsuario: Map<string, string[]>
}): Promise<MembroEquipe[]> {
  const [membrosRaw, gestoresRaw]: [
    Array<{ userId: string; user: EquipeUserLite }>,
    Array<{ userId: string; user: EquipeUserLite }>,
  ] = await Promise.all([
    db.userDepartamento.findMany({
      where: { departamentoId: opts.departamentoId, tenantId: opts.tenantId },
      select: { userId: true, user: { select: userSelect } },
      orderBy: { criadoEm: 'asc' },
    }),
    db.departamentoGestor.findMany({
      where: { departamentoId: opts.departamentoId },
      select: { userId: true, user: { select: userSelect } },
    }),
  ])

  const userIdsEquipe = [...new Set([...membrosRaw, ...gestoresRaw].map((r) => r.userId))]
  const membrosElegiveis: { userId: string }[] =
    userIdsEquipe.length > 0
      ? await db.saasMembro.findMany({
          where: {
            tenantId: opts.tenantId,
            userId: { in: userIdsEquipe },
            tipo: 'SOCIO',
            status: 'APROVADO',
            desligadoEm: null,
            espelhado: false,
            membroOrigemId: null,
          },
          select: { userId: true },
        })
      : []
  const userIdsElegiveis = new Set(membrosElegiveis.map((m) => m.userId))

  const gestorSet = new Set(
    gestoresRaw.filter((g) => userIdsElegiveis.has(g.userId)).map((g) => g.userId),
  )
  const porId = new Map<string, MembroEquipe>()

  for (const g of gestoresRaw) {
    if (!userIdsElegiveis.has(g.userId)) continue
    porId.set(g.userId, {
      userId: g.userId,
      nome: g.user.nome,
      email: g.user.email,
      nickname: g.user.nickname,
      avatarUrl: g.user.avatarUrl,
      isGestor: true,
      areaIds: opts.areasPorUsuario.get(g.userId) ?? [],
    })
  }
  for (const m of membrosRaw) {
    if (!userIdsElegiveis.has(m.userId)) continue
    if (porId.has(m.userId)) continue
    porId.set(m.userId, {
      userId: m.userId,
      nome: m.user.nome,
      email: m.user.email,
      nickname: m.user.nickname,
      avatarUrl: m.user.avatarUrl,
      isGestor: gestorSet.has(m.userId),
      areaIds: opts.areasPorUsuario.get(m.userId) ?? [],
    })
  }

  const membros: MembroEquipe[] = [...porId.values()]
  membros.sort((a, b) => {
    if (a.isGestor !== b.isGestor) return a.isGestor ? -1 : 1
    return (a.nome ?? a.email).localeCompare(b.nome ?? b.email, 'pt-BR')
  })
  return membros
}

export async function carregarProjetos(opts: {
  tenantId: string
  departamentoId: string
  areas: Array<{ id: string; nome: string; ativa: boolean }>
}): Promise<{ projetos: ProjetoResumo[]; areasOpcoes: AreaOpcao[] }> {
  type ProjetoRow = {
    id: string
    titulo: string
    slug: string
    descricao: string | null
    tipo: string
    status: string
    areaId: string | null
    inicio: Date
    fim: Date | null
    recorrenteAnual: boolean
    metaQuantidade: number | null
    metaUnidade: string | null
    realizadoQuantidade: number
    orcamentoPrevisto: unknown
    responsavel: { nome: string | null; nickname: string | null } | null
    _count: { participantes: number }
    eventos: Array<{ id: string; titulo: string; data: Date }>
  }
  const projetosRaw: ProjetoRow[] = await db.projeto.findMany({
    where: { departamentoId: opts.departamentoId, tenantId: opts.tenantId },
    orderBy: [{ status: 'asc' }, { inicio: 'desc' }],
    take: 60,
    select: {
      id: true,
      titulo: true,
      slug: true,
      descricao: true,
      tipo: true,
      status: true,
      areaId: true,
      inicio: true,
      fim: true,
      recorrenteAnual: true,
      metaQuantidade: true,
      metaUnidade: true,
      realizadoQuantidade: true,
      orcamentoPrevisto: true,
      responsavel: { select: { nome: true, nickname: true } },
      _count: { select: { participantes: true } },
      eventos: {
        where: { data: { gte: new Date() } },
        orderBy: { data: 'asc' },
        take: 3,
        select: { id: true, titulo: true, data: true },
      },
    },
  })

  const gastoPorProjeto = new Map<string, number>()
  if (projetosRaw.length > 0) {
    const somas: Array<{ projetoId: string | null; _sum: { valor: unknown } }> =
      await db.financeiroLancamento.groupBy({
        by: ['projetoId'],
        where: {
          tenantId: opts.tenantId,
          tipo: 'DESPESA',
          projetoId: { in: projetosRaw.map((p) => p.id) },
        },
        _sum: { valor: true },
      })
    for (const s of somas) {
      if (s.projetoId) gastoPorProjeto.set(s.projetoId, Number(s._sum.valor ?? 0))
    }
  }

  const areaNomePorId = new Map(opts.areas.map((a) => [a.id, a.nome]))
  const fmtDataCurta = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
  const projetos: ProjetoResumo[] = projetosRaw.map((p) => ({
    id: p.id,
    titulo: p.titulo,
    descricao: p.descricao,
    tipo: p.tipo,
    status: p.status,
    areaId: p.areaId,
    areaNome: p.areaId ? (areaNomePorId.get(p.areaId) ?? null) : null,
    inicioIso: formatDataCompetenciaInput(p.inicio),
    fimIso: p.fim ? formatDataCompetenciaInput(p.fim) : null,
    inicioLabel: fmtDataCurta.format(p.inicio),
    fimLabel: p.fim ? fmtDataCurta.format(p.fim) : null,
    recorrenteAnual: p.recorrenteAnual,
    naJanela: estaNaJanela({ inicio: p.inicio, fim: p.fim, recorrenteAnual: p.recorrenteAnual }),
    metaQuantidade: p.metaQuantidade,
    metaUnidade: p.metaUnidade,
    realizadoQuantidade: p.realizadoQuantidade,
    orcamentoPrevisto: p.orcamentoPrevisto == null ? null : Number(p.orcamentoPrevisto),
    gastoRealizado: gastoPorProjeto.get(p.id) ?? 0,
    responsavelNome:
      p.responsavel?.nome?.trim() ||
      (p.responsavel?.nickname ? `@${p.responsavel.nickname}` : null),
    participantes: p._count.participantes,
    eventos: p.eventos.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      dataLabel: fmtDataCurta.format(e.data),
    })),
  }))
  const areasOpcoes: AreaOpcao[] = opts.areas
    .filter((a) => a.ativa)
    .map((a) => ({ id: a.id, nome: a.nome }))
  return { projetos, areasOpcoes }
}

export async function carregarPedidosArea(opts: {
  tenantId: string
  departamentoId: string
}): Promise<PedidoAreaLite[]> {
  type CandidatoRow = {
    id: string
    userId: string
    nome: string
    cidade: string | null
    aprovadoNaUnidadeTenantId: string | null
    user: { nome: string | null; email: string }
  }
  const candidatos: CandidatoRow[] = await db.saasMembro.findMany({
    where: {
      tenantId: opts.tenantId,
      tipo: 'SOCIO',
      status: 'APROVADO',
      desligadoEm: null,
      departamentoId: opts.departamentoId,
    },
    orderBy: { aprovadoEm: 'asc' },
    take: 20,
    select: {
      id: true,
      userId: true,
      nome: true,
      cidade: true,
      aprovadoNaUnidadeTenantId: true,
      user: { select: { nome: true, email: true } },
    },
  })
  if (candidatos.length === 0) return []

  const efetivadas = await getAreasEfetivadasPorUser(
    opts.tenantId,
    candidatos.map((c) => c.userId),
  )
  const naoEfetivados = candidatos.filter((c) => !efetivadas.get(c.userId)?.has(opts.departamentoId))
  const nomesUnidade = new Map<string, string>()
  const unidadeIds = [
    ...new Set(
      naoEfetivados
        .map((c) => c.aprovadoNaUnidadeTenantId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (unidadeIds.length > 0) {
    const tenants: Array<{ id: string; nome: string }> = await db.tenant.findMany({
      where: { id: { in: unidadeIds } },
      select: { id: true, nome: true },
    })
    for (const t of tenants) nomesUnidade.set(t.id, formatNomeTorcida(t.nome))
  }
  return naoEfetivados.map((c) => ({
    membroId: c.id,
    nome: c.nome,
    cidade: c.cidade,
    viaUnidade: c.aprovadoNaUnidadeTenantId
      ? (nomesUnidade.get(c.aprovadoNaUnidadeTenantId) ?? null)
      : null,
    user: c.user,
  }))
}

export async function carregarDiretoriaKpis(tenantId: string): Promise<{
  kpis: DiretoriaKpis
  totalPendentes: number
}> {
  const agora = new Date()
  const [porStatus, sociosAtivos, carteirinhasVencidas]: [
    Array<{ status: string; _count: number }>,
    number,
    number,
  ] = await Promise.all([
    db.saasMembro.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    }),
    db.saasSocio.count({ where: { tenantId } }),
    db.saasSocio.count({
      where: { tenantId, validade: { lt: agora } },
    }),
  ])
  const countBy = Object.fromEntries(porStatus.map((r) => [r.status, r._count])) as Record<
    string,
    number
  >
  const kpis: DiretoriaKpis = {
    pendentes: countBy.PENDENTE ?? 0,
    aprovados: countBy.APROVADO ?? 0,
    reprovados: countBy.REPROVADO ?? 0,
    sociosAtivos,
    carteirinhasVencidas,
  }
  return { kpis, totalPendentes: kpis.pendentes }
}

export async function carregarFilaPendentes(tenantId: string): Promise<PendenteLite[]> {
  type PendenteRow = {
    id: string
    nome: string
    tipo: 'SOCIO' | 'TORCEDOR'
    cidade: string | null
    criadoEm: Date
    departamento: { nome: string } | null
    user: { nome: string | null; email: string; avatarUrl: string | null }
  }
  const rows: PendenteRow[] = await db.saasMembro.findMany({
    where: { tenantId, status: 'PENDENTE' },
    orderBy: { criadoEm: 'asc' },
    take: 8,
    select: {
      id: true,
      nome: true,
      tipo: true,
      cidade: true,
      criadoEm: true,
      departamento: { select: { nome: true } },
      user: { select: { nome: true, email: true, avatarUrl: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    cidade: r.cidade,
    criadoEm: r.criadoEm.toISOString(),
    departamentoNome: r.departamento?.nome ?? null,
    user: r.user,
  }))
}

export async function carregarCanaisDisponiveis(
  tenantId: string,
): Promise<Array<{ id: string; nome: string | null }>> {
  return db.conversa.findMany({
    where: { tenantId, tipo: 'CANAL' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
    take: 40,
  })
}

export async function carregarContagensCockpit(opts: {
  tenantId: string
  departamentoId: string
  temFila: boolean
}): Promise<{ projetos: number; equipe: number; pendentes: number }> {
  const [projetos, equipe, pendentes] = await Promise.all([
    db.projeto.count({ where: { departamentoId: opts.departamentoId, tenantId: opts.tenantId } }),
    db.userDepartamento.count({
      where: { departamentoId: opts.departamentoId, tenantId: opts.tenantId },
    }),
    opts.temFila
      ? db.saasMembro.count({ where: { tenantId: opts.tenantId, status: 'PENDENTE' } })
      : Promise.resolve(0),
  ])
  return { projetos, equipe, pendentes }
}

export function areasFiltroDe(areas: Array<{ id: string; nome: string }>): AreaFiltro[] {
  return areas.map((a) => ({ id: a.id, nome: a.nome }))
}
