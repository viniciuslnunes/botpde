'use client'

import { useLayoutEffect, useRef } from 'react'
import { m } from 'motion/react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Landmark,
  MessageSquareText,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { springSnappy } from '@/lib/motion-presets'
import {
  clampDiaIso,
  isMemoriaDiaIso,
  weekdayCurto,
  type MemoriaDiaDetalhe,
  type MemoriaEspinhaDia,
  type MemoriaFiltro,
  type MemoriaKind,
  type MemoriaMesGrupo,
} from '@/lib/memoria-dia'
import { parseDateOnly } from '@/lib/format-datetime'
import { MemoriaFoto } from './memoria-foto'

type Props = {
  grupos: MemoriaMesGrupo[]
  espinha: MemoriaEspinhaDia[]
  diaIso: string
  hojeIso: string
  filtro: MemoriaFiltro
  porDia: Record<string, MemoriaDiaDetalhe>
  mesLabel: string
  podeMesAnterior: boolean
  podeMesSeguinte: boolean
  minIso: string
  maxIso: string
  onSelect: (dia: string) => void
  onMes: (delta: -1 | 1) => void
}

const KIND_META: Record<
  MemoriaKind,
  { label: string; Icon: LucideIcon; dot: string; pill: string }
> = {
  partida: {
    label: 'Jogo',
    Icon: Trophy,
    dot: 'bg-[rgb(var(--color-primary))]',
    pill: 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]',
  },
  evento: {
    label: 'Evento',
    Icon: CalendarDays,
    dot: 'bg-amber-500',
    pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  post: {
    label: 'Publicação',
    Icon: MessageSquareText,
    dot: 'bg-[rgb(var(--foreground-muted))]',
    pill: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  },
  foto: {
    label: 'Imagem',
    Icon: MessageSquareText,
    dot: 'bg-[rgb(var(--color-info))]',
    pill: 'bg-[rgb(var(--color-info)_/_0.12)] text-[rgb(var(--color-info-fg))]',
  },
  marco: {
    label: 'Marco',
    Icon: Landmark,
    dot: 'bg-amber-500',
    pill: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  },
}

