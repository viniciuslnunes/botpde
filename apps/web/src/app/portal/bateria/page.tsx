import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Music2 } from 'lucide-react'
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

export const metadata: Metadata = { title: 'Bateria' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data)
}

export default async function PortalBateriaPage() {
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
    'bateria',
    rolePermissions,
    overrides,
    isSuperAdmin,
  )
  if (!podeVer) redirect('/portal/departamentos')

  const [proximos, passados] = await Promise.all([
    listarEventosPorTipo(tenant.id, 'ENSAIO', { futuros: true, limite: 40 }),
    listarEventosPorTipo(tenant.id, 'ENSAIO', { futuros: false, limite: 10 }),
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300">
              <Music2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Bateria</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Ensaios e presença
              </p>
            </div>
          </div>
          <Link
            href="/portal/departamentos/bateria"
            className="text-sm font-medium text-[rgb(var(--primary))] hover:underline"
          >
            Ver departamento
          </Link>
        </div>
      </MotionReveal>

      {podeCriar && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="mb-4 text-sm font-semibold text-[rgb(var(--foreground))]">Novo ensaio</h2>
          <CriarEventoForm
            defaultTipo="ENSAIO"
            lockTipo
            redirectTo="/portal/bateria"
            submitLabel="Criar ensaio"
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Próximos ensaios
        </h2>
        <EventosTipoLista
          variant="ensaio"
          basePath="/portal/bateria"
          itens={proximos.map(mapRow)}
          emptyTitle="Nenhum ensaio agendado"
          emptyDescription="Gestores marcam ensaios aqui. No dia, a presença é o check-in."
        />
      </div>

      {passados.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Anteriores
          </h2>
          <EventosTipoLista
            variant="ensaio"
            basePath="/portal/bateria"
            itens={passados.map(mapRow)}
            emptyTitle=""
            emptyDescription=""
          />
        </div>
      )}
    </div>
  )
}
