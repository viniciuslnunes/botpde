import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  CalendarRange,
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
import { CarnavalBarracaoAside } from '@/app/portal/departamentos/_components/carnaval-barracao-aside'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Carnaval — Admin' }

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
        href="#barracao"
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
        href="#barracao"
      />
      <StatCard
        label="Cronograma (90d)"
        value={ops.proximosEventos}
        icon={<CalendarRange className="h-5 w-5" />}
        href="#cronograma"
      />
    </KpiGrid>
  )
}

async function CarnavalInboxListaBarracao({
  tenantId,
  userId,
  isSuperAdmin,
  effective,
  podeGerirEventos,
}: {
  tenantId: string
  userId: string
  isSuperAdmin: boolean
  effective: string[]
  podeGerirEventos: boolean
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

  const [sedes, partidas, afiliacaoId, projetosList] = await Promise.all([
    podeGerirEventos ? listSedesAtivasParaEvento(tenantId) : Promise.resolve([]),
    podeGerirEventos ? listPartidasParaEvento(tenantId) : Promise.resolve([]),
    podeGerirEventos ? getAfiliacaoIdDoTenant(tenantId) : Promise.resolve(null),
    podeGerirEventos ? listarProjetosParaEvento(tenantId) : Promise.resolve([]),
  ])

  return (
    <>
      <DepartamentoSemanaOps
        itens={ops.semana}
        partidas={ops.partidasSemana}
        semanaHref="/admin/eventos?vista=semana"
        podeVincularPartida={podeGerirEventos}
        titulo="Semana do Carnaval"
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Precisa de você
        </h2>
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={false}
          emptyTitle="Barracão e cronograma em dia."
        />
      </section>

      {ops.departamentoId ? (
        <div id="barracao" className="scroll-mt-20">
          <CarnavalBarracaoAside
            departamentoId={ops.departamentoId}
            slug={ops.departamentoSlug}
            nome={ops.departamentoNome}
            isGestor={isGestor}
            meta={ops.meta}
            proximosCount={ops.proximosEventos}
          />
        </div>
      ) : null}

      <section id="cronograma" className="scroll-mt-20 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Cronograma
          </h2>
          {podeGerirEventos ? (
            <NovoEventoButton
              defaultTipo="GERAL"
              sedes={sedes}
              partidas={partidas}
              projetos={projetosList}
              temAfiliacao={Boolean(afiliacaoId)}
              redirectTo="/admin/carnaval"
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
    </>
  )
}

export default async function AdminCarnavalPage() {
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

  return (
    <>
      <AdminPageHeader
        title="Carnaval"
        description="Checklist do barracão e cronograma — sem ERP de escola de samba."
        icon={<PartyPopper className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/portal/departamentos/carnaval"
              className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              Cockpit no portal
            </Link>
            <Link
              href="/admin/eventos"
              className="app-touch-line inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              <CalendarRange className="h-4 w-4" aria-hidden />
              Agenda
            </Link>
          </div>
        }
      />

      <div className="app-container space-y-6 py-6">
        <MotionReveal>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Posto de comando do Carnaval. Detalhe de eventos abre na Agenda.
          </p>
        </MotionReveal>

        <Suspense fallback={<DirecaoKpisSkeleton cols={3} />}>
          <CarnavalKpis tenantId={tenant.id} />
        </Suspense>

        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <CarnavalInboxListaBarracao
            tenantId={tenant.id}
            userId={session.user.id}
            isSuperAdmin={isSuperAdmin}
            effective={effective}
            podeGerirEventos={podeGerirEventos}
          />
        </Suspense>
      </div>
    </>
  )
}
