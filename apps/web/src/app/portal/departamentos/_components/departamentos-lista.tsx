import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  calculateEffectivePermissions,
  hasPermission,
  hrefHomeDepartamento,
  hrefModuloPortal,
  isDepartamentoLegado,
  missionDepartamento,
  PERMISSIONS,
  resolverModuloPortalDepartamento,
  rotuloAreaDepartamento,
} from '@torcida/types'
import { Badge } from '@torcida/ui'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  resolverDepartamentosHub,
  type DeptoHubBase,
  type DeptoHubItem,
} from '@/lib/departamentos-portal-access'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { ArrowRight, Briefcase, Eye, Layers, LayoutGrid, Settings2 } from 'lucide-react'
import { DepartamentoIcone } from './departamento-icone'
import { DepartamentoCorPicker } from './departamento-cor-picker'

interface MembershipLite {
  departamentoId: string
  departamento: DeptoHubBase
}
interface GestorLite {
  departamentoId: string
}

/** KPI curto do card — só aparece quando a permissão do usuário cobre o dado. */
export type DeptoKpi = { rotulo: string; valor: string; alerta: boolean }

type DeptoHubCardItem = DeptoHubItem & {
  podeEditarCor: boolean
  /** Áreas do departamento em que ESTA pessoa atua (vazio para visão Diretoria). */
  minhasAreas: string[]
  kpi: DeptoKpi | null
}

/** O que cada papel pode fazer — o vocabulário do hub era implícito até aqui. */
function explicacaoPapel(depto: DeptoHubItem): string {
  if (depto.isGestor) {
    return depto.visaoDiretoria
      ? 'Você gere este departamento pela Presidência/Liderança: pode organizar áreas, equipe e operação, mesmo sem atuar nele no dia a dia.'
      : 'Você gere este departamento: pode organizar áreas, incluir e remover pessoas da equipe e definir responsáveis.'
  }
  if (depto.visaoDiretoria) {
    return 'Você enxerga este departamento como Diretoria: leitura da home, sem gestão. Quem gere é o gestor da área.'
  }
  return 'Você atua neste departamento: vê a equipe, as áreas e o painel do domínio. A gestão é do gestor da área.'
}

/** Rótulo curto do atalho para o módulo portal (não a home do departamento). */
function rotuloAtalhoModulo(slug: string): string {
  switch (slug) {
    case 'financeiro':
      return 'Caixa'
    case 'patrimonio':
      return 'Inventário'
    case 'bateria':
      return 'Ensaios'
    case 'caravanas':
      return 'Caravanas'
    case 'carnaval':
      return 'Barracão'
    case 'materiais-loja':
      return 'Loja'
    case 'comunicacao':
      return 'Comunidade'
    case 'social-e-eventos':
    case 'feminino':
      return 'Eventos'
    default:
      return 'Abrir módulo'
  }
}

