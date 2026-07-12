import Image from 'next/image'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect, notFound } from 'next/navigation'
import { EditarEventoForm } from '@/components/admin/evento-forms'
import { CheckInButton } from './checkin-button'
import Link from 'next/link'
import { ArrowLeft, Users, UserCheck, UserX } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editar Evento' }

export default async function EditarEventoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/portal')

  const evento = await db.evento.findUnique({
    where: { id },
    include: {
      rsvps: {
        include: { user: { select: { id: true, name: true, image: true, email: true } } },
        orderBy: { status: 'asc' },
      },
    },
  })

  if (!evento || evento.tenantId !== tenant.id) notFound()

  type Rsvp = (typeof evento.rsvps)[number]
  const confirmados = evento.rsvps.filter((r: Rsvp) => r.status === 'CONFIRMADO')
  const recusados = evento.rsvps.filter((r: Rsvp) => r.status === 'RECUSADO')

  return (
    <div className="app-container space-y-6 py-8">
      <div>
        <Link
          href="/admin/eventos"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Editar Evento</h1>
      </div>

      {/* Formulário de edição */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <EditarEventoForm evento={evento} />
      </div>

      {/* Lista de RSVPs */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
          <Users className="h-4 w-4" />
          Presença ({evento.rsvps.length} resposta{evento.rsvps.length !== 1 ? 's' : ''})
        </h2>

        {evento.rsvps.length === 0 ? (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhuma resposta ainda.</p>
        ) : (
          <div className="space-y-4">
            {confirmados.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <UserCheck className="h-3.5 w-3.5" />
                  Confirmados ({confirmados.length})
                </p>
                <div className="space-y-1.5">
                  {confirmados.map((r: Rsvp) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 text-sm text-[rgb(var(--foreground))]">
                      <div className="flex min-w-0 items-center gap-2">
                        {r.user.image ? (
                          canOptimizeImageUrl(r.user.image) ? (
                            <Image src={r.user.image} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.user.image} alt="" loading="lazy" decoding="async" className="h-6 w-6 shrink-0 rounded-full" />
                          )
                        ) : (
                          <div className="h-6 w-6 shrink-0 rounded-full bg-[rgb(var(--border))]" />
                        )}
                        <span className="truncate">{r.user.name ?? r.user.email}</span>
                      </div>
                      <CheckInButton eventoId={evento.id} userId={r.user.id} checkedInAt={r.checkedInAt} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recusados.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-red-500">
                  <UserX className="h-3.5 w-3.5" />
                  Recusados ({recusados.length})
                </p>
                <div className="space-y-1.5">
                  {recusados.map((r: Rsvp) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 text-sm text-[rgb(var(--foreground-muted))]">
                      <div className="flex min-w-0 items-center gap-2">
                        {r.user.image ? (
                          canOptimizeImageUrl(r.user.image) ? (
                            <Image src={r.user.image} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full opacity-50" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.user.image} alt="" loading="lazy" decoding="async" className="h-6 w-6 shrink-0 rounded-full opacity-50" />
                          )
                        ) : (
                          <div className="h-6 w-6 shrink-0 rounded-full bg-[rgb(var(--border))]" />
                        )}
                        <span className="truncate">{r.user.name ?? r.user.email}</span>
                      </div>
                      <CheckInButton eventoId={evento.id} userId={r.user.id} checkedInAt={r.checkedInAt} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
