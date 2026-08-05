import { Suspense } from 'react'
import { db } from '@torcida/db'
import Link from 'next/link'
import {
  estaNaJanela,
  formatDataCompetenciaInput,
  formatNomeTorcida,
  hasPermission,
  hrefModuloPortal,
  hrefOperacaoAdmin,
  missionDepartamento,
  PERMISSIONS,
  resolverModuloPortalDepartamento,
  rotuloAreaDepartamento,
  slugCampanhaDoAno,
  subareasDepartamento,
} from '@torcida/types'
import { MotionReveal } from '@/components/motion/motion-reveal'
import {
  DepartamentoEquipe,
  type MembroEquipe,
  type AreaFiltro,
} from '../_components/departamento-equipe'
import {
  DepartamentoFilaMembros,
  type PendenteLite,
} from '../_components/departamento-fila-membros'
import {
  DepartamentoFilaArea,
  type PedidoAreaLite,
} from '../_components/departamento-fila-area'
import { getAreasEfetivadasPorUser } from '@/lib/get-areas-efetivadas'
import {
  DepartamentoDiretoriaKpis,
  type DiretoriaKpis,
} from '../_components/departamento-diretoria-kpis'
import { DepartamentoSubareasNav } from '../_components/departamento-subareas-nav'
import { DepartamentoProximaAcao } from '../_components/departamento-proxima-acao'
import { resolverProximaAcaoArea } from '../_components/departamento-proxima-acao-data'
import {
  FinanceiroCaixaAside,
  FinanceiroCaixaSkeleton,
} from '../_components/financeiro-caixa-aside'
import {
  PatrimonioInventarioAside,
  PatrimonioInventarioSkeleton,
} from '../_components/patrimonio-inventario-aside'
import {
  CaravanasAgendaAside,
  CaravanasAgendaSkeleton,
} from '../_components/caravanas-agenda-aside'
import {
  BateriaEnsaiosAside,
  BateriaEnsaiosSkeleton,
} from '../_components/bateria-ensaios-aside'
import {
  DepartamentoThinAside,
  DepartamentoThinSkeleton,
} from '../_components/departamento-thin-aside'
import {
  CarnavalBarracaoAside,
  CarnavalBarracaoSkeleton,
} from '../_components/carnaval-barracao-aside'
import { DepartamentoCanalBlock } from '../_components/departamento-canal-block'
import { iconeDepartamento } from '../_components/departamento-icone'
import { resolveAcessoPluginEvento } from '@/lib/eventos-plugin-access'
import { getDepartamentoContexto } from './_lib/contexto'
import { DepartamentoSectionCard } from './_components/departamento-section-card'
import {
  DepartamentoAreasBlock,
  type AreaMembroResumo,
  type AreaResumo,
} from './_components/departamento-areas-block'
import {
  DepartamentoProjetosBlock,
  type AreaOpcao,
  type ProjetoResumo,
} from './_components/departamento-projetos-block'
import { ArrowLeft, ArrowRight, Layers, Shield, Target, Users } from 'lucide-react'
import type { Metadata } from 'next'

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  return { title: `Departamento · ${slug}` }
}

