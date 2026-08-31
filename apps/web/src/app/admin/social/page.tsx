import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarHeart, CalendarRange, PartyPopper, Wallet } from 'lucide-react'
import { hasPermission, hrefHomeDepartamento, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { listarProjetosParaEvento } from '@/lib/eventos-tipo'
import { carregarDirecaoSocial } from '@/lib/social-direcao'
import { AdminEventosList } from '@/app/admin/eventos/admin-eventos-list'
import { NovoEventoButton } from '@/components/eventos/novo-evento-button'
import { DepartamentoSemanaOps } from '@/components/admin/departamento-semana-ops'
import {
  AdminInboxList,
  AdminPageHeader,
  DirecaoInboxSkeleton,
  DirecaoKpisSkeleton,
  DirecaoListaSkeleton,
  KpiGrid,
  StatCard,
} from '@/components/admin/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Social — Admin' }

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

async function SocialInboxELista({
  tenantId,
  podeVerFinanceiro,
  podeVincular,
}: {
  tenantId: string
  podeVerFinanceiro: boolean
  podeVincular: boolean
}) {
  const ops = await carregarDirecaoSocial(tenantId, { incluirOrcamento: podeVerFinanceiro })
  return (
    <>
      <DepartamentoSemanaOps
        itens={ops.semana}
        partidas={ops.partidasSemana}
        semanaHref="/admin/eventos?vista=semana"
        podeVincularPartida={podeVincular}
        titulo="Semana do Social"
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Precisa de você
          </h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Campanhas, orçamento e vínculo de eventos.
          </p>
        </div>
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={false}
          emptyTitle="Social em dia."
        />
      </section>

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
  )
}

async function SocialHeaderLinks({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoSocial(tenantId, { incluirOrcamento: false })
  return (
    <Link
      href={hrefHomeDepartamento(ops.departamentoSlug, 'projetos')}
      className="app-touch-line inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
    >
      <PartyPopper className="h-4 w-4" aria-hidden />
      Campanhas no portal
    </Link>
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
      redirectTo="/admin/social"
    />
  )
}

export default async function AdminSocialPage() {
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
            <Link
              href="/admin/eventos?vista=semana"
              className="app-touch-line inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              <CalendarRange className="h-4 w-4" aria-hidden />
              Agenda da semana
            </Link>
            <Suspense fallback={null}>
              <SocialActions tenantId={tenant.id} podeGerir={podeGerir} />
            </Suspense>
          </div>
        }
      />

      <div className="app-container space-y-6 py-6">
        <MotionReveal>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Posto de comando do Social — vincule eventos a projetos para esta lista refletir as
            campanhas.
          </p>
        </MotionReveal>

        <Suspense fallback={<DirecaoKpisSkeleton cols={3} />}>
          <SocialKpis tenantId={tenant.id} podeVerFinanceiro={podeVerFinanceiro} />
        </Suspense>

        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <SocialInboxELista
            tenantId={tenant.id}
            podeVerFinanceiro={podeVerFinanceiro}
            podeVincular={podeVincular}
          />
        </Suspense>
      </div>
    </>
  )
}
