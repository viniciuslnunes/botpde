'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { Loader2, MapPin, Search, Sparkles, X, ZoomOut } from 'lucide-react'
import { BandeiraEstado } from '@/components/onboarding/bandeira-estado'
import { ClubeOnboardingCard } from '@/components/onboarding/clube-onboarding-card'
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
  type RegiaoBrasilMeta,
} from '@/lib/regioes-brasil'

const VIEWBOX_FULL = '0 0 450 460'

/**
 * Altura do bloco mapa + listagem só em desktop (lado a lado).
 * No mobile o bloco cresce com o conteúdo — altura fixa + mapa + chips
 * espremia a lista a ~0px e os clubes sumiam da viewport.
 */
const ALTURA_BLOCO_LG = 'lg:h-[min(72vh,580px)]'

type Props = {
  afiliacoes: AfiliacaoOnboarding[]
  regioes: RegiaoOnboarding[]
  ufSelecionada: string
  onUfSelecionar: (uf: string) => void
  onSelecionarClube: (a: AfiliacaoOnboarding) => void
  busca?: string
  resultadosBusca?: AfiliacaoOnboarding[]
  buscando?: boolean
  onLimparPainel?: () => void
}

function isViewportBrasil(v: MapViewport): boolean {
  return v.x === VIEWBOX_BRASIL.x && v.y === VIEWBOX_BRASIL.y && v.w === VIEWBOX_BRASIL.w
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

function CabecalhoPainel({
  titulo,
  subtitulo,
  uf,
  cor,
  onLimpar,
  filtro,
  onFiltro,
  mostrarFiltro,
  reduceMotion,
}: {
  titulo: string
  subtitulo: string
  uf?: string
  /** Cor da região quando o painel não é de um estado específico. */
  cor?: string
  onLimpar: () => void
  filtro: string
  onFiltro: (v: string) => void
  mostrarFiltro: boolean
  reduceMotion: boolean
}) {
  const corFundo = uf ? corRegiao(uf) : cor
  return (
    <header
      className="sticky top-0 z-10 shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))]/95 px-4 py-3 backdrop-blur-md"
      style={
        corFundo
          ? { background: `linear-gradient(135deg, ${corFundo}18 0%, rgb(var(--surface-raised)) 55%)` }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {uf ? (
            <BandeiraEstado uf={uf} size="md" />
          ) : cor ? (
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white ring-1 ring-white/20"
              style={{ backgroundColor: `${cor}33` }}
            >
              <MapPin className="h-4 w-4" style={{ color: cor }} />
            </span>
          ) : (
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(var(--color-primary))]/15 text-[rgb(var(--color-primary-fg))]">
              <Search className="h-4 w-4" />
            </span>
          )}
          <AnimatePresence mode="wait">
            <m.div
              key={titulo}
              initial={reduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: 6 }}
              transition={reduceMotion ? { duration: 0 } : springSnappy}
              className="min-w-0"
            >
              <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">{subtitulo}</p>
            </m.div>
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={onLimpar}
          className="shrink-0 rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--foreground))]"
          aria-label={uf ? 'Fechar seleção do estado' : cor ? 'Limpar região' : 'Limpar busca'}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {mostrarFiltro && (
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
          <input
            type="search"
            value={filtro}
            onChange={(e) => onFiltro(e.target.value)}
            placeholder="Filtrar clubes..."
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1.5 pl-8 pr-3 text-xs text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]/50 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-primary))]/30"
          />
        </div>
      )}
    </header>
  )
}

function ListaClubesScroll({
  clubes,
  onSelecionarClube,
  vazioTitulo,
  vazioDescricao,
}: {
  clubes: AfiliacaoOnboarding[]
  onSelecionarClube: (a: AfiliacaoOnboarding) => void
  vazioTitulo: string
  vazioDescricao: string
}) {
  if (clubes.length === 0) {
    return (
      <MotionEmptyState
        className="m-4 border-none bg-transparent py-8"
        icon={<MapPin className="mb-2 h-7 w-7 text-[rgb(var(--foreground-muted))]" />}
        title={vazioTitulo}
        description={vazioDescricao}
      />
    )
  }

return (
    <m.ul
      className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-1 sm:p-4"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {clubes.map((c) => (
        <m.li key={c.id} variants={staggerItem} className="min-w-0">
          <ClubeOnboardingCard clube={c} onSelecionar={onSelecionarClube} compact />
        </m.li>
      ))}
    </m.ul>
  )
}

