import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  CalendarRange,
  Drum,
  Music2,
  Users,
  Wrench,
} from 'lucide-react'
import { hasPermission, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { listSedesAtivasParaEvento } from '@/lib/eventos-query'
import { getAfiliacaoIdDoTenant, listPartidasParaEvento } from '@/lib/partidas'
import { listarProjetosParaEvento } from '@/lib/eventos-tipo'
import { carregarDirecaoBateria } from '@/lib/bateria-direcao'
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

export const metadata: Metadata = { title: 'Bateria — Admin' }

async function BateriaKpis({
  tenantId,
  podeVerPatrimonio,
}: {
  tenantId: string
  podeVerPatrimonio: boolean
}) {
  const ops = await carregarDirecaoBateria(tenantId, {
    incluirInstrumentos: podeVerPatrimonio,
  })
  return (
    <KpiGrid cols={4}>
      <StatCard label="Próximos (45d)" value={ops.proximos} icon={<Music2 className="h-5 w-5" />} />
      <StatCard
        label="Confirmados"
        value={ops.confirmadosProximos}
        icon={<Users className="h-5 w-5" />}
      />
      <StatCard
        label="Faltosos (último)"
        value={ops.faltososUltimo}
        tone={ops.faltososUltimo > 0 ? 'warning' : 'default'}
        icon={<AlertTriangle className="h-5 w-5" />}
      />
      {podeVerPatrimonio ? (
        <StatCard
          label="Instrumentos em uso"
          value={ops.instrumentosEmUso}
          tone={ops.instrumentosEmUso > 0 ? 'warning' : 'default'}
          icon={<Wrench className="h-5 w-5" />}
          href="/admin/patrimonio?categoria=INSTRUMENTO&status=EM_USO"
        />
      ) : (
        <StatCard
          label="Instrumentos"
          value="—"
          badge="Sem acesso ao patrimônio"
          badgeTone="default"
        />
      )}
    </KpiGrid>
  )
}

async function BateriaInboxELista({
  tenantId,
  podeVerPatrimonio,
}: {
  tenantId: string
  podeVerPatrimonio: boolean
}) {
  const ops = await carregarDirecaoBateria(tenantId, {
    incluirInstrumentos: podeVerPatrimonio,
  })
  return (
    <>
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Precisa de você
          </h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Faltosos, ensaios sem confirmação e instrumentos emprestados.
          </p>
        </div>
        <AdminInboxList
          itens={ops.pendencias}
          podeAgir={false}
          emptyTitle="Nenhuma pendência operativa."
          emptyDescription="Ensaios e instrumentos estão sob controle."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Próximos ensaios
        </h2>
        <AdminEventosList
          eventos={ops.lista}
          emptyTitle="Nenhum ensaio futuro"
          emptyDescription="Crie o próximo ensaio para a bateria marcar presença."
        />
      </section>
    </>
  )
}

async function BateriaActions({
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
      defaultTipo="ENSAIO"
      sedes={sedes}
      partidas={partidas}
      projetos={projetos}
      temAfiliacao={Boolean(afiliacaoId)}
      redirectTo="/admin/bateria"
    />
  )
}

export default async function AdminBateriaPage() {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let podeGerir = false
  let podeVerPatrimonio = false
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
    podeVerPatrimonio =
      Boolean(authz.isSuperAdmin) ||
      hasPermission(authz.permissoesEfetivas ?? [], PERMISSIONS.PATRIMONY_VIEW) ||
      hasPermission(authz.permissoesEfetivas ?? [], PERMISSIONS.PATRIMONY_MANAGE)
  } catch {
    redirect('/admin')
  }
  if (!session.user?.id) redirect('/portal')

  return (
    <>
      <AdminPageHeader
        title="Bateria"
        description="Operação de ensaios e escala — presença, faltosos e instrumentos. O calendário completo continua na Agenda."
        icon={<Drum className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/eventos?tipo=ENSAIO"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              <CalendarRange className="h-4 w-4" aria-hidden />
              Ver na Agenda
            </Link>
            <Suspense fallback={null}>
              <BateriaActions tenantId={tenant.id} podeGerir={podeGerir} />
            </Suspense>
          </div>
        }
      />

      <div className="app-container space-y-6 py-6">
        <MotionReveal>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Posto de comando do departamento de Bateria. Detalhe e presença abrem na ficha da
            Agenda.
          </p>
        </MotionReveal>

        <Suspense fallback={<DirecaoKpisSkeleton cols={4} />}>
          <BateriaKpis tenantId={tenant.id} podeVerPatrimonio={podeVerPatrimonio} />
        </Suspense>

        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <BateriaInboxELista tenantId={tenant.id} podeVerPatrimonio={podeVerPatrimonio} />
        </Suspense>
      </div>
    </>
  )
}
