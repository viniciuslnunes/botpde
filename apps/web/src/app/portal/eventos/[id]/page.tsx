import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RsvpButtons } from './rsvp-buttons'
import { criarSalaDeEvento } from '@/app/portal/comunidade/salas/actions'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  UserCheck,
  AlertCircle,
  Building2,
} from 'lucide-react'
import type { Metadata } from 'next'
import {
  PERMISSIONS,
  TIPO_EVENTO_LABEL,
  calculateEffectivePermissions,
  hasPermission,
} from '@torcida/types'
import {
  EventoConfirmadosGrid,
  EventoDetailReveal,
} from '@/components/portal/evento-detail-motion'
import { EventoTipoBadge } from '@/components/eventos/evento-tipo-badge'
import { ListaEmbarque, type EmbarqueRow } from '@/components/eventos/lista-embarque'
import { CaravanaVagaPagamento } from '@/app/portal/caravanas/_components/caravana-vaga-pagamento'
import { EventoAcoesRapidas } from '@/components/eventos/evento-acoes-rapidas'
import { capacidadeEfetiva, lotacaoCheia } from '@/lib/eventos-capacidade'
import { getEventoEmbarque } from '@/lib/eventos-tipo'

export const metadata: Metadata = { title: 'Evento' }

function formatarDataCompleta(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(data),
  )
}

