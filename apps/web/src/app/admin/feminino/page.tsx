import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AlertTriangle, CalendarHeart, CalendarRange, Users, Venus } from 'lucide-react'
import { hasPermission, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { listarProjetosParaEvento } from '@/lib/eventos-tipo'
import { carregarDirecaoFeminino } from '@/lib/feminino-direcao'
import { parseAcervoTab } from '@/lib/acervo-tab'
import { AdminEventosList } from '@/app/admin/eventos/admin-eventos-list'
import { NovoEventoButton } from '@/components/eventos/novo-evento-button'
import { DepartamentoSemanaOps } from '@/components/admin/departamento-semana-ops'
import {
  AdminInboxList,
  AdminPageHeader,
  AdminHeaderActionLink,
  AdminPendingTabs,
  adminTabIds,
  DirecaoInboxSkeleton,
  DirecaoKpisSkeleton,
  DirecaoListaSkeleton,
  KpiGrid,
  StatCard,
  type AdminTabItem,
} from '@/components/admin/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Feminino — Admin' }

const FEMININO_TABS = ['agenda', 'pendencias'] as const
const ICONE_TAB = 'h-4 w-4 shrink-0'

async function FemininoKpis({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoFeminino(tenantId)
  return (
    <KpiGrid cols={3}>
      <StatCard
        label="Equipe"
        value={ops.equipe}
        tone={ops.equipe === 0 ? 'warning' : 'default'}
        icon={<Users className="h-5 w-5" />}
        href={`/portal/departamentos/${ops.departamentoSlug}`}
      />
      <StatCard
        label="Gestoras"
        value={ops.gestores}
        tone={ops.gestores === 0 ? 'danger' : 'default'}
        icon={<Venus className="h-5 w-5" />}
        href={`/portal/departamentos/${ops.departamentoSlug}`}
      />
      <StatCard
        label="Ações (60d)"
        value={ops.proximosEventos}
        icon={<CalendarHeart className="h-5 w-5" />}
        href="/admin/feminino?tab=agenda"
      />
    </KpiGrid>
  )
}

async function FemininoTabs({
  tenantId,
  tab,
}: {
  tenantId: string
  tab: (typeof FEMININO_TABS)[number]
}) {
  const ops = await carregarDirecaoFeminino(tenantId)
  const tabs: AdminTabItem[] = [
    {
      id: 'agenda',
      label: 'Agenda',
      icon: <CalendarHeart className={ICONE_TAB} />,
      count: ops.lista.length,
    },
    {
      id: 'pendencias',
      label: 'Precisa de você',
      icon: <AlertTriangle className={ICONE_TAB} />,
      count: ops.pendencias.length,
      countClass:
        ops.pendencias.length > 0
          ? 'bg-amber-500/16 text-amber-700 dark:text-amber-400'
          : undefined,
    },
  ]

  return <AdminPendingTabs tabs={tabs} basePath="/admin/feminino" activeId={tab} paramKey="tab" />
}

async function FemininoCorpo({
  tenantId,
  podeVincular,
  tab,
}: {
  tenantId: string
  podeVincular: boolean
  tab: (typeof FEMININO_TABS)[number]
}) {
  const ops = await carregarDirecaoFeminino(tenantId)
  const { tabId, panelId } = adminTabIds('tab', tab)

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
      {tab === 'agenda' ? (
        <>
          <MotionReveal>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Thin sobre Agenda e Comunidade. Detalhe de eventos abre na Agenda.
            </p>
          </MotionReveal>

          <FemininoKpis tenantId={tenantId} />

          <DepartamentoSemanaOps
            itens={ops.semana}
            partidas={ops.partidasSemana}
            semanaHref="/admin/eventos?vista=semana"
            podeVincularPartida={podeVincular}
            titulo="Semana do Feminino"
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Agenda da frente
            </h2>
            <AdminEventosList
              eventos={ops.lista}
              emptyTitle="Nenhuma ação com projeto do Feminino"
              emptyDescription="Crie o evento e vincule a um projeto deste departamento."
              detailBasePath="/admin/feminino"
            />
          </section>
        </>
      ) : null}

      {tab === 'pendencias' ? (
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={false}
          emptyTitle="Feminino em dia."
        />
      ) : null}
    </div>
  )
}

async function FemininoHeaderLinks({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoFeminino(tenantId)
  return (
    <AdminHeaderActionLink href={`/portal/departamentos/${ops.departamentoSlug}`} icon={Users}>
      Equipe no portal
    </AdminHeaderActionLink>
  )
}

async function FemininoActions({
  tenantId,
  podeGerir,
}: {
  tenantId: string
  podeGerir: boolean
}) {
  if (!podeGerir) return null
  const [sedes, partidas, afiliacaoId, projetos] = await Promise.all([
    listSedesAtivasParaEvento(tenantId),
    listPartidasParaEvento(tenantId),
    getAfiliacaoIdDoTenant(tenantId),
    listarProjetosParaEvento(tenantId),
  ])
  return (
    <NovoEventoButton
      defaultTipo="GERAL"
      sedes={sedes}
      partidas={partidas}
      projetos={projetos}
      temAfiliacao={Boolean(afiliacaoId)}
      departamentoSlug="feminino"
        redirectTo="/admin/feminino"
    />
  )
}

export default async function AdminFemininoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let podeGerir = false
  let podeVincular = false
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
    ])
    session = authz.session
    tenant = authz.tenant
    const efetivas = authz.permissoesEfetivas ?? []
    podeGerir =
      Boolean(authz.isSuperAdmin) ||
      hasPermission(efetivas, PERMISSIONS.EVENTS_MANAGE) ||
      hasPermission(efetivas, PERMISSIONS.EVENTS_CREATE)
    podeVincular =
      Boolean(authz.isSuperAdmin) || hasPermission(efetivas, PERMISSIONS.EVENTS_MANAGE)
  } catch {
    redirect('/admin')
  }
  if (!session.user?.id) redirect('/portal')

  const sp = await searchParams
  const tab = parseAcervoTab(sp.tab, FEMININO_TABS, 'agenda')

  return (
    <>
      <AdminPageHeader
        title="Feminino"
        description="Semana da frente — ações, projetos e vínculo com o jogo do dia."
        icon={<Venus className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <FemininoHeaderLinks tenantId={tenant.id} />
            </Suspense>
            <AdminHeaderActionLink href="/admin/eventos?vista=semana" icon={CalendarRange}>
              Agenda da semana
            </AdminHeaderActionLink>
            <Suspense fallback={null}>
              <FemininoActions tenantId={tenant.id} podeGerir={podeGerir} />
            </Suspense>
          </div>
        }
      >
        <Suspense fallback={<div className="h-9 w-full max-w-lg animate-pulse rounded-lg bg-[rgb(var(--border)_/_0.45)]" />}>
          <FemininoTabs tenantId={tenant.id} tab={tab} />
        </Suspense>
      </AdminPageHeader>

      <div className="app-container space-y-6 py-6">
        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoKpisSkeleton cols={3} />
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <FemininoCorpo tenantId={tenant.id} podeVincular={podeVincular} tab={tab} />
        </Suspense>
      </div>
    </>
  )
}