function DeptoHubCard({ depto, index }: { depto: DeptoHubCardItem; index: number }) {
  const moduloKey = resolverModuloPortalDepartamento(depto.slug, depto.moduloPortal)
  const homeHref = hrefHomeDepartamento(depto.slug)
  const moduloHref = hrefModuloPortal(moduloKey)
  const areaLabel = rotuloAreaDepartamento(depto.slug, depto.moduloPortal)
  // Atualhos de módulo/gestão: quem tem isGestor (row ou roles:manage) opera;
  // visão Diretoria só-leitura fica sem esses CTAs.
  const mostraModulo = Boolean(moduloHref) && (depto.isAtuacao || depto.isGestor)
  const mostraGestao = depto.isGestor
  const mission = missionDepartamento(depto.slug)
  const areasVisiveis = depto.minhasAreas.slice(0, 3)
  const areasRestantes = depto.minhasAreas.length - areasVisiveis.length
  const papelBadge = depto.isGestor ? (
    <Badge variant="primary">Gestor</Badge>
  ) : depto.visaoDiretoria ? (
    <Badge variant="neutral" icon={<Eye className="h-3 w-3" aria-hidden />}>
      Só leitura
    </Badge>
  ) : (
    <Badge variant="neutral">Membro</Badge>
  )

  return (
    <MotionReveal index={index} className="h-full">
      <div className="flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-[border-color,box-shadow] duration-150 hover:border-[rgb(var(--primary)_/_0.45)] hover:shadow-sm">
        <div className="flex items-start gap-3">
          {depto.podeEditarCor ? (
            <DepartamentoCorPicker
              departamentoId={depto.id}
              cor={depto.cor}
              nome={depto.nome}
              slug={depto.slug}
            />
          ) : (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: depto.cor }}
            >
              <DepartamentoIcone slug={depto.slug} className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground))]">
                {depto.nome}
              </h2>
              <span className="shrink-0" title={explicacaoPapel(depto)}>
                {papelBadge}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">{areaLabel}</p>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          {mission}
        </p>

        {areasVisiveis.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Layers
              className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]"
              aria-hidden
            />
            {areasVisiveis.map((nome) => (
              <span
                key={nome}
                className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))]"
              >
                {nome}
              </span>
            ))}
            {areasRestantes > 0 && (
              <span
                className="text-[11px] font-medium text-[rgb(var(--foreground-muted))]"
                title={depto.minhasAreas.join(' · ')}
              >
                +{areasRestantes}
              </span>
            )}
          </div>
        )}

        {depto.kpi && (
          <div className="mt-3 flex items-baseline gap-1.5">
            <span
              className={
                depto.kpi.alerta
                  ? 'text-lg font-bold leading-none text-[rgb(var(--color-danger-fg))]'
                  : 'text-lg font-bold leading-none text-[rgb(var(--foreground))]'
              }
            >
              {depto.kpi.valor}
            </span>
            <span className="text-xs text-[rgb(var(--foreground-muted))]">{depto.kpi.rotulo}</span>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <Link
            href={homeHref}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface))]"
          >
            Abrir departamento
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </Link>

          {mostraModulo && moduloHref && (
            <Link
              href={moduloHref}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
            >
              <LayoutGrid className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" aria-hidden />
              {rotuloAtalhoModulo(depto.slug)}
            </Link>
          )}

          {mostraGestao && (
            <Link
              href={`${homeHref}#gestao`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
            >
              <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Gestão
            </Link>
          )}
        </div>
      </div>
    </MotionReveal>
  )
}

function DeptoHubGrid({
  items,
  indexOffset = 0,
}: {
  items: DeptoHubCardItem[]
  indexOffset?: number
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((depto, i) => (
        <DeptoHubCard key={depto.id} depto={depto} index={indexOffset + i} />
      ))}
    </div>
  )
}

/**
 * KPI contextual de cada card. Um único round-trip: cada consulta só sai se o
 * departamento estiver visível E a permissão do usuário cobrir aquele dado —
 * nunca vaza número de módulo que a pessoa não pode ver.
 */