function PainelLateral({
  modo,
  uf,
  regiao,
  clubes,
  filtroLocal,
  onFiltroLocal,
  onLimpar,
  onSelecionarClube,
  reduceMotion,
  busca,
  panelRef,
}: {
  modo: 'estado' | 'regiao' | 'busca'
  uf?: string
  regiao?: RegiaoBrasilMeta
  clubes: AfiliacaoOnboarding[]
  filtroLocal: string
  onFiltroLocal: (v: string) => void
  onLimpar: () => void
  onSelecionarClube: (a: AfiliacaoOnboarding) => void
  reduceMotion: boolean
  busca?: string
  panelRef?: RefObject<HTMLElement | null>
}) {
  const filtrados = useMemo(() => {
    const q = filtroLocal.trim().toLowerCase()
    if (!q) return clubes
    return clubes.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.apelido?.toLowerCase().includes(q),
    )
  }, [clubes, filtroLocal])

  const titulo =
    modo === 'estado' && uf
      ? (NOME_UF[uf] ?? uf)
      : modo === 'regiao' && regiao
        ? `Região ${regiao.nome}`
        : `Resultados para "${busca}"`

  const subtitulo =
    modo === 'busca'
      ? `${clubes.length} ${clubes.length === 1 ? 'encontrado' : 'encontrados'}`
      : `${clubes.length} ${clubes.length === 1 ? 'clube' : 'clubes'} cadastrados`

  return (
    <m.aside
      ref={panelRef}
      key={modo === 'estado' ? uf : modo === 'regiao' ? regiao?.id : 'busca'}
      initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: reduceMotion ? 0 : 8 }}
      transition={reduceMotion ? { duration: 0 } : springGentle}
      className="flex min-h-0 flex-1 flex-col border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))]/80 lg:border-l lg:border-t-0"
    >
      <CabecalhoPainel
        titulo={titulo}
        subtitulo={subtitulo}
        uf={modo === 'estado' ? uf : undefined}
        cor={modo === 'regiao' ? regiao?.face : undefined}
        onLimpar={onLimpar}
        filtro={filtroLocal}
        onFiltro={onFiltroLocal}
        mostrarFiltro={clubes.length > 4}
        reduceMotion={reduceMotion}
      />
      {/*
        Mobile: lista no fluxo da página (sem altura fixa do pai) — overflow visível.
        Desktop: scroll interno dentro do painel lado a lado.
      */}
      <div className="min-h-0 flex-1 overscroll-contain lg:overflow-y-auto lg:[scrollbar-gutter:stable]">
        <ListaClubesScroll
          clubes={filtrados}
          onSelecionarClube={onSelecionarClube}
          vazioTitulo={filtroLocal ? 'Nenhum resultado' : 'Sem clubes aqui'}
          vazioDescricao={
            filtroLocal
              ? 'Tente outro nome ou limpe o filtro.'
              : 'Escolha outro estado ou busque pelo nome do clube.'
          }
        />
      </div>
    </m.aside>
  )
}

