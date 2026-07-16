'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { MapPin, Search, Sparkles, X, ZoomOut } from 'lucide-react'
import { ClubeOnboardingCardRow } from '@/components/onboarding/clube-onboarding-card-row'
import { BRASIL_ESTADOS_PATHS } from '@/components/onboarding/brasil-estados-paths'
import {
  CENTRO_UF,
  VIEWBOX_BRASIL,
  VIEWBOX_REGIAO,
  VIEWBOX_UF,
  type MapViewport,
} from '@/components/onboarding/mapa-brasil-viewports'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import {
  fadeUp,
  springGentle,
  springSnappy,
  staggerContainer,
  staggerItem,
} from '@/lib/motion-presets'
import type { AfiliacaoOnboarding, RegiaoOnboarding } from '@/lib/onboarding'
import {
  NOME_UF,
  REGIOES_BRASIL,
  regiaoDaUf,
  type RegiaoBrasilId,
} from '@/lib/regioes-brasil'

const VIEWBOX_FULL = '0 0 450 460'

function isViewportBrasil(v: MapViewport): boolean {
  return v.x === VIEWBOX_BRASIL.x && v.y === VIEWBOX_BRASIL.y && v.w === VIEWBOX_BRASIL.w
}

const VIEWBOX_FULL = '0 0 450 460'

type Props = {
  afiliacoes: AfiliacaoOnboarding[]
  regioes: RegiaoOnboarding[]
  ufSelecionada: string
  onUfSelecionar: (uf: string) => void
  onSelecionarClube: (a: AfiliacaoOnboarding) => void
}

function corRegiao(uf: string): string {
  const regiao = regiaoDaUf(uf)
  if (!regiao) return '#4b5563'
  return REGIOES_BRASIL.find((r) => r.id === regiao)?.face ?? '#4b5563'
}

function viewportTransform(v: MapViewport): string {
  const scale = Math.min(450 / v.w, 460 / v.h) * 0.94
  const cx = v.x + v.w / 2
  const cy = v.y + v.h / 2
  const tx = 225 - cx * scale
  const ty = 230 - cy * scale
  return `translate(${tx} ${ty}) scale(${scale})`
}

