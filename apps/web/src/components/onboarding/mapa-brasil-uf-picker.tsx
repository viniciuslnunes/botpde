'use client'

import { useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { MapPin, Sparkles, X, ZoomOut } from 'lucide-react'
import { BandeiraEstado } from '@/components/onboarding/bandeira-estado'
import { BRASIL_ESTADOS_PATHS } from '@/components/onboarding/brasil-estados-paths'
import {
  CENTRO_UF,
  VIEWBOX_BRASIL,
  VIEWBOX_REGIAO,
  VIEWBOX_UF,
  type MapViewport,
} from '@/components/onboarding/mapa-brasil-viewports'
import { fadeUp, springGentle, springSnappy } from '@/lib/motion-presets'
import {
  NOME_UF,
  REGIOES_BRASIL,
  regiaoDaUf,
  type RegiaoBrasilId,
} from '@/lib/regioes-brasil'

const VIEWBOX_FULL = '0 0 450 460'

type Props = {
  ufSelecionada: string
  onUfSelecionar: (uf: string) => void
  /** Classe extra no container (altura/largura no form). */
  className?: string
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

/**
 * Mapa do onboarding enxuto para cadastro: escolhe UF, sem painel de clubes.
 * Todas as UFs são clicáveis — aqui o operador está criando o catálogo, não
 * filtrando afiliações já existentes.
 */
export function MapaBrasilUfPicker({ ufSelecionada, onUfSelecionar, className = '' }: Props) {
  const reduceMotion = useReducedMotion()
  const [ufHover, setUfHover] = useState<string | null>(null)
  const [regiaoDestaque, setRegiaoDestaque] = useState<RegiaoBrasilId | null>(null)
  // Não é estado: o enquadramento é função da seleção. Como estado, dependia de
  // um effect para se corrigir, e o mapa exibia o enquadramento anterior por um
  // frame a cada clique.
  const viewport: MapViewport =
    (ufSelecionada ? VIEWBOX_UF[ufSelecionada] : null) ??
    (regiaoDestaque ? VIEWBOX_REGIAO[regiaoDestaque] : null) ??
    VIEWBOX_BRASIL

  const zoomAtivo = !isViewportBrasil(viewport)
  const ufTooltip = ufHover && ufHover !== ufSelecionada ? ufHover : null

  function selecionarUf(uf: string) {
    onUfSelecionar(ufSelecionada === uf ? '' : uf)
    setRegiaoDestaque(null)
  }

  function limparTudo() {
    // Zerar uf/região já devolve o enquadramento do Brasil (viewport é derivado).
    onUfSelecionar('')
    setRegiaoDestaque(null)
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
    ? `Sede em ${NOME_UF[ufSelecionada] ?? ufSelecionada}`
    : regiaoDestaque
      ? `Explore os estados do ${REGIOES_BRASIL.find((r) => r.id === regiaoDestaque)?.nome}`
      : 'Toque no estado da sede do clube'

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm ${className}`}
    >
      <div
        className="border-b border-[rgb(var(--border))] px-4 py-3 sm:px-5"
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
                Praça no Brasil
              </span>
            </div>
            <div className="flex items-center gap-2">
              {ufSelecionada ? <BandeiraEstado uf={ufSelecionada} size="sm" /> : null}
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{subtitulo}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {ufSelecionada ? (
              <button
                type="button"
                onClick={limparTudo}
                className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--color-primary))]/50 hover:text-[rgb(var(--foreground))]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Limpar
              </button>
            ) : null}
            {zoomAtivo ? (
              <button
                type="button"
                onClick={limparTudo}
                className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--color-primary))]/50 hover:text-[rgb(var(--foreground))]"
              >
                <ZoomOut className="h-3.5 w-3.5" aria-hidden />
                Ver Brasil
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative h-[min(42dvh,320px)] overflow-hidden">
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
          className="relative flex h-full items-center justify-center px-2 py-2 sm:px-4"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 50% 42%, rgb(var(--color-primary) / 0.1), transparent 72%)',
          }}
        >
          <svg
            viewBox={VIEWBOX_FULL}
            className="mx-auto h-full max-h-full w-full max-w-[380px]"
            role="img"
            aria-label="Mapa do Brasil — selecione o estado da sede do clube"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <filter id="mapa-uf-picker-shadow" x="-25%" y="-25%" width="150%" height="150%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.28" />
              </filter>
            </defs>
            <m.g
              filter="url(#mapa-uf-picker-shadow)"
              initial={false}
              animate={{ transform: viewportTransform(viewport) }}
              transition={reduceMotion ? { duration: 0 } : { ...springGentle, duration: 0.55 }}
              style={{ transformOrigin: '0 0' }}
            >
              {BRASIL_ESTADOS_PATHS.map((estado) => {
                const selecionado = ufSelecionada === estado.uf
                const hovered = ufHover === estado.uf
                const dimmed = estadoDimmed(estado.uf)
                const ativo = selecionado || hovered
                const fill = corRegiao(estado.uf)
                const centro = CENTRO_UF[estado.uf]

                return (
                  <g key={estado.uf}>
                    {selecionado && !reduceMotion ? (
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
                    ) : null}
                    <m.path
                      d={estado.path}
                      fill={fill}
                      stroke={ativo ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.32)'}
                      strokeWidth={ativo ? 1.6 : 0.55}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      role="button"
                      tabIndex={0}
                      aria-label={estado.nome}
                      aria-pressed={selecionado}
                      style={{ cursor: 'pointer', outline: 'none' }}
                      initial={false}
                      animate={{
                        opacity: dimmed ? 0.28 : ativo ? 1 : 0.88,
                        filter: selecionado
                          ? `brightness(1.2) drop-shadow(0 0 14px ${fill})`
                          : hovered
                            ? 'brightness(1.1)'
                            : 'brightness(1)',
                      }}
                      transition={reduceMotion ? { duration: 0 } : springSnappy}
                      onMouseEnter={() => setUfHover(estado.uf)}
                      onMouseLeave={() => setUfHover(null)}
                      onFocus={() => setUfHover(estado.uf)}
                      onBlur={() => setUfHover(null)}
                      onClick={() => selecionarUf(estado.uf)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selecionarUf(estado.uf)
                        }
                      }}
                    />
                    {!dimmed ? (
                      <circle
                        cx={centro?.x ?? 0}
                        cy={centro?.y ?? 0}
                        r={selecionado ? 3.2 : 2.2}
                        fill={selecionado ? '#fff' : 'rgba(255,255,255,0.75)'}
                        style={{ pointerEvents: 'none' }}
                      />
                    ) : null}
                  </g>
                )
              })}
            </m.g>
          </svg>

          <AnimatePresence>
            {ufTooltip ? (
              <m.div
                key={ufTooltip}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={reduceMotion ? { duration: 0 } : springSnappy}
                className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] shadow-lg backdrop-blur-md"
              >
                <BandeiraEstado uf={ufTooltip} size="sm" />
                <span>{NOME_UF[ufTooltip] ?? ufTooltip}</span>
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {!ufSelecionada ? (
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
                  </button>
                </li>
              )
            })}
          </ul>
        </m.div>
      ) : (
        <div className="flex items-center gap-2 border-t border-[rgb(var(--border))] px-4 py-2.5 text-xs text-[rgb(var(--foreground-muted))] sm:px-5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--color-primary-fg))]" aria-hidden />
          <span>
            UF gravada no catálogo:{' '}
            <span className="font-semibold text-[rgb(var(--foreground))]">{ufSelecionada}</span>
            {' — '}sem UF o clube some do mapa do onboarding.
          </span>
        </div>
      )}
    </div>
  )
}