export function MapaBrasilEstados({
  afiliacoes,
  regioes,
  ufSelecionada,
  onUfSelecionar,
  onSelecionarClube,
  busca = '',
  resultadosBusca = [],
  buscando = false,
  onLimparPainel,
}: Props) {
  const reduceMotion = useReducedMotion()
  const [ufHover, setUfHover] = useState<string | null>(null)
  const [regiaoDestaque, setRegiaoDestaque] = useState<RegiaoBrasilId | null>(null)
  const [viewport, setViewport] = useState<MapViewport>(VIEWBOX_BRASIL)
  const [filtroPainel, setFiltroPainel] = useState('')
  const painelRef = useRef<HTMLElement | null>(null)

  const buscaAtiva = Boolean(busca.trim())
  const painelAtivo = Boolean(ufSelecionada) || buscaAtiva || Boolean(regiaoDestaque)
  const modoPainel: 'estado' | 'regiao' | 'busca' | null = buscaAtiva
    ? 'busca'
    : ufSelecionada
      ? 'estado'
      : regiaoDestaque
        ? 'regiao'
        : null

  const metaRegiaoDestaque = regiaoDestaque
    ? (REGIOES_BRASIL.find((r) => r.id === regiaoDestaque) ?? undefined)
    : undefined

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

  // Região: mantém a ordem de relevância do catálogo, só recorta pelas UFs.
  const clubesRegiao = useMemo(() => {
    if (!metaRegiaoDestaque) return []
    const ufs = new Set(metaRegiaoDestaque.ufs)
    return afiliacoes.filter((a) => {
      const uf = a.estado?.toUpperCase()
      return uf ? ufs.has(uf) : false
    })
  }, [afiliacoes, metaRegiaoDestaque])

  const ufTooltip = ufHover && ufHover !== ufSelecionada ? ufHover : null
  const zoomAtivo = !isViewportBrasil(viewport)

  useEffect(() => {
    setFiltroPainel('')
  }, [ufSelecionada, busca, regiaoDestaque])

  useEffect(() => {
    if (buscaAtiva) {
      setViewport(VIEWBOX_BRASIL)
      return
    }
    if (ufSelecionada && VIEWBOX_UF[ufSelecionada]) {
      setViewport(VIEWBOX_UF[ufSelecionada])
      return
    }
    if (regiaoDestaque && VIEWBOX_REGIAO[regiaoDestaque]) {
      setViewport(VIEWBOX_REGIAO[regiaoDestaque])
      return
    }
    setViewport(VIEWBOX_BRASIL)
  }, [ufSelecionada, regiaoDestaque, buscaAtiva])

  // No mobile o mapa fica acima da lista — ao selecionar UF/busca, leva o painel à vista.
  useEffect(() => {
    if (!painelAtivo || !painelRef.current) return
    if (typeof window === 'undefined') return
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    if (isDesktop) return
    const el = painelRef.current
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [painelAtivo, ufSelecionada, regiaoDestaque, buscaAtiva, reduceMotion])

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

  function fecharPainel() {
    if (buscaAtiva) {
      onLimparPainel?.()
      return
    }
    limparTudo()
  }

  function toggleRegiao(id: RegiaoBrasilId) {
    const prox = regiaoDestaque === id ? null : id
    setRegiaoDestaque(prox)
    if (prox) onUfSelecionar('')
  }

  function estadoDimmed(uf: string): boolean {
    if (buscaAtiva) return true
    if (ufSelecionada && uf !== ufSelecionada) return true
    if (regiaoDestaque) {
      const meta = REGIOES_BRASIL.find((r) => r.id === regiaoDestaque)
      return meta ? !meta.ufs.includes(uf) : false
    }
    return false
  }

  const subtitulo = buscaAtiva
    ? 'Resultados da busca ao lado do mapa'
    : ufSelecionada
      ? `Escolha seu clube em ${NOME_UF[ufSelecionada] ?? ufSelecionada}`
      : regiaoDestaque
        ? `Explore os estados do ${REGIOES_BRASIL.find((r) => r.id === regiaoDestaque)?.nome}`
        : 'Toque num estado colorido para ver os clubes da região'

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm ${
        painelAtivo ? ALTURA_BLOCO_LG : ''
      }`}
    >
      <div
        className="shrink-0 border-b border-[rgb(var(--border))] px-4 py-3.5 sm:px-5"
        style={{
          background:
            'radial-gradient(ellipse 90% 140% at 0% 0%, rgb(var(--color-primary) / 0.14), transparent 60%), linear-gradient(180deg, rgb(var(--surface-raised)) 0%, rgb(var(--surface)) 100%)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[rgb(var(--color-primary-fg))]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-widest">
                Explore o Brasil
              </span>
            </div>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{subtitulo}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {ufSelecionada && (
              <button
                type="button"
                onClick={limparTudo}
                className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--color-primary))]/50 hover:text-[rgb(var(--foreground))]"
              >
                <X className="h-3.5 w-3.5" />
                Limpar
              </button>
            )}
            {zoomAtivo && !buscaAtiva && (
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

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={`relative flex shrink-0 flex-col overflow-hidden transition-opacity ${
            painelAtivo
              ? 'h-[min(32vh,200px)] lg:h-auto lg:min-h-0 lg:flex-1'
              : 'flex-1'
          } ${buscaAtiva ? 'opacity-60' : ''}`}
        >
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
            className="relative flex flex-1 items-center justify-center px-2 py-2 sm:px-4 sm:py-3"
            style={{
              background:
                'radial-gradient(ellipse 70% 55% at 50% 42%, rgb(var(--color-primary) / 0.1), transparent 72%)',
            }}
          >
            <svg
              viewBox={VIEWBOX_FULL}
              className="mx-auto h-full max-h-full w-full max-w-[420px]"
              role="img"
              aria-label="Mapa interativo do Brasil por estados"
              preserveAspectRatio="xMidYMid meet"
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
              {ufTooltip && !buscaAtiva && (
                <m.div
                  key={ufTooltip}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={reduceMotion ? { duration: 0 } : springSnappy}
                  className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] shadow-lg backdrop-blur-md"
                >
                  <BandeiraEstado uf={ufTooltip} size="sm" />
                  <span>
                    {NOME_UF[ufTooltip] ?? ufTooltip}
                    <span className="ml-1.5 text-[rgb(var(--foreground-muted))]">
                      · {totalPorUf.get(ufTooltip) ?? 0} clubes
                    </span>
                  </span>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {buscando ? (
            <m.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[120px] flex-1 items-center justify-center border-t border-[rgb(var(--border))] lg:min-h-0 lg:border-l lg:border-t-0"
            >
              <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--foreground-muted))]" />
            </m.div>
          ) : modoPainel === 'estado' ? (
            <PainelLateral
              key={`uf-${ufSelecionada}`}
              modo="estado"
              uf={ufSelecionada}
              clubes={clubesPainel}
              filtroLocal={filtroPainel}
              onFiltroLocal={setFiltroPainel}
              onLimpar={fecharPainel}
              onSelecionarClube={onSelecionarClube}
              reduceMotion={reduceMotion ?? false}
              panelRef={painelRef}
            />
          ) : modoPainel === 'regiao' && metaRegiaoDestaque ? (
            <PainelLateral
              key={`regiao-${metaRegiaoDestaque.id}`}
              modo="regiao"
              regiao={metaRegiaoDestaque}
              clubes={clubesRegiao}
              filtroLocal={filtroPainel}
              onFiltroLocal={setFiltroPainel}
              onLimpar={fecharPainel}
              onSelecionarClube={onSelecionarClube}
              reduceMotion={reduceMotion ?? false}
              panelRef={painelRef}
            />
          ) : modoPainel === 'busca' ? (
            <PainelLateral
              key="busca"
              modo="busca"
              clubes={resultadosBusca}
              filtroLocal={filtroPainel}
              onFiltroLocal={setFiltroPainel}
              onLimpar={fecharPainel}
              onSelecionarClube={onSelecionarClube}
              reduceMotion={reduceMotion ?? false}
              busca={busca}
              panelRef={painelRef}
            />
          ) : null}
        </AnimatePresence>
      </div>

      {/* Chips de região só quando ainda não há painel — no mobile competiam com a lista. */}
      {!buscaAtiva && !ufSelecionada && (
        <m.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={springGentle}
          className="shrink-0 border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5"
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
                        ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/12 text-[rgb(var(--color-primary-fg))] shadow-sm'
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
      )}
    </div>
  )
}