export default async function DepartamentoHomePage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const ctx = await getDepartamentoContexto(slug)
  if (!ctx) return null

  const {
    userId,
    tenant,
    departamento: depto,
    capability,
    isSuperAdmin,
    isAtuacao,
    permissoesEfetivas,
    podeGerirEquipe,
    podeAprovarArea,
    podeVerFinanceiro,
    podeVerPatrimonio,
    podeModerar,
    areas,
  } = ctx

  // Visão de administrador do cockpit = mesma regra das actions
  // (`canManageDepartamento`: roles:manage OU DepartamentoGestor).
  const isGestor = podeGerirEquipe

  const podeVerPedidos =
    isSuperAdmin || hasPermission(permissoesEfetivas, PERMISSIONS.STORE_VIEW_ORDERS)

  const [acessoCaravanas, acessoBateria] = await Promise.all([
    resolveAcessoPluginEvento(
      userId,
      tenant.id,
      'caravanas',
      permissoesEfetivas,
      [],
      isSuperAdmin,
    ),
    resolveAcessoPluginEvento(userId, tenant.id, 'bateria', permissoesEfetivas, [], isSuperAdmin),
  ])

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

  const [membrosRaw, gestoresRaw]: [
    Array<{ userId: string; user: EquipeUserLite }>,
    Array<{ userId: string; user: EquipeUserLite }>,
  ] = await Promise.all([
    db.userDepartamento.findMany({
      where: { departamentoId: depto.id, tenantId: tenant.id },
      select: { userId: true, user: { select: userSelect } },
      orderBy: { criadoEm: 'asc' },
    }),
    db.departamentoGestor.findMany({
      where: { departamentoId: depto.id },
      select: { userId: true, user: { select: userSelect } },
    }),
  ])

  // Equipe: somente vínculo canônico de sócio aprovado e ativo. Membership
  // órfã (bug antigo) some da UI aqui; limpeza no banco via
  // `pnpm --filter @torcida/db db:repair-departamento-orfaos`.
  const userIdsEquipe = [
    ...new Set([...membrosRaw, ...gestoresRaw].map((r) => r.userId)),
  ]
  const membrosElegiveis: { userId: string }[] =
    userIdsEquipe.length > 0
      ? await db.saasMembro.findMany({
          where: {
            tenantId: tenant.id,
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
  function naEquipeVisivel(userId: string): boolean {
    return userIdsElegiveis.has(userId)
  }

  // Áreas: membros por área (mesma consulta alimenta o bloco #areas e os
  // badges/filtro da equipe segmentada por área).
  type AreaMembroRow = {
    areaId: string
    userId: string
    papel: string
    user: { id: string; nome: string | null; nickname: string | null; avatarUrl: string | null }
  }
  const areaMembrosRows: AreaMembroRow[] =
    areas.length > 0
      ? await db.departamentoAreaMembro.findMany({
          where: { areaId: { in: areas.map((a) => a.id) } },
          select: {
            areaId: true,
            userId: true,
            papel: true,
            user: { select: { id: true, nome: true, nickname: true, avatarUrl: true } },
          },
        })
      : []
  const membrosPorArea = new Map<string, AreaMembroResumo[]>()
  const areasPorUsuario = new Map<string, string[]>()
  for (const row of areaMembrosRows) {
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
  const areasResumo: AreaResumo[] = areas.map((a) => ({
    ...a,
    membros: membrosPorArea.get(a.id) ?? [],
    campanhaAnoAberta: false,
  }))
  const areasFiltro: AreaFiltro[] = areas.map((a) => ({ id: a.id, nome: a.nome }))

  // Projetos do departamento + gasto realizado (soma das DESPESAS vinculadas).
  // O realizado nunca é digitado no projeto: vem do livro-caixa.
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
    where: { departamentoId: depto.id, tenantId: tenant.id },
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
          tenantId: tenant.id,
          tipo: 'DESPESA',
          projetoId: { in: projetosRaw.map((p) => p.id) },
        },
        _sum: { valor: true },
      })
    for (const s of somas) {
      if (s.projetoId) gastoPorProjeto.set(s.projetoId, Number(s._sum.valor ?? 0))
    }
  }

  const areaNomePorId = new Map(areas.map((a) => [a.id, a.nome]))
  const anoAtual = new Date().getFullYear()
  const slugsCampanhaAno = new Set(projetosRaw.map((p) => p.slug))
  for (const a of areasResumo) {
    a.campanhaAnoAberta = slugsCampanhaAno.has(slugCampanhaDoAno(a.slug, anoAtual))
  }
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
  const areasOpcoes: AreaOpcao[] = areas
    .filter((a) => a.ativa)
    .map((a) => ({ id: a.id, nome: a.nome }))

  const gestorSet = new Set(
    gestoresRaw.filter((g) => naEquipeVisivel(g.userId)).map((g) => g.userId),
  )
  const porId = new Map<string, MembroEquipe>()

  for (const g of gestoresRaw) {
    if (!naEquipeVisivel(g.userId)) continue
    porId.set(g.userId, {
      userId: g.userId,
      nome: g.user.nome,
      email: g.user.email,
      nickname: g.user.nickname,
      avatarUrl: g.user.avatarUrl,
      isGestor: true,
      areaIds: areasPorUsuario.get(g.userId) ?? [],
    })
  }
  for (const m of membrosRaw) {
    if (!naEquipeVisivel(m.userId)) continue
    if (porId.has(m.userId)) continue
    porId.set(m.userId, {
      userId: m.userId,
      nome: m.user.nome,
      email: m.user.email,
      nickname: m.user.nickname,
      avatarUrl: m.user.avatarUrl,
      isGestor: gestorSet.has(m.userId),
      areaIds: areasPorUsuario.get(m.userId) ?? [],
    })
  }

  const membros: MembroEquipe[] = [...porId.values()]
  membros.sort((a, b) => {
    if (a.isGestor !== b.isGestor) return a.isGestor ? -1 : 1
    return (a.nome ?? a.email).localeCompare(b.nome ?? b.email, 'pt-BR')
  })

  const moduloKey = resolverModuloPortalDepartamento(depto.slug, depto.moduloPortal)
  const moduloHref = hrefModuloPortal(moduloKey)
  const operacaoHref = isGestor ? hrefOperacaoAdmin(moduloKey) : null
  const moduloLabel = rotuloAreaDepartamento(depto.slug, depto.moduloPortal)
  const mission = missionDepartamento(depto.slug)
  // Registry cobre as capacidades do domínio; Áreas e Projetos são universais
  // (todo departamento tem) e entram aqui em vez de repetir nos 10 slugs.
  const subareas = [
    ...subareasDepartamento(depto.slug),
    { id: 'areas', label: 'Áreas', feature: 'equipe' as const },
    { id: 'projetos', label: 'Projetos', feature: 'equipe' as const },
  ]
  const panel = capability?.portalPanel ?? 'generico'
  const Icon = iconeDepartamento(depto.slug)

  let pendentes: PendenteLite[] = []
  let totalPendentes = 0
  let kpis: DiretoriaKpis | null = null

  /**
   * Pedidos para ESTA área: sócios já aprovados que a escolheram no onboarding
   * e ainda não entraram. Fluxo separado do vínculo — o vínculo é first-wins na
   * torcida, a área é decidida por cada nível no seu próprio portal.
   */
  let pedidosArea: PedidoAreaLite[] = []
  if (isGestor) {
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
        tenantId: tenant.id,
        tipo: 'SOCIO',
        status: 'APROVADO',
        desligadoEm: null,
        departamentoId: depto.id,
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

    if (candidatos.length > 0) {
      const efetivadas = await getAreasEfetivadasPorUser(
        tenant.id,
        candidatos.map((c) => c.userId),
      )
      const naoEfetivados = candidatos.filter(
        (c) => !efetivadas.get(c.userId)?.has(depto.id),
      )
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
      pedidosArea = naoEfetivados.map((c) => ({
        membroId: c.id,
        nome: c.nome,
        cidade: c.cidade,
        viaUnidade: c.aprovadoNaUnidadeTenantId
          ? (nomesUnidade.get(c.aprovadoNaUnidadeTenantId) ?? null)
          : null,
        user: c.user,
      }))
    }
  }

  if (panel === 'diretoria' && isGestor) {
    const agora = new Date()
    const [porStatus, sociosAtivos, carteirinhasVencidas]: [
      Array<{ status: string; _count: number }>,
      number,
      number,
    ] = await Promise.all([
      db.saasMembro.groupBy({
        by: ['status'],
        where: { tenantId: tenant.id },
        _count: true,
      }),
      db.saasSocio.count({ where: { tenantId: tenant.id } }),
      db.saasSocio.count({
        where: { tenantId: tenant.id, validade: { lt: agora } },
      }),
    ])

    const countBy = Object.fromEntries(porStatus.map((r) => [r.status, r._count])) as Record<
      string,
      number
    >
    kpis = {
      pendentes: countBy.PENDENTE ?? 0,
      aprovados: countBy.APROVADO ?? 0,
      reprovados: countBy.REPROVADO ?? 0,
      sociosAtivos,
      carteirinhasVencidas,
    }
    totalPendentes = kpis.pendentes

    if (podeAprovarArea) {
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
        where: { tenantId: tenant.id, status: 'PENDENTE' },
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
      pendentes = rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        tipo: r.tipo,
        cidade: r.cidade,
        criadoEm: r.criadoEm.toISOString(),
        departamentoNome: r.departamento?.nome ?? null,
        user: r.user,
      }))
    }
  }

  type CanalOpcao = { id: string; nome: string | null }
  // Próxima ação, canais e contagem de carnaval são independentes → um round-trip.
  const [proximaAcao, canaisDisponiveis, carnavalProximos]: [
    Awaited<ReturnType<typeof resolverProximaAcaoArea>>,
    CanalOpcao[],
    number,
  ] = await Promise.all([
    resolverProximaAcaoArea({
      tenantId: tenant.id,
      departamentoId: depto.id,
      slug: depto.slug,
      panel,
      isGestor,
      totalPendentes,
      podeVerFinanceiro,
      totalPedidosArea: pedidosArea.length,
      nomeDepartamento: depto.nome,
    }),
    isGestor
      ? db.conversa.findMany({
          where: { tenantId: tenant.id, tipo: 'CANAL' },
          orderBy: { nome: 'asc' },
          select: { id: true, nome: true },
          take: 40,
        })
      : Promise.resolve([]),
    panel === 'carnaval'
      ? db.evento.count({
          where: { tenantId: tenant.id, tipo: 'GERAL', data: { gte: new Date() } },
        })
      : Promise.resolve(0),
  ])

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/departamentos"
          className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Departamentos
        </Link>
      </div>

      <MotionReveal>
        <header className="flex flex-wrap items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{ backgroundColor: depto.cor }}
          >
            <Icon className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
              {depto.nome}
            </h1>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
              {moduloLabel}
              {isGestor
                ? ' · você é gestor'
                : isAtuacao
                  ? ' · você é membro'
                  : ' · visão Diretoria (sem gestão)'}
              {panel === 'diretoria' && isGestor && totalPendentes > 0
                ? ` · ${totalPendentes} pendente${totalPendentes === 1 ? '' : 's'}`
                : ''}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-[rgb(var(--foreground-muted))]">{mission}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* CTA de módulo fica no aside do domínio; carnaval mantém atalho no header. */}
            {moduloHref && panel === 'carnaval' && (
              <Link
                href={moduloHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Abrir eventos
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </header>
      </MotionReveal>

      <DepartamentoSubareasNav subareas={subareas} />
      <DepartamentoProximaAcao acao={proximaAcao} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <aside id="dominio" className="order-1 space-y-4 scroll-mt-20 lg:order-2">
          {panel === 'diretoria' && isGestor && kpis && (
            <DepartamentoDiretoriaKpis kpis={kpis} />
          )}
          {panel === 'financeiro' ? (
            <Suspense fallback={<FinanceiroCaixaSkeleton />}>
              <FinanceiroCaixaAside
                tenantId={tenant.id}
                nome={depto.nome}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVerFinanceiro={podeVerFinanceiro}
              />
            </Suspense>
          ) : panel === 'patrimonio' ? (
            <Suspense fallback={<PatrimonioInventarioSkeleton />}>
              <PatrimonioInventarioAside
                tenantId={tenant.id}
                nome={depto.nome}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVerPatrimonio={podeVerPatrimonio}
              />
            </Suspense>
          ) : panel === 'caravanas' ? (
            <Suspense fallback={<CaravanasAgendaSkeleton />}>
              <CaravanasAgendaAside
                tenantId={tenant.id}
                nome={depto.nome}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVer={acessoCaravanas.podeVer}
              />
            </Suspense>
          ) : panel === 'bateria' ? (
            <Suspense fallback={<BateriaEnsaiosSkeleton />}>
              <BateriaEnsaiosAside
                tenantId={tenant.id}
                departamentoId={depto.id}
                nome={depto.nome}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVer={acessoBateria.podeVer}
              />
            </Suspense>
          ) : panel === 'carnaval' ? (
            <Suspense fallback={<CarnavalBarracaoSkeleton />}>
              <CarnavalBarracaoAside
                departamentoId={depto.id}
                slug={depto.slug}
                nome={depto.nome}
                isGestor={isGestor}
                meta={depto.meta}
                proximosCount={carnavalProximos}
              />
            </Suspense>
          ) : panel === 'diretoria' ? (
            <PainelDominio
              isGestor={isGestor}
              operacaoHref={operacaoHref}
              totalPendentes={totalPendentes}
            />
          ) : (
            <Suspense fallback={<DepartamentoThinSkeleton />}>
              <DepartamentoThinAside
                tenantId={tenant.id}
                slug={depto.slug}
                nome={depto.nome}
                departamentoId={depto.id}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVerPedidos={podeVerPedidos}
                podeModerar={podeModerar}
                podeVerFinanceiro={podeVerFinanceiro}
                podeGerirFinanceiro={hasPermission(
                  permissoesEfetivas,
                  PERMISSIONS.FINANCE_MANAGE,
                )}
              />
            </Suspense>
          )}
        </aside>

        <div className="order-2 space-y-6 lg:order-1">
          {panel === 'diretoria' &&
            (isGestor && podeAprovarArea ? (
              <div id="fila" className="scroll-mt-20">
                <DepartamentoFilaMembros pendentes={pendentes} totalPendentes={totalPendentes} />
              </div>
            ) : (
              <DepartamentoSectionCard
                icon={<Users className="h-4 w-4" />}
                title="Fila de admissão"
                description="Sócios e torcedores pendentes de aprovação nesta torcida."
                id="fila"
                index={0}
                blocked
                blockedReason="A aprovação da fila é de quem gere a Diretoria. Você vê o painel de resumo ao lado."
              >
                {null}
              </DepartamentoSectionCard>
            ))}

          {/* Vale para qualquer área (não só Diretoria): a decisão de entrada
              na área é do gestor dela, no portal do seu próprio nível. */}
          {isGestor &&
            (podeAprovarArea ? (
              pedidosArea.length > 0 && (
                <div id="pedidos-area" className="scroll-mt-20">
                  <DepartamentoFilaArea nomeArea={depto.nome} pedidos={pedidosArea} />
                </div>
              )
            ) : (
              <DepartamentoSectionCard
                icon={<Users className="h-4 w-4" />}
                title="Pedidos de área"
                description="Sócios aprovados aguardando entrada numa área deste departamento."
                id="pedidos-area"
                index={1}
                blocked
                blockedReason="Só quem aprova admissões decide esses pedidos. Fale com a Diretoria se algo estiver represado."
              >
                {null}
              </DepartamentoSectionCard>
            ))}

          <DepartamentoSectionCard
            icon={<Layers className="h-4 w-4" />}
            title="Áreas de atuação"
            description="Frentes de trabalho deste departamento — cada uma organiza sua própria gente."
            id="areas"
            index={2}
          >
            <DepartamentoAreasBlock
              departamentoId={depto.id}
              slug={depto.slug}
              areas={areasResumo}
              podeGerir={isGestor}
              canaisDisponiveis={canaisDisponiveis}
            />
          </DepartamentoSectionCard>

          <DepartamentoSectionCard
            icon={<Target className="h-4 w-4" />}
            title="Projetos e campanhas"
            description="O trabalho do departamento com período, meta e prestação de contas."
            id="projetos"
            index={3}
          >
            <DepartamentoProjetosBlock
              departamentoId={depto.id}
              slug={depto.slug}
              projetos={projetos}
              areas={areasOpcoes}
              podeGerir={isGestor}
              areasSazonaisSemCampanha={areasResumo
                .filter((a) => a.ativa && a.sazonal && !a.campanhaAnoAberta)
                .map((a) => ({ id: a.id, nome: a.nome }))}
            />
          </DepartamentoSectionCard>

          <div id="equipe" className="scroll-mt-20">
            <DepartamentoEquipe
              departamentoId={depto.id}
              slug={depto.slug}
              nome={depto.nome}
              cor={depto.cor}
              membros={membros}
              isGestor={isGestor}
              currentUserId={userId}
              areas={areasFiltro}
            />
          </div>
        </div>
      </div>

      <DepartamentoCanalBlock
        departamentoId={depto.id}
        slug={depto.slug}
        isGestor={isGestor}
        canal={depto.canalConversa}
        canaisDisponiveis={canaisDisponiveis}
      />
    </div>
  )
}

function PainelDominio({
  isGestor,
  operacaoHref,
  totalPendentes,
}: {
  isGestor: boolean
  operacaoHref: string | null
  totalPendentes: number
}) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Diretoria</h2>
      <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
        {isGestor
          ? totalPendentes > 0
            ? `${totalPendentes} solicitação${totalPendentes === 1 ? '' : 'ões'} na fila. Aprove ou reprove sem sair do portal.`
            : 'Fila de solicitações neste departamento. Quando alguém pedir ingresso, aparece aqui.'
          : 'Você é membro deste departamento. A gestão da Diretoria é feita pelos gestores.'}
      </p>
      {isGestor && operacaoHref && (
        <Link
          href={operacaoHref}
          prefetch={false}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <Shield className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          Operação completa (admin)
        </Link>
      )}
    </div>
  )
}