export function MemoriaTimeline({
  grupos,
  espinha,
  diaIso,
  hojeIso,
  filtro,
  porDia,
  mesLabel,
  podeMesAnterior,
  podeMesSeguinte,
  minIso,
  maxIso,
  onSelect,
  onMes,
}: Props) {
  const listaDesktopRef = useRef<HTMLOListElement>(null)
  const listaMobileRef = useRef<HTMLElement>(null)
  const inputDataRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    centralizarDiaAtivo(listaDesktopRef.current)
    centralizarDiaAtivo(listaMobileRef.current)
  }, [diaIso])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-1.5">
        <button
          type="button"
          className="app-touch-target flex shrink-0 items-center justify-center rounded-xl border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--border-strong))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-30"
          aria-label="Mês anterior"
          disabled={!podeMesAnterior}
          onClick={() => onMes(-1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => inputDataRef.current?.showPicker?.() ?? inputDataRef.current?.click()}
          className="app-touch-target flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 transition-colors hover:border-[rgb(var(--color-primary)_/_0.35)]"
          aria-label="Ir para a data"
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--color-primary-fg))]" aria-hidden />
          <span className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[rgb(var(--foreground))]">
            {mesLabel}
          </span>
        </button>
        <input
          ref={inputDataRef}
          type="date"
          value={diaIso}
          min={minIso}
          max={maxIso}
          onChange={(e) => {
            const v = e.target.value
            if (isMemoriaDiaIso(v)) onSelect(clampDiaIso(v, minIso, maxIso))
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />

        <button
          type="button"
          className="app-touch-target flex shrink-0 items-center justify-center rounded-xl border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--border-strong))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] disabled:opacity-30"
          aria-label="Próximo mês"
          disabled={!podeMesSeguinte}
          onClick={() => onMes(1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <nav
        ref={listaMobileRef}
        aria-label="Calendário da memória"
        className="app-scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:hidden"
      >
        {espinha.map((no) => (
          <NoDiaMobile
            key={no.dia}
            no={no}
            detalhe={porDia[no.dia]}
            ativo={no.dia === diaIso}
            hoje={no.dia === hojeIso}
            filtro={filtro}
            onSelect={onSelect}
          />
        ))}
      </nav>

      <ol
        ref={listaDesktopRef}
        className="app-scrollbar-fina relative hidden min-h-0 flex-1 overflow-y-auto pr-1 lg:block"
      >
        {grupos.map((mes) => {
          const comConteudo = mes.dias.filter((d) => d.total > 0).length
          return (
            <li key={mes.chave} className="relative pb-1">
              <div className="sticky top-0 z-20 mb-2 flex items-baseline justify-between gap-2 bg-[rgb(var(--background)_/_0.92)] py-2 backdrop-blur-sm">
                <p className="portal-kicker min-w-0 truncate text-[rgb(var(--foreground))]">
                  {mes.label}
                </p>
                {comConteudo > 0 && (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
                    {comConteudo} {comConteudo === 1 ? 'dia' : 'dias'}
                  </span>
                )}
              </div>

              <ol className="relative space-y-1 pb-3">
                <span
                  aria-hidden
                  className="absolute bottom-2 left-[1.65rem] top-2 w-px bg-gradient-to-b from-transparent via-[rgb(var(--border))] to-transparent"
                />
                {mes.dias.map((no) => (
                  <li key={no.dia}>
                    <NoDiaDesktop
                      no={no}
                      detalhe={porDia[no.dia]}
                      ativo={no.dia === diaIso}
                      hoje={no.dia === hojeIso}
                      filtro={filtro}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ol>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function NoDiaDesktop({
  no,
  detalhe,
  ativo,
  hoje,
  filtro,
  onSelect,
}: {
  no: MemoriaEspinhaDia
  detalhe: MemoriaDiaDetalhe | undefined
  ativo: boolean
  hoje: boolean
  filtro: MemoriaFiltro
  onSelect: (dia: string) => void
}) {
  const parts = parseDateOnly(no.dia)
  const combina = noCombinaFiltro(no, filtro)
  const vazio = no.total === 0
  const kinds = filtro === 'todos' ? no.kinds : combina ? no.kinds : []
  const preview = resumoNo(detalhe)
  const thumb = thumbNo(detalhe)
  const opaco = vazio || (filtro !== 'todos' && !combina)

  return (
    <button
      type="button"
      onClick={() => onSelect(no.dia)}
      aria-current={ativo ? 'date' : undefined}
      className={[
        'app-touch-target group relative flex w-full min-w-0 gap-2.5 rounded-2xl border px-2 py-2 text-left transition-[border-color,background-color,box-shadow]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.45)]',
        ativo
          ? 'border-[rgb(var(--color-primary)_/_0.4)] bg-[rgb(var(--color-primary)_/_0.08)] shadow-[inset_3px_0_0_0_rgb(var(--color-primary))]'
          : opaco
            ? 'border-transparent bg-transparent hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--background-subtle)_/_0.45)]'
            : 'border-[rgb(var(--border)_/_0.55)] bg-[rgb(var(--surface)_/_0.55)] hover:border-[rgb(var(--color-primary)_/_0.25)] hover:bg-[rgb(var(--surface))]',
      ].join(' ')}
    >
      <span className="relative z-10 flex w-11 shrink-0 flex-col items-center pt-0.5">
        <span
          className={[
            'flex h-8 w-8 flex-col items-center justify-center rounded-xl border transition-colors',
            ativo
              ? 'border-[rgb(var(--color-primary)_/_0.5)] bg-[rgb(var(--color-primary)_/_0.14)]'
              : vazio
                ? 'border-[rgb(var(--border))] bg-transparent'
                : 'border-[rgb(var(--border-strong))] bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <span
            className={[
              'font-mono text-sm font-bold tabular-nums leading-none',
              ativo
                ? 'text-[rgb(var(--color-primary-fg))]'
                : opaco
                  ? 'text-[rgb(var(--foreground-muted)_/_0.65)]'
                  : 'text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {String(parts.day).padStart(2, '0')}
          </span>
        </span>
        <span
          className={[
            'mt-1 font-mono text-[9px] uppercase tracking-[0.12em]',
            ativo ? 'text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground-muted))]',
          ].join(' ')}
        >
          {weekdayCurto(no.dia)}
        </span>
        {hoje && (
          <span className="mt-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-[rgb(var(--color-primary-fg))]">
            hoje
          </span>
        )}
      </span>

      <span className="relative z-10 min-w-0 flex-1 py-0.5">
        {vazio ? (
          <span className="block pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[rgb(var(--foreground-muted)_/_0.55)]">
            Em branco
          </span>
        ) : (
          <>
            {kinds.length > 0 && (
              <span className="mb-1 flex flex-wrap gap-1">
                {kinds.slice(0, 3).map((k) => {
                  const meta = KIND_META[k]
                  const Icon = meta.Icon
                  return (
                    <span
                      key={k}
                      className={[
                        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[8px] font-medium uppercase tracking-[0.1em]',
                        meta.pill,
                      ].join(' ')}
                    >
                      <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />
                      {meta.label}
                    </span>
                  )
                })}
              </span>
            )}
            {preview && (
              <span
                className={[
                  'line-clamp-2 text-xs leading-snug',
                  opaco ? 'text-[rgb(var(--foreground-muted)_/_0.7)]' : 'text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                {preview}
              </span>
            )}
          </>
        )}
      </span>

      {thumb && !vazio && (
        <span className="relative z-10 my-0.5 h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[rgb(var(--border)_/_0.6)] bg-[rgb(var(--background-subtle))]">
          <MemoriaFoto src={thumb} alt="" sizes="44px" className="object-cover" />
        </span>
      )}

      {ativo && (
        <m.span
          layoutId="memoria-no-ativo"
          className="pointer-events-none absolute inset-0 -z-0 rounded-2xl ring-1 ring-[rgb(var(--color-primary)_/_0.2)]"
          transition={springSnappy}
        />
      )}
    </button>
  )
}

function NoDiaMobile({
  no,
  detalhe,
  ativo,
  hoje,
  filtro,
  onSelect,
}: {
  no: MemoriaEspinhaDia
  detalhe: MemoriaDiaDetalhe | undefined
  ativo: boolean
  hoje: boolean
  filtro: MemoriaFiltro
  onSelect: (dia: string) => void
}) {
  const parts = parseDateOnly(no.dia)
  const combina = noCombinaFiltro(no, filtro)
  const vazio = no.total === 0
  const kinds = filtro === 'todos' ? no.kinds : combina ? no.kinds : []
  const thumb = thumbNo(detalhe)
  const opaco = vazio || (filtro !== 'todos' && !combina)

  return (
    <button
      type="button"
      onClick={() => onSelect(no.dia)}
      aria-current={ativo ? 'date' : undefined}
      aria-label={`${weekdayCurto(no.dia)} ${parts.day}`}
      className={[
        'app-touch-target flex w-[4.75rem] shrink-0 flex-col overflow-hidden rounded-2xl border text-left transition-colors',
        ativo
          ? 'border-[rgb(var(--color-primary)_/_0.5)] bg-[rgb(var(--color-primary)_/_0.12)]'
          : opaco
            ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.35)]'
            : 'border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))]',
      ].join(' ')}
    >
      {thumb && !vazio ? (
        <span className="relative aspect-[4/3] w-full bg-[rgb(var(--background-subtle))]">
          <MemoriaFoto src={thumb} alt="" sizes="76px" className="object-cover" />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
            <span className="font-mono text-[10px] font-bold tabular-nums text-white">
              {String(parts.day).padStart(2, '0')}
            </span>
          </span>
        </span>
      ) : (
        <span className="flex flex-col items-center px-2 pb-1 pt-2.5">
          <span
            className={[
              'font-mono text-lg font-bold tabular-nums leading-none',
              ativo ? 'text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {parts.day}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[rgb(var(--foreground-muted))]">
            {weekdayCurto(no.dia)}
          </span>
        </span>
      )}

      <span className="flex min-h-[1.35rem] items-center justify-center gap-0.5 px-1 pb-1.5">
        {vazio ? (
          <span className="h-1 w-1 rounded-full bg-[rgb(var(--border-strong))]" />
        ) : (
          kinds.slice(0, 3).map((k) => (
            <span key={k} className={['h-1.5 w-1.5 rounded-full', KIND_META[k].dot].join(' ')} />
          ))
        )}
        {hoje && (
          <span className="ml-0.5 font-mono text-[7px] uppercase tracking-[0.08em] text-[rgb(var(--color-primary-fg))]">
            ·
          </span>
        )}
      </span>
    </button>
  )
}

function noCombinaFiltro(no: MemoriaEspinhaDia, filtro: MemoriaFiltro): boolean {
  if (filtro === 'todos') return true
  if (filtro === 'jogo') return no.kinds.includes('partida')
  if (filtro === 'evento') return no.kinds.includes('evento')
  return no.kinds.includes('post') || no.kinds.includes('foto')
}

function resumoNo(det?: MemoriaDiaDetalhe): string | null {
  if (!det) return null
  if (det.marco) return det.marco.titulo
  if (det.partida) {
    const placar =
      det.partida.status === 'ENCERRADA' &&
      det.partida.placarCasa != null &&
      det.partida.placarFora != null
        ? ` · ${det.partida.placarCasa}–${det.partida.placarFora}`
        : ''
    return `${det.partida.adversario}${placar}`
  }
  if (det.eventos[0]) return det.eventos[0].titulo
  if (det.posts[0]) return det.posts[0].trecho
  return null
}

function thumbNo(det?: MemoriaDiaDetalhe): string | null {
  if (!det) return null
  if (det.fotos[0]) return det.fotos[0]
  if (det.eventos[0]?.fotoUrl) return det.eventos[0].fotoUrl
  return null
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