async function carregarKpisHub(input: {
  tenantId: string
  slugsVisiveis: Set<string>
  permissoes: string[]
  isSuperAdmin: boolean
}): Promise<Map<string, DeptoKpi>> {
  const { tenantId, slugsVisiveis, permissoes, isSuperAdmin } = input
  const pode = (p: string): boolean => isSuperAdmin || hasPermission(permissoes, p)
  const quando = <T,>(cond: boolean, q: () => Promise<T>, vazio: T): Promise<T> =>
    cond ? q() : Promise.resolve(vazio)

  const agora = new Date()
  type EventoData = { data: Date } | null

  const [
    admissaoPendente,
    cobrancasVencidas,
    itensManutencao,
    pedidosAbertos,
    denunciasAbertas,
    proximoEnsaio,
    proximaCaravana,
  ]: [number, number, number, number, number, EventoData, EventoData] = await Promise.all([
    quando(
      slugsVisiveis.has('diretoria') && pode(PERMISSIONS.MEMBERS_VIEW),
      () => db.saasMembro.count({ where: { tenantId, status: 'PENDENTE' } }),
      0,
    ),
    quando(
      slugsVisiveis.has('financeiro') && pode(PERMISSIONS.FINANCE_VIEW),
      () => db.cobrancaAssociacao.count({ where: { tenantId, status: 'VENCIDA' } }),
      0,
    ),
    quando(
      slugsVisiveis.has('patrimonio') && pode(PERMISSIONS.PATRIMONY_VIEW),
      () => db.patrimonioItem.count({ where: { tenantId, status: 'MANUTENCAO' } }),
      0,
    ),
    quando(
      slugsVisiveis.has('materiais-loja') && pode(PERMISSIONS.STORE_VIEW_ORDERS),
      () => db.saasPedido.count({ where: { tenantId, status: 'PENDENTE' } }),
      0,
    ),
    quando(
      slugsVisiveis.has('comunicacao') && pode(PERMISSIONS.COMMUNITY_MODERATE),
      () => db.denuncia.count({ where: { tenantId, status: 'PENDENTE' } }),
      0,
    ),
    quando<EventoData>(
      slugsVisiveis.has('bateria') && pode(PERMISSIONS.EVENTS_VIEW),
      () =>
        db.evento.findFirst({
          where: { tenantId, tipo: 'ENSAIO', data: { gte: agora } },
          orderBy: { data: 'asc' },
          select: { data: true },
        }),
      null,
    ),
    quando<EventoData>(
      slugsVisiveis.has('caravanas') && pode(PERMISSIONS.EVENTS_VIEW),
      () =>
        db.evento.findFirst({
          where: { tenantId, tipo: 'CARAVANA', data: { gte: agora } },
          orderBy: { data: 'asc' },
          select: { data: true },
        }),
      null,
    ),
  ])

  const fmtData = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Sao_Paulo',
  })
  const kpis = new Map<string, DeptoKpi>()
  const set = (slug: string, kpi: DeptoKpi): void => {
    kpis.set(slug, kpi)
  }

  if (admissaoPendente > 0) {
    set('diretoria', {
      valor: String(admissaoPendente),
      rotulo: 'na fila de admissão',
      alerta: true,
    })
  }
  if (cobrancasVencidas > 0) {
    set('financeiro', {
      valor: String(cobrancasVencidas),
      rotulo: cobrancasVencidas === 1 ? 'cobrança vencida' : 'cobranças vencidas',
      alerta: true,
    })
  }
  if (itensManutencao > 0) {
    set('patrimonio', {
      valor: String(itensManutencao),
      rotulo: itensManutencao === 1 ? 'item em manutenção' : 'itens em manutenção',
      alerta: false,
    })
  }
  if (pedidosAbertos > 0) {
    set('materiais-loja', {
      valor: String(pedidosAbertos),
      rotulo: pedidosAbertos === 1 ? 'pedido em aberto' : 'pedidos em aberto',
      alerta: true,
    })
  }
  if (denunciasAbertas > 0) {
    set('comunicacao', {
      valor: String(denunciasAbertas),
      rotulo: denunciasAbertas === 1 ? 'denúncia pendente' : 'denúncias pendentes',
      alerta: true,
    })
  }
  if (proximoEnsaio) {
    set('bateria', { valor: fmtData.format(proximoEnsaio.data), rotulo: 'próximo ensaio', alerta: false })
  }
  if (proximaCaravana) {
    set('caravanas', {
      valor: fmtData.format(proximaCaravana.data),
      rotulo: 'próxima caravana',
      alerta: false,
    })
  }

  return kpis
}

export function DepartamentosFallback() {
  return (
    <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-36 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
        />
      ))}
    </div>
  )
}

