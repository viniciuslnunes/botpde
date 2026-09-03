import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  CalendarRange,
  LayoutDashboard,
  PartyPopper,
} from 'lucide-react'
import {
  canManageDepartamento,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import { db } from '@torcida/db'
import { assertAnyPermission } from '@/lib/authz'
import { listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { listarProjetosParaEvento } from '@/lib/eventos-tipo'
import { carregarDirecaoCarnaval } from '@/lib/carnaval-direcao'
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
import { CarnavalBarracaoAside } from '@/app/portal/departamentos/_components/carnaval-barracao-aside'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Carnaval — Admin' }

const CARNAVAL_TABS = ['barracao', 'cronograma', 'pendencias'] as const
const ICONE_TAB = 'h-4 w-4 shrink-0'

async function CarnavalKpis({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoCarnaval(tenantId)
  return (
    <KpiGrid cols={3}>
      <StatCard
        label="Barracão"
        value={`${ops.barracaoDone}/${ops.barracaoTotal}`}
        tone={
          ops.urgenciaBarracao
            ? 'danger'
            : ops.barracaoDone < ops.barracaoTotal
              ? 'warning'
              : 'success'
        }
        icon={<PartyPopper className="h-5 w-5" />}
        href="/admin/carnaval?tab=barracao"
        badge={
          ops.diasAteDesfile != null && ops.diasAteDesfile >= 0
            ? `Desfile em ${ops.diasAteDesfile}d`
            : undefined
        }
        badgeTone={ops.urgenciaBarracao ? 'danger' : 'default'}
      />
      <StatCard
        label="Pendentes"
        value={ops.itensPendentes.length}
        tone={ops.itensPendentes.length > 0 ? 'warning' : 'default'}
        icon={<AlertTriangle className="h-5 w-5" />}
        href="/admin/carnaval?tab=pendencias"
      />
      <StatCard
        label="Cronograma (90d)"
        value={ops.proximosEventos}
        icon={<CalendarRange className="h-5 w-5" />}
        href="/admin/carnaval?tab=cronograma"
      />
    </KpiGrid>
  )
}

async function CarnavalTabs({
  tenantId,
  tab,
}: {
  tenantId: string
  tab: (typeof CARNAVAL_TABS)[number]
}) {
  const ops = await carregarDirecaoCarnaval(tenantId)
  const tabs: AdminTabItem[] = [
    {
      id: 'barracao',
      label: 'Barracão',
      icon: <PartyPopper className={ICONE_TAB} />,
      count: ops.barracaoTotal > 0 ? ops.barracaoTotal - ops.barracaoDone : undefined,
      countClass:
        ops.urgenciaBarracao
          ? 'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]'
          : ops.barracaoDone < ops.barracaoTotal
            ? 'bg-amber-500/16 text-amber-700 dark:text-amber-400'
            : undefined,
    },
    {
      id: 'cronograma',
      label: 'Cronograma',
      icon: <CalendarRange className={ICONE_TAB} />,
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

  return <AdminPendingTabs tabs={tabs} basePath="/admin/carnaval" activeId={tab} paramKey="tab" />
}

async function CarnavalCorpo({
  tenantId,
  userId,
  isSuperAdmin,
  effective,
  podeGerirEventos,
  tab,
}: {
  tenantId: string
  userId: string
  isSuperAdmin: boolean
  effective: string[]
  podeGerirEventos: boolean
  tab: (typeof CARNAVAL_TABS)[number]
}) {
  const ops = await carregarDirecaoCarnaval(tenantId)

  const gestoriaRows: Array<{ departamentoId: string }> = await db.departamentoGestor.findMany({
    where: { userId, departamento: { tenantId } },
    select: { departamentoId: true },
  })
  const gestoriaIds = gestoriaRows.map((r) => r.departamentoId)
  const isGestor =
    ops.departamentoId != null &&
    (isSuperAdmin || canManageDepartamento(effective, gestoriaIds, ops.departamentoId))

  const [sedes, partidas, afiliacaoId, projetosList] =
    tab === 'cronograma' && podeGerirEventos
      ? await Promise.all([
          listSedesAtivasParaEvento(tenantId),
          listPartidasParaEvento(tenantId),
          getAfiliacaoIdDoTenant(tenantId),
          listarProjetosParaEvento(tenantId),
        ])
      : [null, null, null, null]

  const { tabId, panelId } = adminTabIds('tab', tab)

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
      {tab === 'barracao' ? (
        <>
          <MotionReveal>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Posto de comando do Carnaval. Detalhe de eventos abre na Agenda.
            </p>
          </MotionReveal>

          <CarnavalKpis tenantId={tenantId} />

          <DepartamentoSemanaOps
            itens={ops.semana}
            partidas={ops.partidasSemana}
            semanaHref="/admin/eventos?vista=semana"
            podeVincularPartida={podeGerirEventos}
            titulo="Semana do Carnaval"
          />

          {ops.departamentoId ? (
            <CarnavalBarracaoAside
              departamentoId={ops.departamentoId}
              slug={ops.departamentoSlug}
              nome={ops.departamentoNome}
              isGestor={isGestor}
              meta={ops.meta}
              proximosCount={ops.proximosEventos}
            />
          ) : null}
        </>
      ) : null}

      {tab === 'cronograma' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Cronograma
            </h2>
            {podeGerirEventos && sedes && partidas && projetosList ? (
              <NovoEventoButton
                defaultTipo="GERAL"
                sedes={sedes}
                partidas={partidas}
                projetos={projetosList}
                temAfiliacao={Boolean(afiliacaoId)}
                departamentoSlug="carnaval"
        redirectTo="/admin/carnaval?tab=cronograma"
              />
            ) : null}
          </div>
          <AdminEventosList
            eventos={ops.lista}
            emptyTitle="Nenhum evento vinculado ao Carnaval"
            emptyDescription="Crie o evento e associe a um projeto deste departamento."
            detailBasePath="/admin/carnaval"
          />
        </section>
      ) : null}

      {tab === 'pendencias' ? (
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={false}
          emptyTitle="Barracão e cronograma em dia."
        />
      ) : null}
    </div>
  )
}

export default async function AdminCarnavalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let effective: string[] = []
  let isSuperAdmin = false
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
    ])
    session = authz.session
    tenant = authz.tenant
    effective = authz.permissoesEfetivas ?? []
    isSuperAdmin = Boolean(authz.isSuperAdmin)
  } catch {
    redirect('/admin')
  }
  if (!session.user?.id) redirect('/portal')

  const podeGerirEventos =
    isSuperAdmin ||
    hasPermission(effective, PERMISSIONS.EVENTS_MANAGE) ||
    hasPermission(effective, PERMISSIONS.EVENTS_CREATE)

  const sp = await searchParams
  const tab = parseAcervoTab(sp.tab, CARNAVAL_TABS, 'barracao')

  return (
    <>
      <AdminPageHeader
        title="Carnaval"
        description="Checklist do barracão e cronograma — sem ERP de escola de samba."
        icon={<PartyPopper className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminHeaderActionLink href="/portal/departamentos/carnaval" icon={LayoutDashboard}>
              Cockpit no portal
            </AdminHeaderActionLink>
            <AdminHeaderActionLink href="/admin/eventos" icon={CalendarRange}>
              Agenda
            </AdminHeaderActionLink>
          </div>
        }
      >
        <Suspense fallback={<div className="h-9 w-full max-w-lg animate-pulse rounded-lg bg-[rgb(var(--border)_/_0.45)]" />}>
          <CarnavalTabs tenantId={tenant.id} tab={tab} />
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
          <CarnavalCorpo
            tenantId={tenant.id}
            userId={session.user.id}
            isSuperAdmin={isSuperAdmin}
            effective={effective}
            podeGerirEventos={podeGerirEventos}
            tab={tab}
          />
        </Suspense>
      </div>
    </>
  )
}
