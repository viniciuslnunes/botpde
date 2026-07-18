import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Bus } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { resolveAcessoPluginEvento } from '@/lib/eventos-plugin-access'
import { listarEventosPorTipo } from '@/lib/eventos-tipo'
import { CriarEventoForm } from '@/components/admin/evento-forms'
import {
  EventosTipoLista,
  type EventoTipoRow,
} from '@/components/eventos/eventos-tipo-lista'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Caravanas' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data)
}

export default async function PortalCaravanasPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const isSuperAdmin = isSuperAdminEmail(session.user.email)
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const { podeVer, podeCriar } = await resolveAcessoPluginEvento(
    session.user.id,
    tenant.id,
    'caravanas',
    rolePermissions,
    overrides,
    isSuperAdmin,
  )
  if (!podeVer) redirect('/portal/departamentos')

  const [proximos, passados] = await Promise.all([
    listarEventosPorTipo(tenant.id, 'CARAVANA', { futuros: true, limite: 40 }),
    listarEventosPorTipo(tenant.id, 'CARAVANA', { futuros: false, limite: 10 }),
  ])

  const mapRow = (e: (typeof proximos)[number]): EventoTipoRow => ({
    id: e.id,
    titulo: e.titulo,
    dataLabel: formatarData(e.data),
    local: e.local,
    confirmados: e._count.rsvps,
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-700 dark:text-orange-300">
              <Bus className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Caravanas</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Viagens, RSVP e lista de embarque
              </p>
            </div>
          </div>
          <Link
            href="/portal/departamentos/caravanas"
            className="text-sm font-medium text-[rgb(var(--primary))] hover:underline"
          >
            Ver departamento
          </Link>
        </div>
      </MotionReveal>

      {podeCriar && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="mb-4 text-sm font-semibold text-[rgb(var(--foreground))]">
            Nova caravana
          </h2>
          <CriarEventoForm
            defaultTipo="CARAVANA"
            lockTipo
            redirectTo="/portal/caravanas"
            submitLabel="Criar caravana"
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Próximas
        </h2>
        <EventosTipoLista
          variant="caravana"
          basePath="/portal/caravanas"
          itens={proximos.map(mapRow)}
          emptyTitle="Nenhuma caravana agendada"
          emptyDescription="Gestores criam a próxima viagem aqui. Membros confirmam presença e embarcam no dia."
        />
      </div>

      {passados.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Anteriores
          </h2>
          <EventosTipoLista
            variant="caravana"
            basePath="/portal/caravanas"
            itens={passados.map(mapRow)}
            emptyTitle=""
            emptyDescription=""
          />
        </div>
      )}
    </div>
  )
}
