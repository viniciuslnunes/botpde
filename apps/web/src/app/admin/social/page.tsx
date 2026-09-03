import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AlertTriangle, CalendarHeart, CalendarRange, PartyPopper, Wallet } from 'lucide-react'
import { hasPermission, hrefHomeDepartamento, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { listarProjetosParaEvento } from '@/lib/eventos-tipo'
import { carregarDirecaoSocial } from '@/lib/social-direcao'
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

export const metadata: Metadata = { title: 'Social — Admin' }

const SOCIAL_TABS = ['acoes', 'pendencias'] as const
const ICONE_TAB = 'h-4 w-4 shrink-0'

async function SocialKpis({
  tenantId,
  podeVerFinanceiro,
}: {
  tenantId: string
  podeVerFinanceiro: boolean
}) {
  const ops = await carregarDirecaoSocial(tenantId, { incluirOrcamento: podeVerFinanceiro })
  return (
    <KpiGrid cols={3}>
      <StatCard
        label="Campanhas abertas"
        value={ops.campanhasAbertas}
        icon={<PartyPopper className="h-5 w-5" />}
        href={hrefHomeDepartamento(ops.departamentoSlug, 'projetos')}
      />
      <StatCard
        label="Ações (45d)"
        value={ops.proximosEventos}
        icon={<CalendarHeart className="h-5 w-5" />}
      />
      {podeVerFinanceiro ? (
        <StatCard
          label="Orçamentos estourados"
          value={ops.orcamentosEstourados}
          tone={ops.orcamentosEstourados > 0 ? 'danger' : 'default'}
          icon={<Wallet className="h-5 w-5" />}
          href={hrefHomeDepartamento(ops.departamentoSlug, 'projetos')}
        />
      ) : (
        <StatCard
          label="Orçamento"
          value="—"
          badge="Sem finance:view"
          badgeTone="default"
          icon={<Wallet className="h-5 w-5" />}
        />
      )}
    </KpiGrid>
  )
}

async function SocialTabs({
  tenantId,
  podeVerFinanceiro,
  tab,
}: {
  tenantId: string
  podeVerFinanceiro: boolean
  tab: (typeof SOCIAL_TABS)[number]
}) {
  const ops = await carregarDirecaoSocial(tenantId, { incluirOrcamento: podeVerFinanceiro })
  const tabs: AdminTabItem[] = [
    {
      id: 'acoes',
      label: 'Ações',
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

  return <AdminPendingTabs tabs={tabs} basePath="/admin/social" activeId={tab} paramKey="tab" />
}

async function SocialCorpo({
  tenantId,
  podeVerFinanceiro,
  podeVincular,
  tab,
}: {
  tenantId: string
  podeVerFinanceiro: boolean
  podeVincular: boolean
  tab: (typeof SOCIAL_TABS)[number]
}) {
  const ops = await carregarDirecaoSocial(tenantId, { incluirOrcamento: podeVerFinanceiro })
  const { tabId, panelId } = adminTabIds('tab', tab)

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
      {tab === 'acoes' ? (
        <>
          <MotionReveal>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Posto de comando do Social — vincule eventos a projetos para esta lista refletir as
              campanhas.
            </p>
          </MotionReveal>

          <SocialKpis tenantId={tenantId} podeVerFinanceiro={podeVerFinanceiro} />

          <DepartamentoSemanaOps
            itens={ops.semana}
            partidas={ops.partidasSemana}
            semanaHref="/admin/eventos?vista=semana"
            podeVincularPartida={podeVincular}
            titulo="Semana do Social"
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Próximas ações do Social
            </h2>
            <AdminEventosList
              eventos={ops.lista}
              emptyTitle="Nenhuma ação com projeto do Social"
              emptyDescription="Crie o evento e vincule a uma campanha/projeto do departamento."
              detailBasePath="/admin/social"
            />
          </section>
        </>
      ) : null}

      {tab === 'pendencias' ? (
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={false}
          emptyTitle="Social em dia."
        />
      ) : null}
    </div>
  )
}

async function SocialHeaderLinks({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoSocial(tenantId, { incluirOrcamento: false })
  return (
    <AdminHeaderActionLink href={hrefHomeDepartamento(ops.departamentoSlug, 'projetos')} icon={PartyPopper}>
      Campanhas no portal
    </AdminHeaderActionLink>
  )
}

async function SocialActions({
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
      departamentoSlug="social-e-eventos"
        redirectTo="/admin/social"
    />
  )
}

export default async function AdminSocialPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let podeGerir = false
  let podeVerFinanceiro = false
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
    podeVerFinanceiro =
      Boolean(authz.isSuperAdmin) ||
      hasPermission(efetivas, PERMISSIONS.FINANCE_VIEW) ||
      hasPermission(efetivas, PERMISSIONS.FINANCE_MANAGE)
  } catch {
    redirect('/admin')
  }
  if (!session.user?.id) redirect('/portal')

  const sp = await searchParams
  const tab = parseAcervoTab(sp.tab, SOCIAL_TABS, 'acoes')

  return (
    <>
      <AdminPageHeader
        title="Social e eventos"
        description="Semana das campanhas — ações na sede e vínculo com o jogo do dia."
        icon={<CalendarHeart className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <SocialHeaderLinks tenantId={tenant.id} />
            </Suspense>
            <AdminHeaderActionLink href="/admin/eventos?vista=semana" icon={CalendarRange}>
              Agenda da semana
            </AdminHeaderActionLink>
            <Suspense fallback={null}>
              <SocialActions tenantId={tenant.id} podeGerir={podeGerir} />
            </Suspense>
          </div>
        }
      >
        <Suspense fallback={<div className="h-9 w-full max-w-lg animate-pulse rounded-lg bg-[rgb(var(--border)_/_0.45)]" />}>
          <SocialTabs tenantId={tenant.id} podeVerFinanceiro={podeVerFinanceiro} tab={tab} />
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
          <SocialCorpo
            tenantId={tenant.id}
            podeVerFinanceiro={podeVerFinanceiro}
            podeVincular={podeVincular}
            tab={tab}
          />
        </Suspense>
      </div>
    </>
  )
}
