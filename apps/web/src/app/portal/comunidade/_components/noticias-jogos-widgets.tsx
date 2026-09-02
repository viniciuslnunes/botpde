'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { APP_TIME_ZONE } from '@/lib/format-datetime'
import type { PartidaNoticiasCard } from '@/lib/noticias-jogos-feed'

function formatDataJogo(dataHora: Date): string {
  const bag = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: APP_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(dataHora)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>
  return `${bag.day}/${bag.month} · ${bag.hour}:${bag.minute}`
}

function siglaAdversario(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'ADV'
  if (partes.length === 1) return partes[0].slice(0, 3).toUpperCase()
  return partes
    .slice(0, 3)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

function PartidaChip({ partida }: { partida: PartidaNoticiasCard }) {
  const temPlacar = partida.placarCasa != null && partida.placarFora != null
  const casa = partida.mando === 'CASA' ? partida.clubeSigla : siglaAdversario(partida.adversario)
  const fora = partida.mando === 'CASA' ? siglaAdversario(partida.adversario) : partida.clubeSigla
  const placarCasa = partida.mando === 'CASA' ? partida.placarCasa : partida.placarFora
  const placarFora = partida.mando === 'CASA' ? partida.placarFora : partida.placarCasa
  const aoVivo = partida.status === 'AO_VIVO'

  return (
    <Link
      href="/portal/eventos"
      className="app-sem-piso-toque flex w-[9.5rem] shrink-0 snap-start flex-col rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:border-[rgb(var(--color-primary)_/_0.45)] sm:w-[10.5rem]"
    >
      <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
        <span>{formatDataJogo(partida.dataHora)}</span>
        {aoVivo ? (
          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
            Ao vivo
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <div className="flex flex-col items-center gap-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-[10px] font-bold">
            {casa}
          </span>
          {temPlacar ? (
            <span className="text-sm font-bold tabular-nums">{placarCasa}</span>
          ) : null}
        </div>
        <span className="text-xs font-semibold text-[rgb(var(--foreground-muted))]">×</span>
        <div className="flex flex-col items-center gap-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-[10px] font-bold">
            {fora}
          </span>
          {temPlacar ? (
            <span className="text-sm font-bold tabular-nums">{placarFora}</span>
          ) : null}
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-center text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
        {partida.competicao ?? 'Campeonato'}
      </p>
    </Link>
  )
}

export function NoticiasJogosCarrossel({ partidas }: { partidas: PartidaNoticiasCard[] }) {
  const trilhoRef = useRef<HTMLDivElement>(null)
  if (partidas.length === 0) return null

  function rolar(delta: number) {
    trilhoRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <section aria-label="Jogos e eventos" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Jogos e eventos pra você
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/eventos"
            className="app-touch-line hidden text-xs font-semibold text-[rgb(var(--color-primary-fg))] hover:underline sm:inline"
          >
            Agenda completa
          </Link>
          <button
            type="button"
            onClick={() => rolar(-240)}
            aria-label="Jogos anteriores"
            className="app-action flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => rolar(240)}
            aria-label="Próximos jogos"
            className="app-action flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={trilhoRef}
        className="app-scrollbar-none -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
      >
        {partidas.map((partida) => (
          <PartidaChip key={partida.id} partida={partida} />
        ))}
      </div>
    </section>
  )
}

export function NoticiasSidebarJogos({
  proximos,
  recentes,
}: {
  proximos: PartidaNoticiasCard[]
  recentes: PartidaNoticiasCard[]
}) {
  if (proximos.length === 0 && recentes.length === 0) return null

  const destaque = proximos[0] ?? recentes[0]
  const competicaoTitulo = destaque?.competicao ?? 'Próximos jogos'

  return (
    <aside className="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-4 lg:self-start">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Agenda do clube
        </p>
        <h2 className="mt-1 text-base font-bold text-[rgb(var(--foreground))]">{competicaoTitulo}</h2>

        {proximos.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Próximos
            </p>
            <ul className="space-y-2">
              {proximos.slice(0, 5).map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.35)] px-3 py-2.5"
                >
                  <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                    {formatDataJogo(p.dataHora)}
                    {p.local ? ` · ${p.local}` : ''}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[rgb(var(--foreground))]">
                    {p.mando === 'CASA' ? 'Casa' : 'Fora'} × {p.adversario}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {recentes.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Resultados recentes
            </p>
            <ul className="space-y-2">
              {recentes.slice(0, 4).map((p) => {
                const temPlacar = p.placarCasa != null && p.placarFora != null
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-[rgb(var(--foreground-muted))]">
                      × {p.adversario}
                    </span>
                    {temPlacar ? (
                      <span className="shrink-0 font-bold tabular-nums text-[rgb(var(--foreground))]">
                        {p.placarCasa}–{p.placarFora}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <Link
          href="/portal/eventos"
          className="app-touch-line mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Ver agenda completa
        </Link>
      </div>
    </aside>
  )
}
