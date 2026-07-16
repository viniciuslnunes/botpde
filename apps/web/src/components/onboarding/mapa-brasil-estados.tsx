'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { MapPin, X } from 'lucide-react'
import { ClubeOnboardingCard } from '@/components/onboarding/clube-onboarding-card'
import { BRASIL_ESTADOS_PATHS } from '@/components/onboarding/brasil-estados-paths'
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

const VIEWBOX = '0 0 450 460'

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

function EstadoSvg({
  uf,
  nome,
  path,
  selecionado,
  hovered,
  dimmed,
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
  total: number
  onEnter: () => void
  onLeave: () => void
  onClick: () => void
  reduceMotion: boolean
}) {
  const fill = corRegiao(uf)
  const ativo = selecionado || hovered

  return (
    <m.path
      d={path}
      fill={fill}
      stroke={ativo ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.35)'}
      strokeWidth={ativo ? 1.4 : 0.6}
      strokeLinejoin="round"
      strokeLinecap="round"
      role="button"
      tabIndex={0}
      aria-label={`${nome}${total > 0 ? `, ${total} clubes` : ''}`}
      aria-pressed={selecionado}
      style={{ cursor: 'pointer', outline: 'none' }}
      initial={false}
      animate={{
        opacity: dimmed ? 0.38 : ativo ? 1 : 0.82,
        filter: selecionado
          ? `brightness(1.18) drop-shadow(0 0 10px ${fill})`
          : hovered
            ? 'brightness(1.12)'
            : 'brightness(1)',
      }}
      transition={reduceMotion ? { duration: 0 } : springSnappy}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    />
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

  function toggleUf(uf: string) {
    onUfSelecionar(ufSelecionada === uf ? '' : uf)
  }

  function estadoDimmed(uf: string): boolean {
    if (ufSelecionada && uf !== ufSelecionada) return true
    if (regiaoDestaque) {
      const meta = REGIOES_BRASIL.find((r) => r.id === regiaoDestaque)
      return meta ? !meta.ufs.includes(uf) : false
    }
    return false
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div
        className="border-b border-[rgb(var(--border))] px-4 py-3 sm:px-5"
        style={{
          background:
            'radial-gradient(ellipse 80% 120% at 0% 0%, rgb(var(--color-primary) / 0.12), transparent 55%), linear-gradient(180deg, rgb(var(--surface-raised)) 0%, rgb(var(--surface)) 100%)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Mapa do Brasil
            </p>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
              {ufSelecionada
                ? `${NOME_UF[ufSelecionada] ?? ufSelecionada} · clique no estado para trocar`
                : 'Clique em um estado para ver os clubes'}
            </p>
          </div>
          {ufSelecionada && (
            <button
              type="button"
              onClick={() => onUfSelecionar('')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--color-primary))]/50 hover:text-[rgb(var(--foreground))]"
            >
              <X className="h-3.5 w-3.5" />
              Limpar seleção
            </button>
          )}
        </div>
      </div>

      <div
        className={`grid gap-0 transition-[grid-template-columns] duration-300 ${
          ufSelecionada ? 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]' : 'grid-cols-1'
        }`}
      >
        {/* Mapa */}
        <div
          className="relative px-3 py-4 sm:px-5 sm:py-5"
          style={{
            background:
              'radial-gradient(ellipse 65% 50% at 50% 45%, rgb(var(--color-primary) / 0.08), transparent 70%)',
          }}
        >
          <svg
            viewBox={VIEWBOX}
            className="mx-auto h-auto w-full max-w-[420px]"
            role="img"
            aria-label="Mapa do Brasil por estados"
          >
            <defs>
              <filter id="mapa-estado-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
              </filter>
            </defs>
            <g filter="url(#mapa-estado-glow)">
              {BRASIL_ESTADOS_PATHS.map((estado) => (
                <EstadoSvg
                  key={estado.uf}
                  uf={estado.uf}
                  nome={estado.nome}
                  path={estado.path}
                  selecionado={ufSelecionada === estado.uf}
                  hovered={ufHover === estado.uf}
                  dimmed={estadoDimmed(estado.uf)}
                  total={totalPorUf.get(estado.uf) ?? 0}
                  onEnter={() => setUfHover(estado.uf)}
                  onLeave={() => setUfHover(null)}
                  onClick={() => toggleUf(estado.uf)}
                  reduceMotion={reduceMotion ?? false}
                />
              ))}
            </g>
          </svg>

          <AnimatePresence>
            {ufTooltip && (
              <m.div
                key={ufTooltip}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={reduceMotion ? { duration: 0 } : springSnappy}
                className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] shadow-lg backdrop-blur-sm"
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

        {/* Painel conectado — só após clique */}
        <AnimatePresence mode="wait">
          {ufSelecionada && (
            <m.aside
              key={ufSelecionada}
              initial={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduceMotion ? 0 : 12 }}
              transition={reduceMotion ? { duration: 0 } : springGentle}
              className="flex min-h-[220px] flex-col border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))]/60 lg:min-h-[360px] lg:border-l lg:border-t-0"
            >
              <header className="border-b border-[rgb(var(--border))] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: corRegiao(ufSelecionada) }}
                  >
                    {ufSelecionada}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                      {NOME_UF[ufSelecionada] ?? ufSelecionada}
                    </p>
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">
                      {clubesPainel.length}{' '}
                      {clubesPainel.length === 1 ? 'clube' : 'clubes'} cadastrados
                    </p>
                  </div>
                </div>
              </header>

              {clubesPainel.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
                  Nenhum clube neste estado ainda. Tente outro estado ou busque pelo nome.
                </div>
              ) : (
                <m.ul
                  className="flex-1 space-y-2 overflow-y-auto p-3 sm:p-4"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                >
                  {clubesPainel.map((c) => (
                    <m.li key={c.id} variants={staggerItem}>
                      <ClubeOnboardingCard
                        clube={c}
                        onSelecionar={onSelecionarClube}
                        compact
                      />
                    </m.li>
                  ))}
                </m.ul>
              )}
            </m.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Legenda por região */}
      <m.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        transition={springGentle}
        className="border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5"
      >
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Regiões
        </p>
        <ul className="flex flex-wrap gap-2">
          {REGIOES_BRASIL.map((regiao) => {
            const ativa = regiaoDestaque === regiao.id
            const total = regiao.ufs.reduce((s, uf) => s + (totalPorUf.get(uf) ?? 0), 0)
            return (
              <li key={regiao.id}>
                <button
                  type="button"
                  onClick={() => setRegiaoDestaque(ativa ? null : regiao.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    ativa
                      ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary))]'
                      : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--color-primary))]/40'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: regiao.face }}
                    aria-hidden
                  />
                  {regiao.nome}
                  <span className="opacity-60">({total})</span>
                </button>
              </li>
            )
          })}
        </ul>
      </m.div>
    </div>
  )
}