export default async function EventoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) notFound()

  const evento = await getEventoEmbarque(tenant.id, id)
  if (!evento) notFound()

  const [meuRsvp, cobrancaEPerms] = await Promise.all([
    session?.user?.id
      ? db.eventoRsvp.findUnique({
          where: { eventoId_userId: { eventoId: id, userId: session.user.id } },
          select: { status: true },
        })
      : Promise.resolve(null),
    session?.user?.id
      ? getUserPermissionsInTenant(session.user.id, tenant.id).then(async ({ rolePermissions, overrides }) => {
          const effective = calculateEffectivePermissions(rolePermissions, overrides)
          const podeCriarSala = hasPermission(effective, PERMISSIONS.MEETINGS_HOST)
          const podeGerir = hasPermission(effective, PERMISSIONS.EVENTS_MANAGE)
          const minhaCobranca =
            evento.tipo === 'CARAVANA'
              ? await db.cobrancaAssociacao.findFirst({
                  where: { tenantId: tenant.id, eventoId: id, userId: session.user!.id },
                  select: { id: true, status: true },
                })
              : null
          return { podeCriarSala, podeGerir, minhaCobranca }
        })
      : Promise.resolve({
          podeCriarSala: false,
          podeGerir: false,
          minhaCobranca: null as { id: string; status: string } | null,
        }),
  ])

  const { podeCriarSala, podeGerir, minhaCobranca } = cobrancaEPerms

  const passado = new Date(evento.data) < new Date()
  const confirmadosCount = evento.rsvps.filter((r) => r.status === 'CONFIRMADO').length
  const embarcadosCount = evento.rsvps.filter((r) => r.checkedInAt).length
  const esperaCount = evento.rsvps.filter((r) => r.status === 'LISTA_ESPERA').length
  const cap = capacidadeEfetiva({
    capacidade: evento.capacidade,
    sede: evento.sede,
  })
  const esgotada = lotacaoCheia(confirmadosCount, cap)

  const valorVagaNum =
    evento.valorVaga == null
      ? null
      : typeof evento.valorVaga === 'number'
        ? evento.valorVaga
        : evento.valorVaga.toNumber()

  const confirmadosAvatar = evento.rsvps
    .filter((r) => r.status === 'CONFIRMADO')
    .slice(0, 50)
    .map((r) => ({
      id: r.id,
      nome: r.user.nome ?? 'Membro',
      avatarUrl: r.user.avatarUrl,
    }))

  const itens: EmbarqueRow[] = evento.rsvps.map((r) => ({
    id: r.id,
    userId: r.user.id,
    nome: r.user.nome?.trim() || r.user.email,
    email: r.user.email,
    status: r.status,
    checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
  }))

  const labelCheckin = evento.tipo === 'ENSAIO' ? 'Presença' : 'Embarque'
  const backHref =
    evento.tipo === 'CARAVANA'
      ? '/portal/eventos?tipo=CARAVANA'
      : evento.tipo === 'ENSAIO'
        ? '/portal/eventos?tipo=ENSAIO'
        : '/portal/eventos'

  return (
    <div className="space-y-6">
      <EventoDetailReveal index={0}>
        <div>
          <Link
            href={backHref}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            <ArrowLeft className="h-4 w-4" />
            Agenda
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <EventoTipoBadge tipo={evento.tipo} />
            <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{evento.titulo}</h1>
            {passado && (
              <span className="rounded-full bg-[rgb(var(--background-subtle))] px-3 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Encerrado
              </span>
            )}
          </div>
          <div className="mt-3">
            <EventoAcoesRapidas
              eventoId={evento.id}
              titulo={evento.titulo}
              descricao={evento.descricao}
              local={evento.local}
              dataIso={evento.data.toISOString()}
            />
          </div>
        </div>
      </EventoDetailReveal>

      <EventoDetailReveal index={1}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
            <p className="text-[11px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
              Confirmados
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[rgb(var(--foreground))]">
              {cap != null ? `${confirmadosCount}/${cap}` : confirmadosCount}
            </p>
          </div>
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
            <p className="text-[11px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
              {labelCheckin}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[rgb(var(--foreground))]">
              {embarcadosCount}
            </p>
          </div>
          {esperaCount > 0 && (
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
              <p className="text-[11px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
                Lista de espera
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[rgb(var(--foreground))]">
                {esperaCount}
              </p>
            </div>
          )}
          {valorVagaNum != null && valorVagaNum > 0 && (
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
              <p className="text-[11px] font-medium uppercase text-[rgb(var(--foreground-muted))]">
                Vaga
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-[rgb(var(--foreground))]">
                R$ {valorVagaNum.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      </EventoDetailReveal>

      <EventoDetailReveal index={2}>
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 text-[rgb(var(--foreground))]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                <Calendar className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              </div>
              <span>{formatarDataCompleta(new Date(evento.data))}</span>
            </div>

            {evento.local && (
              <div className="flex items-center gap-3 text-[rgb(var(--foreground))]">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                  <MapPin className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                </div>
                <span>{evento.local}</span>
              </div>
            )}

            {evento.sedeNome && (
              <div className="flex items-center gap-3 text-[rgb(var(--foreground))]">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                  <Building2 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                </div>
                <span>{evento.sedeNome}</span>
              </div>
            )}

            <div className="flex items-center gap-3 text-[rgb(var(--foreground))]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(var(--background-subtle))]">
                <UserCheck className="h-4 w-4 text-emerald-500" />
              </div>
              <span>
                <strong>{confirmadosCount}</strong> confirmado
                {confirmadosCount !== 1 ? 's' : ''}
                {cap != null ? ` · lotação ${cap}` : ''}
              </span>
            </div>
          </div>

          {evento.descricao && (
            <div className="mt-5 border-t border-[rgb(var(--border))] pt-5">
              <p className="whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                {evento.descricao}
              </p>
            </div>
          )}
        </div>
      </EventoDetailReveal>

      {!passado && session?.user?.id && (
        <EventoDetailReveal index={3}>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
              <Clock className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
              Você vai?
            </h2>
            <RsvpButtons
              eventoId={id}
              statusAtual={meuRsvp?.status ?? null}
              lotacaoEsgotada={esgotada && meuRsvp?.status !== 'CONFIRMADO'}
            />

            {podeCriarSala && (
              <form action={criarSalaDeEvento} className="mt-4">
                <input type="hidden" name="titulo" value={`Sala: ${evento.titulo}`} />
                <input type="hidden" name="eventoId" value={evento.id} />
                <button className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-2 text-sm font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-raised))]">
                  Criar sala de vídeo deste evento
                </button>
              </form>
            )}
          </div>
        </EventoDetailReveal>
      )}

      {valorVagaNum != null && valorVagaNum > 0 && (
        <EventoDetailReveal index={4}>
          <CaravanaVagaPagamento
            eventoId={evento.id}
            valorVaga={valorVagaNum}
            confirmado={meuRsvp?.status === 'CONFIRMADO'}
            cobranca={minhaCobranca}
          />
        </EventoDetailReveal>
      )}

      {passado && (
        <EventoDetailReveal index={3}>
          <div className="flex items-start gap-3 rounded-xl bg-[rgb(var(--background-subtle))] p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Este {TIPO_EVENTO_LABEL[evento.tipo]?.toLowerCase() ?? 'evento'} já foi realizado.
            </p>
          </div>
        </EventoDetailReveal>
      )}

      {confirmadosAvatar.length > 0 && (
        <EventoDetailReveal index={5}>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
              <UserCheck className="h-4 w-4 text-emerald-500" />
              Confirmados ({confirmadosCount})
            </h2>
            <EventoConfirmadosGrid confirmados={confirmadosAvatar} />
          </div>
        </EventoDetailReveal>
      )}

      {(podeGerir || evento.tipo === 'CARAVANA' || evento.tipo === 'ENSAIO') && (
        <EventoDetailReveal index={6}>
          <ListaEmbarque
            eventoId={evento.id}
            itens={itens}
            podeGerir={podeGerir}
            labelCheckin={labelCheckin}
            tituloEvento={evento.titulo}
          />
        </EventoDetailReveal>
      )}
    </div>
  )
}