export async function DepartamentosSection() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const isSuperAdmin = isSuperAdminEmail(session.user.email)

  const [memberships, gestorDe, todosRaw, perms]: [
    MembershipLite[],
    GestorLite[],
    DeptoHubBase[],
    Awaited<ReturnType<typeof getUserPermissionsInTenant>>,
  ] = await Promise.all([
    db.userDepartamento.findMany({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: {
        departamentoId: true,
        departamento: {
          select: {
            id: true,
            nome: true,
            slug: true,
            cor: true,
            permissions: true,
            permissionsGestor: true,
            moduloPortal: true,
            ordem: true,
          },
        },
      },
    }),
    db.departamentoGestor.findMany({
      where: { userId: session.user.id, departamento: { tenantId: tenant.id } },
      select: { departamentoId: true },
    }),
    db.departamento.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        nome: true,
        slug: true,
        cor: true,
        permissions: true,
        permissionsGestor: true,
        moduloPortal: true,
        ordem: true,
      },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    }),
    getUserPermissionsInTenant(session.user.id, tenant.id),
  ])

  const todosTenant = todosRaw.filter((d) => !isDepartamentoLegado(d))
  const effective = calculateEffectivePermissions(perms.rolePermissions, perms.overrides)
  // Edição de cor = roles:manage real (dual-hat SA) ou gestor da área — não o bypass.
  const podeGerirCoresGlobal = hasPermission(effective, PERMISSIONS.ROLES_MANAGE)

  const diretoriaId = todosTenant.find((d) => d.slug === 'diretoria')?.id ?? null
  const departamentos = resolverDepartamentosHub({
    todos: todosTenant,
    membershipIds: memberships
      .filter((m) => !isDepartamentoLegado(m.departamento))
      .map((m) => m.departamentoId),
    gestorIds: gestorDe.map((g) => g.departamentoId),
    diretoriaId,
    isSuperAdmin,
    podeGerirGlobal: podeGerirCoresGlobal,
  })

  const kpiPorSlug = await carregarKpisHub({
    tenantId: tenant.id,
    slugsVisiveis: new Set(departamentos.map((d) => d.slug)),
    permissoes: effective,
    isSuperAdmin,
  })

  // Áreas em que ESTA pessoa atua, agrupadas por departamento. Uma query só —
  // o card mostra até 3 chips e o resto vira "+N".
  type AreaVinculoRow = {
    area: { nome: string; departamentoId: string; ativa: boolean }
  }
  const vinculosArea: AreaVinculoRow[] = await db.departamentoAreaMembro.findMany({
    where: { userId: session.user.id, area: { tenantId: tenant.id } },
    select: { area: { select: { nome: true, departamentoId: true, ativa: true } } },
  })
  const areasPorDepto = new Map<string, string[]>()
  for (const v of [...vinculosArea].sort((a, b) => {
    if (a.area.ativa !== b.area.ativa) return a.area.ativa ? -1 : 1
    return a.area.nome.localeCompare(b.area.nome, 'pt-BR')
  })) {
    const lista = areasPorDepto.get(v.area.departamentoId) ?? []
    lista.push(v.area.nome)
    areasPorDepto.set(v.area.departamentoId, lista)
  }

  const cards: DeptoHubCardItem[] = departamentos.map((d) => ({
    ...d,
    // Gestor da área ou quem tem roles:manage (Presidência / SA).
    podeEditarCor: podeGerirCoresGlobal || d.isGestor,
    // Visão Diretoria é leitura: não anuncia atuação que a pessoa não tem.
    minhasAreas: d.isAtuacao ? (areasPorDepto.get(d.id) ?? []) : [],
    kpi: kpiPorSlug.get(d.slug) ?? null,
  }))

  if (cards.length === 0) {
    return (
      <MotionEmptyState
        icon={<Briefcase className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title="Você ainda não faz parte de nenhum departamento."
        description="Quando a diretoria te incluir em um departamento, eles aparecem aqui."
      />
    )
  }

  const meusDepartamentos = cards.filter((d) => d.isAtuacao)
  const demaisDepartamentos = cards.filter((d) => d.visaoDiretoria)
  const temSecoes = meusDepartamentos.length > 0 && demaisDepartamentos.length > 0
  const gereDemais = demaisDepartamentos.some((d) => d.isGestor)

  return (
    <div className="space-y-8">
      {demaisDepartamentos.length > 0 && (
        <p className="rounded-xl border border-[rgb(var(--primary)_/_0.2)] bg-[rgb(var(--primary)_/_0.06)] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
          {gereDemais
            ? temSecoes
              ? 'Como Presidência/Liderança, você também gere os demais departamentos: áreas, equipe e operação.'
              : 'Você vê e gere todos os departamentos da torcida.'
            : temSecoes
              ? 'Como Diretoria, você também vê os demais departamentos em só leitura. Gestão só onde você é gestor.'
              : 'Você vê todos os departamentos da torcida. Gestão só onde você é gestor.'}
        </p>
      )}

      {temSecoes ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Meus departamentos
            </h2>
            <DeptoHubGrid items={meusDepartamentos} />
          </section>
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Demais departamentos
              </h2>
              <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                {gereDemais
                  ? 'Visão da Presidência/Liderança · gestão em todos'
                  : 'Visão da Diretoria · só leitura da home'}
              </p>
            </div>
            <DeptoHubGrid
              items={demaisDepartamentos}
              indexOffset={meusDepartamentos.length}
            />
          </section>
        </>
      ) : (
        <DeptoHubGrid items={cards} />
      )}
    </div>
  )
}
