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
  podeVincular,
}: {
  tenantId: string
  podeGerir: boolean
  podeVincular: boolean
}) {
  const ops = await carregarDirecaoCaravanas(tenantId)
  return (
    <>
      <DepartamentoSemanaOps
        itens={ops.semana}
        partidas={ops.partidasSemana}
        semanaHref="/admin/eventos?vista=semana&tipo=CARAVANA"
        podeVincularPartida={podeVincular}
        titulo="Semana das caravanas"
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Precisa de você
          </h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Lotação, pagamento, embarque e vínculo com o jogo do dia.
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
          detailBasePath="/admin/caravanas"
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
    <div className="flex flex-wrap items-center gap-2">
      <NovoEventoButton
        defaultTipo="CARAVANA"
        sedes={sedes}
        partidas={partidas}
        projetos={projetos}
        temAfiliacao={Boolean(afiliacaoId)}
        redirectTo="/admin/caravanas"
      />
      <NovoEventoButton
        defaultTipo="GERAL"
        sedes={sedes}
        partidas={partidas}
        projetos={projetos}
        temAfiliacao={Boolean(afiliacaoId)}
        redirectTo="/admin/caravanas"
        label="Evento na sede"
      />
    </div>
  )
}

export default async function AdminCaravanasPage() {
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

  return (
    <>
      <AdminPageHeader
        title="Caravanas"
        description="Semana operacional — jogo do dia, lotação, pagamento e embarque."
        icon={<Bus className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/eventos?vista=semana&tipo=CARAVANA"
              className="app-touch-line inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              <CalendarRange className="h-4 w-4" aria-hidden />
              Agenda da semana
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
            No mesmo dia do jogo pode haver caravana e ação na unidade — vincule à partida e opere
            o embarque daqui.
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
          <CaravanasInboxELista
            tenantId={tenant.id}
            podeGerir={podeGerir}
            podeVincular={podeVincular}
          />
        </Suspense>
      </div>
    </>
  )
}
