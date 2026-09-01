'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  Bus,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Drum,
  LayoutGrid,
  MapPin,
  MessageSquareText,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import {
  MANDO_JOGO_LABEL,
  MEMORIA_ESCOPO,
  TIPO_EVENTO_LABEL,
  type MemoriaEscopo,
} from '@torcida/types'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { LogoMiniatura } from '@/components/media/logo-miniatura'
import { MemoriaMark } from '@/components/portal/memoria-mark'
import { fadeUp, springGentle, springSnappy } from '@/lib/motion-presets'
import {
  agruparEspinhaPorMes,
  clampDiaIso,
  diaNoMesVizinho,
  diasEmTorno,
  isMemoriaDiaIso,
  limitesCalendarioMemoria,
  mesIsoDe,
  montarEspinhaCalendario,
  resolverDiaInicial,
  weekdayCurto,
  type MemoriaDiaDetalhe,
  type MemoriaEspinhaDia,
  type MemoriaFiltro,
  type MemoriaMontada,
} from '@/lib/memoria-dia'
import { formatMonthYear, formatWeekdayLong, parseDateOnly } from '@/lib/format-datetime'
import { MemoriaFoto } from './memoria-foto'
import { MemoriaComposer } from './memoria-composer'
import { MemoriaPresencaBloco } from './memoria-presenca'
import type { MemoriaFatoFila, MemoriaPresenca } from '../_lib/carregar-memoria'

const FILTROS: Array<{ id: MemoriaFiltro; label: string; Icon: LucideIcon }> = [
  { id: 'todos', label: 'Tudo', Icon: LayoutGrid },
  { id: 'jogo', label: 'Jogo', Icon: Trophy },
  { id: 'evento', label: 'Evento', Icon: CalendarDays },
  { id: 'publicacao', label: 'Publicação', Icon: MessageSquareText },
]

const ESCOPO_LABEL: Record<MemoriaEscopo, string> = {
  unidade: 'Unidade',
  torcida: 'Torcida',
  clube: 'Clube',
}

const ESCOPO_SUB: Record<MemoriaEscopo, string> = {
  unidade: 'O que rolou nesta unidade, dia a dia.',
  torcida: 'A linha da torcida — sede e unidades.',
  clube: 'Os jogos e o que a Nação publicou. Sem caravana, ensaio ou fato de torcida.',
}

type Props = {
  tenantNome: string
  clubeNome: string | null
  logoUrl: string | null
  hojeIso: string
  montada: MemoriaMontada
  escopo: MemoriaEscopo
  escoposDisponiveis: MemoriaEscopo[]
  mostrarChips: boolean
  podeCriarFato: boolean
  fatosDoAutor: MemoriaFatoFila[]
  presenca: MemoriaPresenca | null
}

