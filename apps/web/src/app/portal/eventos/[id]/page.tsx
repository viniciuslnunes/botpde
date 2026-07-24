import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getActiveTenant, getUserPermissionsInTenant } from '@/lib/tenant'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RsvpButtons } from './rsvp-buttons'
import { criarSalaDeEvento } from '@/app/portal/comunidade/salas/actions'
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  Drum,
  MapPin,
  UserCheck,
  AlertCircle,
  Video,
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
import { EventoMapaLinks } from '@/components/eventos/evento-mapa-links'
import { EventoPartidaCard } from '@/components/eventos/evento-partida-card'
import { capacidadeEfetiva, lotacaoCheia } from '@/lib/eventos-capacidade'
import { getEventoEmbarque } from '@/lib/eventos-tipo'

export const metadata: Metadata = { title: 'Evento' }

function formatarDataCompleta(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(data),
  )
}

function formatarHora(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(data),
  )
}

function FotoFallback({ tipo }: { tipo: string }) {
  const Icon = tipo === 'CARAVANA' ? Bus : tipo === 'ENSAIO' ? Drum : CalendarDays
  const tone =
    tipo === 'CARAVANA'
      ? 'from-amber-500/30 to-amber-500/5 text-amber-200'
      : tipo === 'ENSAIO'
        ? 'from-sky-500/30 to-sky-500/5 text-sky-200'
        : 'from-[rgb(var(--color-primary)_/_0.35)] to-[rgb(var(--color-primary)_/_0.06)] text-[rgb(var(--color-primary-fg))]'
  return (
    <div
      className={`flex h-full min-h-[200px] w-full items-center justify-center bg-gradient-to-br ${tone}`}
      aria-hidden
    >
      <Icon className="h-12 w-12 opacity-80" />
    </div>
  )
}

export default async function EventoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const tenant = await getActiveTenant(session?.user?.id, session?.user?.email)
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
      ? getUserPermissionsInTenant(session.user.id, tenant.id).then(
          async ({ rolePermissions, overrides }) => {
            const effective = calculateEffectivePermissions(rolePermissions, overrides)
            const podeCriarSala = hasPermission(effective, PERMISSIONS.MEETINGS_HOST)
            const podeGerir = hasPermission(effective, PERMISSIONS.EVENTS_MANAGE)
            const minhaCobranca =
              evento.tipo === 'CARAVANA'
                ? await db.cobrancaAssociacao.findFirst({
                    where: {
                      tenantId: tenant.id,
                      eventoId: id,
                      userId: session.user!.id,
                    },
                    select: { id: true, status: true },
                  })
                : null
            return { podeCriarSala, podeGerir, minhaCobranca }
          },
        )
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
    <div className="space-y-5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Agenda
      </Link>

      {/* Hero: foto + ficha — 2 colunas no desktop */}
      <EventoDetailReveal index={0}>
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.9)] shadow-sm">
          <div className="grid lg:grid-cols-12">
            <div className="relative aspect-[4/3] overflow-hidden bg-[rgb(var(--background-subtle))] lg:col-span-5 lg:aspect-auto lg:min-h-[280px]">
              {evento.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={evento.fotoUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <FotoFallback tipo={evento.tipo} />
              )}
            </div>

            <div className="flex flex-col gap-4 p-4 sm:p-5 lg:col-span-7 lg:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <EventoTipoBadge tipo={evento.tipo} />
                {passado && (
                  <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                    Encerrado
                  </span>
                )}
                {esgotada && !passado && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    Lotado
                  </span>
                )}
              </div>

              <h1 className="text-balance text-xl font-bold leading-tight text-[rgb(var(--foreground))] sm:text-2xl">
                {evento.titulo}
              </h1>

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-[rgb(var(--foreground-muted))]">
                <span className="inline-flex items-center gap-1.5 font-medium text-[rgb(var(--foreground))]">
                  <CalendarDays className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                  {formatarDataCompleta(new Date(evento.data))}
                </span>
                {evento.local && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {evento.local}
                    {evento.sedeNome ? ` · ${evento.sedeNome}` : ''}
                  </span>
                )}
              </div>

              {/* Stats inline — sem cards vazios */}
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-1 text-xs font-semibold tabular-nums text-[rgb(var(--foreground))]">
                  {cap != null ? `${confirmadosCount}/${cap}` : confirmadosCount} confirmados
                </span>
                <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-1 text-xs font-semibold tabular-nums text-[rgb(var(--foreground))]">
                  {embarcadosCount} {labelCheckin.toLowerCase()}
                </span>
                {esperaCount > 0 && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                    {esperaCount} em espera
                  </span>
                )}
                {valorVagaNum != null && valorVagaNum > 0 && (
                  <span className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-1 text-xs font-semibold tabular-nums text-[rgb(var(--foreground))]">
                    R$ {valorVagaNum.toFixed(2)}
                  </span>
                )}
                <span className="rounded-full border border-[rgb(var(--border))] px-3 py-1 text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                  {formatarHora(new Date(evento.data))}
                </span>
              </div>

              <EventoAcoesRapidas
                eventoId={evento.id}
                titulo={evento.titulo}
                descricao={evento.descricao}
                local={evento.local}
                dataIso={evento.data.toISOString()}
              />

              <EventoMapaLinks lat={evento.lat} lng={evento.lng} local={evento.local} />

              {/* RSVP no hero — ação principal perto do título */}
              {!passado && session?.user?.id && (
                <div className="mt-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.6)] p-3 sm:p-4">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    Você vai?
                  </p>
                  <RsvpButtons
                    eventoId={id}
                    statusAtual={meuRsvp?.status ?? null}
                    lotacaoEsgotada={esgotada && meuRsvp?.status !== 'CONFIRMADO'}
                  />
                </div>
              )}

              {passado && (
                <div className="mt-auto flex items-start gap-2 rounded-xl bg-[rgb(var(--background-subtle))] px-3 py-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                  <p className="text-sm text-[rgb(var(--foreground-muted))]">
                    Este {TIPO_EVENTO_LABEL[evento.tipo]?.toLowerCase() ?? 'evento'} já foi
                    realizado.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </EventoDetailReveal>

      {evento.partida && (
        <EventoDetailReveal index={1}>
          <EventoPartidaCard partida={evento.partida} />
        </EventoDetailReveal>
      )}

      {evento.descricao && (
        <EventoDetailReveal index={2}>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Sobre
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[rgb(var(--foreground))]">
              {evento.descricao}
            </p>
          </div>
        </EventoDetailReveal>
      )}

      {valorVagaNum != null && valorVagaNum > 0 && (
        <EventoDetailReveal index={3}>
          <CaravanaVagaPagamento
            eventoId={evento.id}
            valorVaga={valorVagaNum}
            confirmado={meuRsvp?.status === 'CONFIRMADO'}
            cobranca={minhaCobranca}
          />
        </EventoDetailReveal>
      )}

      {!passado && podeCriarSala && (
        <EventoDetailReveal index={4}>
          <form action={criarSalaDeEvento}>
            <input type="hidden" name="titulo" value={`Sala: ${evento.titulo}`} />
            <input type="hidden" name="eventoId" value={evento.id} />
            <button className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]">
              <Video className="h-4 w-4" />
              Criar sala de vídeo
            </button>
          </form>
        </EventoDetailReveal>
      )}

      {confirmadosAvatar.length > 0 && (
        <EventoDetailReveal index={5}>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
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
