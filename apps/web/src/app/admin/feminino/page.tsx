import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarHeart, CalendarRange, Users, Venus } from 'lucide-react'
import { hasPermission, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { listarProjetosParaEvento } from '@/lib/eventos-tipo'
import { carregarDirecaoFeminino } from '@/lib/feminino-direcao'
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

export const metadata: Metadata = { title: 'Feminino — Admin' }

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
        href="#agenda"
      />
    </KpiGrid>
  )
}

async function FemininoInboxELista({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoFeminino(tenantId)
  return (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Precisa de você
        </h2>
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={false}
          emptyTitle="Feminino em dia."
        />
      </section>

      <section id="agenda" className="scroll-mt-20 space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Agenda da frente
        </h2>
        <AdminEventosList
          eventos={ops.lista}
          emptyTitle="Nenhuma ação com projeto do Feminino"
          emptyDescription="Crie o evento e vincule a um projeto deste departamento."
        />
      </section>
    </>
  )
}

async function FemininoHeaderLinks({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoFeminino(tenantId)
  return (
    <Link
      href={`/portal/departamentos/${ops.departamentoSlug}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
    >
      <Users className="h-4 w-4" aria-hidden />
      Equipe no portal
    </Link>
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
      redirectTo="/admin/feminino"
    />
  )
}

export default async function AdminFemininoPage() {
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
        title="Feminino"
        description="Equipe da frente e agenda de ações — sem app isolado."
        icon={<Venus className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <FemininoHeaderLinks tenantId={tenant.id} />
            </Suspense>
            <Link
              href="/portal/comunidade"
              className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              Comunidade
            </Link>
            <Link
              href="/admin/eventos"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              <CalendarRange className="h-4 w-4" aria-hidden />
              Agenda
            </Link>
            <Suspense fallback={null}>
              <FemininoActions tenantId={tenant.id} podeGerir={podeGerir} />
            </Suspense>
          </div>
        }
      />

      <div className="app-container space-y-6 py-6">
        <MotionReveal>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Thin sobre Agenda e Comunidade. Detalhe de eventos abre na Agenda.
          </p>
        </MotionReveal>

        <Suspense fallback={<DirecaoKpisSkeleton cols={3} />}>
          <FemininoKpis tenantId={tenant.id} />
        </Suspense>

        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <FemininoInboxELista tenantId={tenant.id} />
        </Suspense>
      </div>
    </>
  )
}
