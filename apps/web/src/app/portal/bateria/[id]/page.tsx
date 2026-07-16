import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, MapPin } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { resolveAcessoPluginEvento } from '@/lib/eventos-plugin-access'
import { getEventoEmbarque } from '@/lib/eventos-tipo'
import { ListaEmbarque, type EmbarqueRow } from '@/components/eventos/lista-embarque'
import { RsvpButtons } from '@/app/portal/eventos/[id]/rsvp-buttons'
import { db } from '@torcida/db'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ensaio' }

type Params = { id: string }

export default async function PortalEnsaioDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const isSuperAdmin = isSuperAdminEmail(session.user.email)
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const { podeVer, podeGerir } = await resolveAcessoPluginEvento(
    session.user.id,
    tenant.id,
    'bateria',
    rolePermissions,
    overrides,
    isSuperAdmin,
  )
  if (!podeVer) redirect('/portal/departamentos')

  const evento = await getEventoEmbarque(tenant.id, id, 'ENSAIO')
  if (!evento) notFound()

  const meuRsvp: { status: 'CONFIRMADO' | 'RECUSADO' } | null =
    await db.eventoRsvp.findUnique({
      where: { eventoId_userId: { eventoId: id, userId: session.user.id } },
      select: { status: true },
    })

  const passado = evento.data < new Date()
  const itens: EmbarqueRow[] = evento.rsvps.map((r) => ({
    id: r.id,
    userId: r.user.id,
    nome: r.user.nome?.trim() || r.user.email,
    email: r.user.email,
    status: r.status,
    checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
  }))

  const dataLabel = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(evento.data)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/portal/bateria"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Bateria
        </Link>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{evento.titulo}</h1>
        {passado && (
          <p className="mt-1 text-xs font-medium text-[rgb(var(--foreground-muted))]">Encerrado</p>
        )}
      </div>

      <div className="space-y-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 text-sm">
        <p className="flex items-center gap-2 text-[rgb(var(--foreground))]">
          <Calendar className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          {dataLabel}
        </p>
        {evento.local && (
          <p className="flex items-center gap-2 text-[rgb(var(--foreground))]">
            <MapPin className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            {evento.local}
          </p>
        )}
        {evento.descricao && (
          <p className="whitespace-pre-wrap pt-2 text-[rgb(var(--foreground-muted))]">
            {evento.descricao}
          </p>
        )}
      </div>

      {!passado && (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="mb-3 text-sm font-semibold text-[rgb(var(--foreground))]">Sua presença</h2>
          <RsvpButtons eventoId={evento.id} statusAtual={meuRsvp?.status ?? null} />
        </div>
      )}

      <ListaEmbarque
        eventoId={evento.id}
        itens={itens}
        podeGerir={podeGerir}
        labelCheckin="Presença"
      />
    </div>
  )
}