function EstadoSvg({
  uf,
  nome,
  path,
  selecionado,
  hovered,
  dimmed,
  semClubes,
  total,
  onEnter,
  onLeave,
  onClick,
  reduceMotion,
}: {
  uf: string
  nome: string
  path: string
  selecionado: boolean
  hovered: boolean
  dimmed: boolean
  semClubes: boolean
  total: number
  onEnter: () => void
  onLeave: () => void
  onClick: () => void
  reduceMotion: boolean
}) {
  const fill = corRegiao(uf)
  const ativo = selecionado || hovered
  const centro = CENTRO_UF[uf]

  return (
    <g>
      {selecionado && !reduceMotion && (
        <m.circle
          cx={centro?.x ?? 0}
          cy={centro?.y ?? 0}
          r={18}
          fill="none"
          stroke="rgb(var(--color-primary))"
          strokeWidth={1.5}
          initial={{ opacity: 0.6, scale: 0.6 }}
          animate={{ opacity: 0, scale: 2.2 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <m.path
        d={path}
        fill={fill}
        stroke={ativo ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.32)'}
        strokeWidth={ativo ? 1.6 : 0.55}
        strokeLinejoin="round"
        strokeLinecap="round"
        role="button"
        tabIndex={semClubes ? -1 : 0}
        aria-label={`${nome}${total > 0 ? `, ${total} clubes` : ', sem clubes cadastrados'}`}
        aria-pressed={selecionado}
        aria-disabled={semClubes}
        style={{ cursor: semClubes ? 'not-allowed' : 'pointer', outline: 'none' }}
        initial={false}
        animate={{
          opacity: dimmed ? 0.28 : semClubes ? 0.45 : ativo ? 1 : 0.88,
          filter: selecionado
            ? `brightness(1.2) drop-shadow(0 0 14px ${fill})`
            : hovered
              ? 'brightness(1.1)'
              : semClubes
                ? 'saturate(0.35)'
                : 'brightness(1)',
        }}
        transition={reduceMotion ? { duration: 0 } : springSnappy}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        onClick={() => {
          if (!semClubes) onClick()
        }}
        onKeyDown={(e) => {
          if (semClubes) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
      />
      {total > 0 && !dimmed && (
        <circle
          cx={centro?.x ?? 0}
          cy={centro?.y ?? 0}
          r={selecionado ? 3.2 : 2.2}
          fill={selecionado ? '#fff' : 'rgba(255,255,255,0.75)'}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  )
}

function PainelClubes({
  uf,
  clubes,
  filtro,
  onFiltro,
  onLimpar,
  onSelecionarClube,
  reduceMotion,
  className,
}: {
  uf: string
  clubes: AfiliacaoOnboarding[]
  filtro: string
  onFiltro: (v: string) => void
  onLimpar: () => void
  onSelecionarClube: (a: AfiliacaoOnboarding) => void
  reduceMotion: boolean
  className?: string
}) {
  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return clubes
    return clubes.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.apelido?.toLowerCase().includes(q),
    )
  }, [clubes, filtro])

  return (
    <m.aside
      key={uf}
      initial={{ opacity: 0, x: reduceMotion ? 0 : 20, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: reduceMotion ? 0 : 12 }}
      transition={reduceMotion ? { duration: 0 } : springGentle}
      className={
        className ??
        'flex min-h-[240px] flex-col border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))]/70 lg:min-h-[380px] lg:border-l lg:border-t-0'
      }
    >
      <header
        className="border-b border-[rgb(var(--border))] px-4 py-3"
        style={{
          background: `linear-gradient(135deg, ${corRegiao(uf)}22 0%, transparent 65%)`,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm"
              style={{ backgroundColor: corRegiao(uf) }}
            >
              {uf}
            </span>
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                {NOME_UF[uf] ?? uf}
              </p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                {clubes.length} {clubes.length === 1 ? 'clube' : 'clubes'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLimpar}
            className="rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]"
            aria-label="Fechar seleção"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {clubes.length > 4 && (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
            <input
              type="search"
              value={filtro}
              onChange={(e) => onFiltro(e.target.value)}
              placeholder="Filtrar neste estado..."
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1.5 pl-8 pr-3 text-xs text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]/50 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-primary))]/30"
              aria-label={`Filtrar clubes em ${NOME_UF[uf] ?? uf}`}
            />
          </div>
        )}
      </header>

      {filtrados.length === 0 ? (
        <MotionEmptyState
          className="m-4 flex-1 border-none bg-transparent py-10"
          icon={<MapPin className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
          title={filtro ? 'Nenhum resultado' : 'Sem clubes aqui'}
          description={
            filtro
              ? 'Tente outro nome ou limpe o filtro.'
              : 'Escolha outro estado ou busque pelo nome do clube.'
          }
        />
      ) : (
        <m.ul
          className="flex-1 space-y-2 overflow-y-auto p-3 sm:p-4"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {filtrados.map((c) => (
            <m.li key={c.id} variants={staggerItem}>
              <ClubeOnboardingCardRow clube={c} onSelecionar={onSelecionarClube} />
            </m.li>
          ))}
        </m.ul>
      )}
    </m.aside>
  )
}

export function MapaBrasilEstados({
  afiliacoes,
  regioes,
  ufSelecionada,
  onUfSelecionar,
  onSelecionarClube,
}: Props) {
  const reduceMotion = useReducedMotion()
  const [ufHover, setUfHover] = useState<string | null>(null)
  const [regiaoDestaque, setRegiaoDestaque] = useState<RegiaoBrasilId | null>(null)
  const [viewport, setViewport] = useState<MapViewport>(VIEWBOX_BRASIL)
  const [filtroPainel, setFiltroPainel] = useState('')

  const totalPorUf = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of regioes) map.set(r.uf, r.total)
    return map
  }, [regioes])

  const clubesPorUf = useMemo(() => {
    const map = new Map<string, AfiliacaoOnboarding[]>()
    for (const a of afiliacoes) {
      const uf = a.estado?.toUpperCase()
      if (!uf) continue
      const list = map.get(uf) ?? []
      list.push(a)
      map.set(uf, list)
    }
    return map
  }, [afiliacoes])

  const clubesPainel = ufSelecionada ? (clubesPorUf.get(ufSelecionada) ?? []) : []
  const ufTooltip = ufHover && ufHover !== ufSelecionada ? ufHover : null
  const zoomAtivo = !isViewportBrasil(viewport)

  useEffect(() => {
    setFiltroPainel('')
  }, [ufSelecionada])

  useEffect(() => {
    if (ufSelecionada && VIEWBOX_UF[ufSelecionada]) {
      setViewport(VIEWBOX_UF[ufSelecionada])
      return
    }
    if (regiaoDestaque && VIEWBOX_REGIAO[regiaoDestaque]) {
      setViewport(VIEWBOX_REGIAO[regiaoDestaque])
      return
    }
    setViewport(VIEWBOX_BRASIL)
  }, [ufSelecionada, regiaoDestaque])

  function selecionarUf(uf: string) {
    if ((totalPorUf.get(uf) ?? 0) === 0) return
    onUfSelecionar(ufSelecionada === uf ? '' : uf)
    setRegiaoDestaque(null)
  }

  function limparTudo() {
    onUfSelecionar('')
    setRegiaoDestaque(null)
    setViewport(VIEWBOX_BRASIL)
  }

  function toggleRegiao(id: RegiaoBrasilId) {
    const prox = regiaoDestaque === id ? null : id
    setRegiaoDestaque(prox)
    if (prox) onUfSelecionar('')
  }

  function estadoDimmed(uf: string): boolean {
    if (ufSelecionada && uf !== ufSelecionada) return true
    if (regiaoDestaque) {
      const meta = REGIOES_BRASIL.find((r) => r.id === regiaoDestaque)
      return meta ? !meta.ufs.includes(uf) : false
    }
    return false
  }

  const subtitulo = ufSelecionada
    ? `Escolha seu clube em ${NOME_UF[ufSelecionada] ?? ufSelecionada}`
    : regiaoDestaque
      ? `Explore os estados do ${REGIOES_BRASIL.find((r) => r.id === regiaoDestaque)?.nome}`
      : 'Toque num estado colorido para ver os clubes da região'

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm">
      {/* Cabeçalho */}
      <div
        className="border-b border-[rgb(var(--border))] px-4 py-3.5 sm:px-5"
        style={{
          background:
            'radial-gradient(ellipse 90% 140% at 0% 0%, rgb(var(--color-primary) / 0.14), transparent 60%), linear-gradient(180deg, rgb(var(--surface-raised)) 0%, rgb(var(--surface)) 100%)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[rgb(var(--color-primary))]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-widest">
                Explore o Brasil
              </span>
            </div>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{subtitulo}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {zoomAtivo && (
              <button
                type="button"
                onClick={limparTudo}
                className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--color-primary))]/50 hover:text-[rgb(var(--foreground))]"
              >
                <ZoomOut className="h-3.5 w-3.5" />
                Ver Brasil
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className={`grid gap-0 ${
          ufSelecionada
            ? 'lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]'
            : 'grid-cols-1'
        }`}
      >
        {/* Mapa */}
        <div className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(rgb(var(--color-primary) / 0.15) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
            aria-hidden
          />
          <div
            className="relative px-2 py-3 sm:px-4 sm:py-4"
            style={{
              background:
                'radial-gradient(ellipse 70% 55% at 50% 42%, rgb(var(--color-primary) / 0.1), transparent 72%)',
            }}
          >
            <svg
              viewBox={VIEWBOX_FULL}
              className="mx-auto h-auto w-full max-w-[440px]"
              role="img"
              aria-label="Mapa interativo do Brasil por estados"
            >
              <defs>
                <filter id="mapa-estado-shadow" x="-25%" y="-25%" width="150%" height="150%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.28" />
                </filter>
              </defs>
              <m.g
                filter="url(#mapa-estado-shadow)"
                initial={false}
                animate={{ transform: viewportTransform(viewport) }}
                transition={reduceMotion ? { duration: 0 } : { ...springGentle, duration: 0.55 }}
                style={{ transformOrigin: '0 0' }}
              >
                {BRASIL_ESTADOS_PATHS.map((estado) => {
                  const total = totalPorUf.get(estado.uf) ?? 0
                  return (
                    <EstadoSvg
                      key={estado.uf}
                      uf={estado.uf}
                      nome={estado.nome}
                      path={estado.path}
                      selecionado={ufSelecionada === estado.uf}
                      hovered={ufHover === estado.uf}
                      dimmed={estadoDimmed(estado.uf)}
                      semClubes={total === 0}
                      total={total}
                      onEnter={() => setUfHover(estado.uf)}
                      onLeave={() => setUfHover(null)}
                      onClick={() => selecionarUf(estado.uf)}
                      reduceMotion={reduceMotion ?? false}
                    />
                  )
                })}
              </m.g>
            </svg>

            <AnimatePresence>
              {ufTooltip && (
                <m.div
                  key={ufTooltip}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={reduceMotion ? { duration: 0 } : springSnappy}
                  className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] shadow-lg backdrop-blur-md"
                >
                  <MapPin className="mr-1 inline h-3 w-3 text-[rgb(var(--color-primary))]" />
                  {NOME_UF[ufTooltip] ?? ufTooltip}
                  <span className="ml-1.5 text-[rgb(var(--foreground-muted))]">
                    · {totalPorUf.get(ufTooltip) ?? 0} clubes
                  </span>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Painel desktop */}
        <AnimatePresence mode="wait">
          {ufSelecionada && (
            <div className="hidden lg:block">
              <PainelClubes
                uf={ufSelecionada}
                clubes={clubesPainel}
                filtro={filtroPainel}
                onFiltro={setFiltroPainel}
                onLimpar={limparTudo}
                onSelecionarClube={onSelecionarClube}
                reduceMotion={reduceMotion ?? false}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Painel mobile — sheet */}
      <AnimatePresence>
        {ufSelecionada && (
          <m.div
            key={`mobile-${ufSelecionada}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={reduceMotion ? { duration: 0 } : springGentle}
            className="border-t border-[rgb(var(--border))] lg:hidden"
          >
            <PainelClubes
              uf={ufSelecionada}
              clubes={clubesPainel}
              filtro={filtroPainel}
              onFiltro={setFiltroPainel}
              onLimpar={limparTudo}
              onSelecionarClube={onSelecionarClube}
              reduceMotion={reduceMotion ?? false}
              className="flex max-h-[min(52vh,420px)] flex-col bg-[rgb(var(--surface-raised))]/80"
            />
          </m.div>
        )}
      </AnimatePresence>

      {/* Regiões */}
      <m.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        transition={springGentle}
        className="border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5"
      >
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Filtrar por região
        </p>
        <ul className="flex flex-wrap gap-2">
          {REGIOES_BRASIL.map((regiao) => {
            const ativa = regiaoDestaque === regiao.id
            const total = regiao.ufs.reduce((s, uf) => s + (totalPorUf.get(uf) ?? 0), 0)
            return (
              <li key={regiao.id}>
                <button
                  type="button"
                  onClick={() => toggleRegiao(regiao.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
                    ativa
                      ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/12 text-[rgb(var(--color-primary))] shadow-sm'
                      : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--color-primary))]/40 hover:text-[rgb(var(--foreground))]'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full ring-1 ring-white/20"
                    style={{ backgroundColor: regiao.face }}
                    aria-hidden
                  />
                  {regiao.nome}
                  <span className="opacity-55">({total})</span>
                </button>
              </li>
            )
          })}
        </ul>
      </m.div>
    </div>
  )
}
