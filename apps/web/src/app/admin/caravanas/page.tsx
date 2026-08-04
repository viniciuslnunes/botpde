import { Suspense } from 'react'
import Link from 'next/link'
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
import { AdminEventosList } from '@/app/admin/eventos/admin-eventos-list'
import { NovoEventoButton } from '@/components/eventos/novo-evento-button'
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

export const metadata: Metadata = { title: 'Caravanas — Admin' }

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
      />
      <StatCard
        label="Confirmados sem pagar"
        value={ops.confirmadosSemPagar}
        tone={ops.confirmadosSemPagar > 0 ? 'warning' : 'default'}
        icon={<AlertTriangle className="h-5 w-5" />}
      />
    </KpiGrid>
  )
}

async function CaravanasInboxELista({
  tenantId,
  podeGerir,
}: {
  tenantId: string
  podeGerir: boolean
}) {
  const ops = await carregarDirecaoCaravanas(tenantId)
  return (
    <>
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Precisa de você
          </h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Alertas de lotação, pagamento e embarque — ação inline quando possível.
          </p>
        </div>
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={podeGerir}
          emptyTitle="Nenhuma pendência operativa."
          emptyDescription="Lotação e pagamentos das próximas caravanas estão sob controle."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Próximas caravanas
        </h2>
        <AdminEventosList
          eventos={ops.lista}
          emptyTitle="Nenhuma caravana futura"
          emptyDescription="Crie a próxima viagem para o departamento operar o embarque."
        />
      </section>
    </>
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
    <NovoEventoButton
      defaultTipo="CARAVANA"
      sedes={sedes}
      partidas={partidas}
      projetos={projetos}
      temAfiliacao={Boolean(afiliacaoId)}
      redirectTo="/admin/caravanas"
    />
  )
}

export default async function AdminCaravanasPage() {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let podeGerir = false
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.EVENTS_VIEW,
      PERMISSIONS.EVENTS_MANAGE,
      PERMISSIONS.EVENTS_CREATE,
    ])
    session = authz.session
    tenant = authz.tenant
    podeGerir =
      Boolean(authz.isSuperAdmin) ||
      hasPermission(authz.permissoesEfetivas ?? [], PERMISSIONS.EVENTS_MANAGE) ||
      hasPermission(authz.permissoesEfetivas ?? [], PERMISSIONS.EVENTS_CREATE)
  } catch {
    redirect('/admin')
  }
  if (!session.user?.id) redirect('/portal')

  return (
    <>
      <AdminPageHeader
        title="Caravanas"
        description="Operação das viagens — lotação, pagamento e embarque. O calendário completo continua na Agenda."
        icon={<Bus className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/eventos?tipo=CARAVANA"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              <CalendarRange className="h-4 w-4" aria-hidden />
              Ver na Agenda
            </Link>
            <Suspense fallback={null}>
              <CaravanasActions tenantId={tenant.id} podeGerir={podeGerir} />
            </Suspense>
          </div>
        }
      />

      <div className="app-container space-y-6 py-6">
        <MotionReveal>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Posto de comando do departamento de Caravanas. Detalhe e check-in abrem na ficha da
            Agenda.
          </p>
        </MotionReveal>

        <Suspense fallback={<DirecaoKpisSkeleton cols={4} />}>
          <CaravanasKpis tenantId={tenant.id} />
        </Suspense>

        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <CaravanasInboxELista tenantId={tenant.id} podeGerir={podeGerir} />
        </Suspense>
      </div>
    </>
  )
}
