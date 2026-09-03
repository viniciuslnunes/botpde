import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  Bus,
  CalendarRange,
  Users,
} from 'lucide-react'
import { hasPermission, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { listarProjetosParaEvento } from '@/lib/eventos-tipo'
import { carregarDirecaoCaravanas } from '@/lib/caravanas-direcao'
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

export const metadata: Metadata = { title: 'Caravanas — Admin' }

const CARAVANAS_TABS = ['caravanas', 'pendencias'] as const
const ICONE_TAB = 'h-4 w-4 shrink-0'

async function CaravanasKpis({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoCaravanas(tenantId)
  return (
    <KpiGrid cols={4}>
      <StatCard label="Próximas (45d)" value={ops.proximas} icon={<Bus className="h-5 w-5" />} />
      <StatCard
        label="Lotação crítica"
        value={ops.lotacaoCritica}
        tone={ops.lotacaoCritica > 0 ? 'danger' : 'default'}
        icon={<Users className="h-5 w-5" />}
      />
      <StatCard
        label="Pagos sem embarque"
        value={ops.pagantesSemEmbarque}
        badge="Janela de 72h"
        badgeTone={ops.pagantesSemEmbarque > 0 ? 'warning' : 'default'}
        tone={ops.pagantesSemEmbarque > 0 ? 'warning' : 'default'}
        icon={<AlertTriangle className="h-5 w-5" />}
        href="/admin/caravanas?tab=pendencias"
      />
      <StatCard
        label="Confirmados sem pagar"
        value={ops.confirmadosSemPagar}
        tone={ops.confirmadosSemPagar > 0 ? 'warning' : 'default'}
        icon={<AlertTriangle className="h-5 w-5" />}
        href="/admin/caravanas?tab=pendencias"
      />
    </KpiGrid>
  )
}

async function CaravanasTabs({
  tenantId,
  tab,
}: {
  tenantId: string
  tab: (typeof CARAVANAS_TABS)[number]
}) {
  const ops = await carregarDirecaoCaravanas(tenantId)
  const tabs: AdminTabItem[] = [
    {
      id: 'caravanas',
      label: 'Caravanas',
      icon: <Bus className={ICONE_TAB} />,
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

  return (
    <AdminPendingTabs tabs={tabs} basePath="/admin/caravanas" activeId={tab} paramKey="tab" />
  )
}

async function CaravanasCorpo({
  tenantId,
  podeGerir,
  podeVincular,
  tab,
}: {
  tenantId: string
  podeGerir: boolean
  podeVincular: boolean
  tab: (typeof CARAVANAS_TABS)[number]
}) {
  const ops = await carregarDirecaoCaravanas(tenantId)
  const { tabId, panelId } = adminTabIds('tab', tab)

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
      {tab === 'caravanas' ? (
        <>
          <MotionReveal>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              No mesmo dia do jogo pode haver caravana e ação na unidade — vincule à partida e opere
              o embarque daqui.
            </p>
          </MotionReveal>

          <CaravanasKpis tenantId={tenantId} />

          <DepartamentoSemanaOps
            itens={ops.semana}
            partidas={ops.partidasSemana}
            semanaHref="/admin/eventos?vista=semana&tipo=CARAVANA"
            podeVincularPartida={podeVincular}
            titulo="Semana das caravanas"
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Próximas caravanas
            </h2>
            <AdminEventosList
              eventos={ops.lista}
              emptyTitle="Nenhuma caravana futura"
              emptyDescription="Crie a próxima viagem para o departamento operar o embarque."
              detailBasePath="/admin/caravanas"
            />
          </section>
        </>
      ) : null}

      {tab === 'pendencias' ? (
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={podeGerir}
          emptyTitle="Nenhuma pendência operativa."
          emptyDescription="Lotação e pagamentos das próximas caravanas estão sob controle."
        />
      ) : null}
    </div>
  )
}

async function CaravanasActions({
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
    <div className="flex flex-wrap items-center gap-2">
      <NovoEventoButton
        defaultTipo="CARAVANA"
        sedes={sedes}
        partidas={partidas}
        projetos={projetos}
        temAfiliacao={Boolean(afiliacaoId)}
        departamentoSlug="caravanas"
        redirectTo="/admin/caravanas"
      />
      <NovoEventoButton
        defaultTipo="GERAL"
        sedes={sedes}
        partidas={partidas}
        projetos={projetos}
        temAfiliacao={Boolean(afiliacaoId)}
        departamentoSlug="caravanas"
        redirectTo="/admin/caravanas"
        label="Evento na sede"
      />
    </div>
  )
}

export default async function AdminCaravanasPage({
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
  const tab = parseAcervoTab(sp.tab, CARAVANAS_TABS, 'caravanas')

  return (
    <>
      <AdminPageHeader
        title="Caravanas"
        description="Semana operacional — jogo do dia, lotação, pagamento e embarque."
        icon={<Bus className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminHeaderActionLink href="/admin/eventos?vista=semana&tipo=CARAVANA" icon={CalendarRange}>
              Agenda da semana
            </AdminHeaderActionLink>
            <Suspense fallback={null}>
              <CaravanasActions tenantId={tenant.id} podeGerir={podeGerir} />
            </Suspense>
          </div>
        }
      >
        <Suspense fallback={<div className="h-9 w-full max-w-lg animate-pulse rounded-lg bg-[rgb(var(--border)_/_0.45)]" />}>
          <CaravanasTabs tenantId={tenant.id} tab={tab} />
        </Suspense>
      </AdminPageHeader>

      <div className="app-container space-y-6 py-6">
        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoKpisSkeleton cols={4} />
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <CaravanasCorpo
            tenantId={tenant.id}
            podeGerir={podeGerir}
            podeVincular={podeVincular}
            tab={tab}
          />
        </Suspense>
      </div>
    </>
  )
}