export function MemoriaExplorer({
  tenantNome,
  clubeNome,
  logoUrl,
  hojeIso,
  montada,
  escopo,
  escoposDisponiveis,
  mostrarChips,
  podeCriarFato,
  fatosDoAutor,
  presenca,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filtroRaw = parseFiltro(searchParams.get('f'))
  const filtro: MemoriaFiltro =
    escopo === MEMORIA_ESCOPO.CLUBE && filtroRaw === 'evento' ? 'todos' : filtroRaw
  const diaQuery = searchParams.get('dia')
  const limites = useMemo(() => limitesCalendarioMemoria(hojeIso), [hojeIso])
  const ancora = useMemo(() => {
    const pedido = isMemoriaDiaIso(diaQuery) ? diaQuery : hojeIso
    return clampDiaIso(pedido, limites.minIso, limites.maxIso)
  }, [diaQuery, hojeIso, limites.maxIso, limites.minIso])
  const diasJanela = useMemo(
    () => diasEmTorno(ancora, limites.minIso, limites.maxIso),
    [ancora, limites.maxIso, limites.minIso],
  )
  const espinha = useMemo(
    () => montarEspinhaCalendario(diasJanela, montada.porDia),
    [diasJanela, montada.porDia],
  )
  const grupos = useMemo(() => agruparEspinhaPorMes(espinha), [espinha])
  const diaIso =
    isMemoriaDiaIso(diaQuery) && diasJanela.includes(diaQuery)
      ? diaQuery
      : resolverDiaInicial(espinha, diaQuery, hojeIso) ?? ancora
  const dia = diaIso
    ? (montada.porDia[diaIso] ?? {
        dia: diaIso,
        partida: null,
        eventos: [],
        posts: [],
        fotos: [],
      })
    : null
  const filtrosVisiveis =
    escopo === MEMORIA_ESCOPO.CLUBE ? FILTROS.filter((f) => f.id !== 'evento') : FILTROS
  const mesLabel = formatMonthYear(parseDateOnly(ancora))
  const prevMes = clampDiaIso(diaNoMesVizinho(diaIso, -1), limites.minIso, limites.maxIso)
  const nextMes = clampDiaIso(diaNoMesVizinho(diaIso, 1), limites.minIso, limites.maxIso)
  const podeMesAnterior = mesIsoDe(prevMes) < mesIsoDe(diaIso)
  const podeMesSeguinte = mesIsoDe(nextMes) > mesIsoDe(diaIso)

  const listaDesktopRef = useRef<HTMLOListElement>(null)
  const listaMobileRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    centralizarDiaAtivo(listaDesktopRef.current)
    centralizarDiaAtivo(listaMobileRef.current)
  }, [diaIso])

  function irPara(next: string, nextFiltro: MemoriaFiltro = filtro) {
    router.replace(hrefMemoria(next, nextFiltro, escopo), { scroll: false })
  }

  function aplicarFiltro(next: MemoriaFiltro) {
    irPara(diaIso, next)
  }

  function irEscopo(next: MemoriaEscopo) {
    router.replace(hrefMemoria(diaIso, filtro, next), { scroll: false })
  }

  function irMes(delta: -1 | 1) {
    const alvo = delta < 0 ? prevMes : nextMes
    if (mesIsoDe(alvo) === mesIsoDe(diaIso)) return
    irPara(alvo)
  }

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col gap-4 lg:min-h-[calc(100dvh-8.5rem)] lg:flex-row lg:gap-8">
      <aside className="lg:sticky lg:top-20 lg:flex lg:h-[calc(100dvh-8.5rem)] lg:w-64 lg:shrink-0 lg:flex-col">
        <header className="mb-4 flex min-w-0 items-center gap-3">
          <MarcaMemoria src={logoUrl} alt={tenantNome} />
          <div className="min-w-0 flex-1">
            <p className="portal-kicker text-[rgb(var(--color-primary-fg))]">
              Memórias
            </p>
            <h1 className="portal-display mt-0.5 truncate text-lg text-[rgb(var(--foreground))]">
              {tenantNome}
            </h1>
          </div>
        </header>
        <p className="mb-4 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          {ESCOPO_SUB[escopo]}
        </p>

        {mostrarChips && escoposDisponiveis.length > 1 && (
          <div
            className={[
              'mb-3 grid gap-0.5 rounded-xl bg-[rgb(var(--background-subtle))] p-0.5',
              escoposDisponiveis.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
            ].join(' ')}
            role="tablist"
            aria-label="Recorte da memória"
          >
            {escoposDisponiveis.map((id) => {
              const ativo = escopo === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => irEscopo(id)}
                  className={[
                    'app-touch-target min-w-0 rounded-[0.625rem] px-1.5 text-center font-mono text-[10px] font-medium uppercase tracking-[0.14em] transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.45)]',
                    ativo
                      ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                      : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  {ESCOPO_LABEL[id]}
                </button>
              )
            })}
          </div>
        )}

        <div
          className="mb-4 grid grid-cols-2 gap-0.5"
          role="group"
          aria-label="Filtrar a linha do tempo"
        >
          {filtrosVisiveis.map((f) => {
            const ativo = filtro === f.id
            const Icon = f.Icon
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => aplicarFiltro(f.id)}
                aria-pressed={ativo}
                className={[
                  'app-touch-target flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-center transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.45)]',
                  ativo
                    ? 'bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                    : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate font-mono text-[10px] font-medium uppercase leading-none tracking-[0.14em]">
                  {f.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mb-3 flex items-center gap-1">
          <button
            type="button"
            className="app-touch-target flex shrink-0 items-center justify-center rounded-xl text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-30"
            aria-label="Mês anterior"
            disabled={!podeMesAnterior}
            onClick={() => irMes(-1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <p className="min-w-0 flex-1 truncate text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
            {mesLabel}
          </p>
          <button
            type="button"
            className="app-touch-target flex shrink-0 items-center justify-center rounded-xl text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-30"
            aria-label="Próximo mês"
            disabled={!podeMesSeguinte}
            onClick={() => irMes(1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="sr-only">Ir para a data</span>
          <input
            type="date"
            value={diaIso}
            min={limites.minIso}
            max={limites.maxIso}
            onChange={(e) => {
              const v = e.target.value
              if (isMemoriaDiaIso(v)) irPara(clampDiaIso(v, limites.minIso, limites.maxIso))
            }}
            aria-label="Ir para a data"
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-base text-[rgb(var(--foreground))]"
          />
        </label>

        <nav
          ref={listaMobileRef}
          aria-label="Calendário da memória"
          className="app-scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2 lg:hidden"
        >
          {espinha.map((no) => (
              <NoDia
                key={no.dia}
                no={no}
                ativo={no.dia === diaIso}
                compacto
                filtro={filtro}
                onSelect={irPara}
              />
            ))}
        </nav>

        <ol
          ref={listaDesktopRef}
          className="app-scrollbar-none relative hidden min-h-0 flex-1 overflow-y-auto pr-2 lg:block"
        >
          <span
            aria-hidden
            className="absolute bottom-3 left-[1.15rem] top-3 w-px bg-[rgb(var(--border))]"
          />
          {grupos.map((mes) => (
            <li key={mes.chave} className="relative">
              <ol className="space-y-0.5 pb-4">
                {mes.dias.map((no) => (
                  <li key={no.dia}>
                    <NoDia
                      no={no}
                      ativo={no.dia === diaIso}
                      filtro={filtro}
                      onSelect={irPara}
                    />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </aside>

      <section className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          {dia ? (
            <m.div
              key={dia.dia}
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={fadeUp}
              transition={springGentle}
            >
              <PainelDia
                dia={dia}
                clubeNome={clubeNome}
                logoUrl={logoUrl}
                hojeIso={hojeIso}
                podeCriarFato={podeCriarFato && escopo !== MEMORIA_ESCOPO.CLUBE}
                fatosDoAutor={fatosDoAutor}
                presenca={escopo === MEMORIA_ESCOPO.CLUBE ? null : presenca}
              />
            </m.div>
          ) : (
            <MotionEmptyState
              icon={
                <MemoriaMark className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
              }
              title={
                montada.espinha.length === 0
                  ? 'A linha ainda está em branco'
                  : 'Nada neste recorte'
              }
              description={
                montada.espinha.length === 0
                  ? emptyCopy(escopo)
                  : 'Tente outro filtro — o dia continua na linha.'
              }
            />
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}

function MarcaMemoria({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return (
      <LogoMiniatura
        src={src}
        alt={alt}
        className="rounded-lg"
        rounded="rounded-lg"
      />
    )
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
      <MemoriaMark className="h-4 w-4" />
    </span>
  )
}

function NoDia({
  no,
  ativo,
  compacto = false,
  filtro = 'todos',
  onSelect,
}: {
  no: MemoriaEspinhaDia
  ativo: boolean
  compacto?: boolean
  filtro?: MemoriaFiltro
  onSelect: (dia: string) => void
}) {
  const parts = parseDateOnly(no.dia)
  const combina = noCombinaFiltro(no, filtro)
  const vazio = no.total === 0
  if (compacto) {
    return (
      <button
        type="button"
        onClick={() => onSelect(no.dia)}
        aria-current={ativo ? 'date' : undefined}
        aria-label={`${weekdayCurto(no.dia)} ${parts.day}`}
        className={[
          'app-touch-target flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl text-center transition-colors',
          ativo
            ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
            : vazio || !combina
              ? 'bg-[rgb(var(--background-subtle)_/_0.55)] text-[rgb(var(--foreground-muted))]'
              : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]',
        ].join(' ')}
      >
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] opacity-80">{weekdayCurto(no.dia)}</span>
        <span className="font-mono text-sm font-semibold tabular-nums leading-none">{parts.day}</span>
      </button>
    )
  }

  const markers = filtro === 'todos' ? no.kinds : combina ? no.kinds : []

  return (
    <button
      type="button"
      onClick={() => onSelect(no.dia)}
      aria-current={ativo ? 'date' : undefined}
      className={[
        'app-touch-target relative flex w-full min-w-0 items-center gap-3 rounded-xl px-1.5 text-left transition-colors',
        ativo
          ? 'text-[rgb(var(--foreground))]'
          : vazio
            ? 'text-[rgb(var(--foreground-muted)_/_0.7)] hover:text-[rgb(var(--foreground-muted))]'
            : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
      ].join(' ')}
    >
      <span
        className={[
          'relative z-10 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 bg-[rgb(var(--background))]',
          ativo
            ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]'
            : 'border-[rgb(var(--border-strong))]',
        ].join(' ')}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {String(parts.day).padStart(2, '0')}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em]">{weekdayCurto(no.dia)}</span>
        </span>
        <span className="mt-0.5 flex gap-1">
          {markers.slice(0, 3).map((k) => (
            <span
              key={k}
              className={[
                'h-1 w-3 rounded-full',
                k === 'partida'
                  ? 'bg-[rgb(var(--color-primary))]'
                  : 'bg-[rgb(var(--border-strong))]',
              ].join(' ')}
            />
          ))}
        </span>
      </span>
      {ativo && (
        <m.span
          layoutId="memoria-no-ativo"
          className="absolute inset-0 -z-0 rounded-xl bg-[rgb(var(--color-primary)_/_0.1)]"
          transition={springSnappy}
        />
      )}
    </button>
  )
}

function PainelDia({
  dia,
  clubeNome,
  logoUrl,
  hojeIso,
  podeCriarFato,
  fatosDoAutor,
  presenca,
}: {
  dia: MemoriaDiaDetalhe
  clubeNome: string | null
  logoUrl: string | null
  hojeIso: string
  podeCriarFato: boolean
  fatosDoAutor: MemoriaFatoFila[]
  presenca: MemoriaPresenca | null
}) {
  const titulo = formatWeekdayLong(parseDateOnly(dia.dia))

  return (
    <div className="space-y-6">
      <header className="border-b border-[rgb(var(--border))] pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
          {dia.dia.slice(0, 4)}
        </p>
        <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-[rgb(var(--foreground))] sm:text-3xl">
          {titulo}
        </h2>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
          {resumoDia(dia)}
        </p>
      </header>

      {dia.partida && (
        <article className="relative overflow-hidden rounded-3xl border border-[rgb(var(--color-primary)_/_0.28)] bg-[rgb(var(--color-primary)_/_0.08)] px-5 py-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--color-primary-fg))]">
            Jogo do dia
          </p>
          <p className="mt-2 text-xl font-black uppercase tracking-tight text-[rgb(var(--foreground))]">
            {clubeNome ?? 'Nós'}{' '}
            <span className="font-normal text-[rgb(var(--foreground-muted))]">×</span>{' '}
            {dia.partida.adversario}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
            {MANDO_JOGO_LABEL[dia.partida.mando]} · {dia.partida.hora}
            {dia.partida.competicao ? ` · ${dia.partida.competicao}` : ''}
          </p>
          {dia.partida.status === 'ENCERRADA' &&
            dia.partida.placarCasa != null &&
            dia.partida.placarFora != null && (
              <p className="mt-3 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[rgb(var(--foreground))]">
                {dia.partida.placarCasa}
                <span className="mx-1.5 text-[rgb(var(--foreground-muted))]">–</span>
                {dia.partida.placarFora}
              </p>
            )}
        </article>
      )}

      {dia.eventos.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
            Na rua
          </h3>
          <ul className="space-y-2">
            {dia.eventos.map((ev) => {
              const Icon = ev.tipo === 'CARAVANA' ? Bus : ev.tipo === 'ENSAIO' ? Drum : CalendarDays
              return (
                <li key={ev.id}>
                  <Link
                    href={ev.href}
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:border-[rgb(var(--color-primary)_/_0.35)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--background-subtle))] text-[rgb(var(--color-primary-fg))]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
                        {ev.titulo}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
                        <span>{TIPO_EVENTO_LABEL[ev.tipo]}</span>
                        <span>·</span>
                        <span className="tabular-nums">{ev.hora}</span>
                        {ev.local && (
                          <>
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{ev.local}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {dia.fotos.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
            Imagens
          </h3>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {dia.fotos.slice(0, 12).map((url) => {
              const href = hrefDaFoto(dia, url)
              return (
                <li key={url} className="relative aspect-square min-w-0 overflow-hidden rounded-xl bg-[rgb(var(--background-subtle))]">
                  {href ? (
                    <Link href={href} className="absolute inset-0">
                      <MemoriaFoto src={url} alt="" className="object-cover" />
                    </Link>
                  ) : (
                    <MemoriaFoto src={url} alt="" className="object-cover" />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {dia.posts.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
            Publicações
          </h3>
          <ul className="space-y-2">
            {dia.posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={post.href}
                  className="flex min-w-0 gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:border-[rgb(var(--color-primary)_/_0.35)]"
                >
                  <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgb(var(--background-subtle))]">
                    {post.autorAvatar ? (
                      <MemoriaFoto src={post.autorAvatar} alt="" sizes="36px" className="object-cover" />
                    ) : (
                      <MessageSquareText className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
                        {post.autorNome}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-[rgb(var(--foreground-muted))]">
                        {post.hora}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-[rgb(var(--foreground-muted))]">
                      {post.atrasado ? 'Memória · ' : ''}
                      {post.trecho}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {presenca && <MemoriaPresencaBloco presenca={presenca} />}

      {fatosDoAutor.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
            Seus fatos neste dia
          </h3>
          <ul className="space-y-2">
            {fatosDoAutor.map((f) => (
              <li
                key={f.id}
                className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-sm"
              >
                <p className="text-[rgb(var(--foreground-muted))]">{f.conteudo}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
                  {f.status === 'PENDENTE' ? 'Aguardando moderação' : 'Recusado'}
                </p>
                {f.status === 'REJEITADA' && f.motivoRejeicao && (
                  <p className="mt-1 text-xs text-[rgb(var(--color-danger-fg))]">{f.motivoRejeicao}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {podeCriarFato && (
        <MemoriaComposer
          diaIso={dia.dia}
          hojeIso={hojeIso}
          diaVazio={dia.eventos.length === 0 && dia.posts.length === 0 && !dia.partida}
        />
      )}

      {dia.eventos.length === 0 && dia.posts.length === 0 && !dia.partida && !podeCriarFato && (
        <MotionEmptyState
          icon={
            <span className="mb-3">
              <MarcaMemoria src={logoUrl} alt="" />
            </span>
          }
          title="Nada neste dia"
          description="Tente outro dia no calendário — há datas para os dois lados."
        />
      )}
    </div>
  )
}

function parseFiltro(raw: string | null): MemoriaFiltro {
  if (raw === 'jogo' || raw === 'evento' || raw === 'publicacao') return raw
  return 'todos'
}

function centralizarDiaAtivo(root: HTMLElement | null) {
  if (!root) return
  if (root.clientHeight < 8 && root.clientWidth < 8) return
  const el = root.querySelector<HTMLElement>('[aria-current="date"]')
  if (!el) return
  const rootRect = root.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  if (root.scrollHeight > root.clientHeight + 1) {
    root.scrollTop += elRect.top + elRect.height / 2 - (rootRect.top + rootRect.height / 2)
  }
  if (root.scrollWidth > root.clientWidth + 1) {
    root.scrollLeft += elRect.left + elRect.width / 2 - (rootRect.left + rootRect.width / 2)
  }
}

function hrefMemoria(
  dia: string | null | undefined,
  filtro: MemoriaFiltro,
  escopo: MemoriaEscopo,
): string {
  const p = new URLSearchParams()
  p.set('escopo', escopo)
  if (dia) p.set('dia', dia)
  if (filtro !== 'todos') p.set('f', filtro)
  return `/portal/memoria?${p.toString()}`
}

function noCombinaFiltro(no: MemoriaEspinhaDia, filtro: MemoriaFiltro): boolean {
  if (filtro === 'todos') return true
  if (filtro === 'jogo') return no.kinds.includes('partida')
  if (filtro === 'evento') return no.kinds.includes('evento')
  return no.kinds.includes('post') || no.kinds.includes('foto')
}

function emptyCopy(escopo: MemoriaEscopo): string {
  if (escopo === MEMORIA_ESCOPO.CLUBE) {
    return 'Quando o time jogar ou o torcedor publicar no nacional, o dia nasce aqui. Caravana e ensaio ficam na memória da torcida ou da unidade.'
  }
  if (escopo === MEMORIA_ESCOPO.TORCIDA) {
    return 'Quando a sede ou as unidades publicarem, o dia nasce aqui.'
  }
  return 'Nada neste dia ainda. Role o calendário ou ligue um fato atrasado abaixo.'
}

function hrefDaFoto(dia: MemoriaDiaDetalhe, url: string): string | null {
  const post = dia.posts.find((p) => p.fotos.includes(url))
  if (post) return post.href
  const evento = dia.eventos.find((e) => e.fotoUrl === url)
  return evento?.href ?? null
}

function resumoDia(dia: MemoriaDiaDetalhe): string {
  const partes: string[] = []
  if (dia.partida) partes.push('jogo')
  if (dia.eventos.length === 1) partes.push('1 evento')
  if (dia.eventos.length > 1) partes.push(`${dia.eventos.length} eventos`)
  if (dia.posts.length === 1) partes.push('1 publicação')
  if (dia.posts.length > 1) partes.push(`${dia.posts.length} publicações`)
  if (dia.fotos.length > 0) partes.push(`${dia.fotos.length} ${dia.fotos.length === 1 ? 'imagem' : 'imagens'}`)
  return partes.length > 0 ? partes.join(' · ') : 'Nada neste dia'
}
