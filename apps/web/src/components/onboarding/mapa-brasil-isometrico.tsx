'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { X } from 'lucide-react'
import { ClubeOnboardingCard } from '@/components/onboarding/clube-onboarding-card'
import {
  fadeUp,
  popoverPanel,
  springGentle,
  springSnappy,
  staggerContainer,
  staggerItem,
} from '@/lib/motion-presets'
import type { AfiliacaoOnboarding, RegiaoOnboarding } from '@/lib/onboarding'
import {
  NOME_UF,
  REGIOES_BRASIL,
  type RegiaoBrasilId,
  type RegiaoBrasilMeta,
} from '@/lib/regioes-brasil'

/** Altura da extrusão isométrica (px no viewBox). */
const EXTRUDE = 18
const EXTRUDE_ATIVA = 32

/**
 * Polígonos estilizados (vista isométrica) das 5 regiões —
 * silhueta próxima ao mapa 3D regional (ênfase por extrusão no hover/seleção).
 */
const PATHS_REGIAO: Record<RegiaoBrasilId, string> = {
  norte:
    'M 96 58 L 148 28 L 210 22 L 262 40 L 278 72 L 268 108 L 236 128 L 188 134 L 148 122 L 112 98 L 92 72 Z',
  nordeste:
    'M 262 40 L 312 34 L 358 48 L 382 78 L 378 118 L 352 152 L 318 168 L 288 152 L 272 120 L 268 108 L 278 72 Z',
  'centro-oeste':
    'M 148 122 L 188 134 L 236 128 L 260 148 L 252 188 L 218 208 L 178 204 L 148 178 L 138 148 Z',
  sudeste:
    'M 236 128 L 272 120 L 288 152 L 318 168 L 308 198 L 278 222 L 242 226 L 218 208 L 252 188 L 260 148 Z',
  sul: 'M 218 208 L 242 226 L 236 262 L 210 286 L 174 274 L 168 242 L 178 204 Z',
}

/** Posição dos rótulos (centro aproximado da face). */
const LABEL_XY: Record<RegiaoBrasilId, { x: number; y: number }> = {
  norte: { x: 182, y: 78 },
  nordeste: { x: 330, y: 98 },
  'centro-oeste': { x: 192, y: 162 },
  sudeste: { x: 268, y: 176 },
  sul: { x: 206, y: 246 },
}

type BlocoUf = { uf: string; x: number; y: number; w: number; h: number }

const BLOCOS_UF: Record<RegiaoBrasilId, BlocoUf[]> = {
  norte: [
    { uf: 'RR', x: 128, y: 30, w: 38, h: 30 },
    { uf: 'AP', x: 210, y: 28, w: 36, h: 28 },
    { uf: 'AM', x: 118, y: 62, w: 64, h: 44 },
    { uf: 'PA', x: 190, y: 58, w: 62, h: 46 },
    { uf: 'AC', x: 98, y: 100, w: 38, h: 28 },
    { uf: 'RO', x: 142, y: 104, w: 38, h: 28 },
    { uf: 'TO', x: 198, y: 112, w: 42, h: 30 },
  ],
  nordeste: [
    { uf: 'MA', x: 268, y: 48, w: 38, h: 34 },
    { uf: 'PI', x: 290, y: 80, w: 34, h: 32 },
    { uf: 'CE', x: 326, y: 52, w: 38, h: 34 },
    { uf: 'RN', x: 352, y: 70, w: 30, h: 24 },
    { uf: 'PB', x: 352, y: 96, w: 30, h: 24 },
    { uf: 'PE', x: 326, y: 112, w: 38, h: 28 },
    { uf: 'AL', x: 352, y: 128, w: 28, h: 22 },
    { uf: 'SE', x: 330, y: 140, w: 28, h: 22 },
    { uf: 'BA', x: 286, y: 122, w: 48, h: 44 },
  ],
  'centro-oeste': [
    { uf: 'MT', x: 148, y: 122, w: 52, h: 40 },
    { uf: 'GO', x: 204, y: 134, w: 44, h: 36 },
    { uf: 'DF', x: 228, y: 156, w: 24, h: 20 },
    { uf: 'MS', x: 158, y: 166, w: 48, h: 36 },
  ],
  sudeste: [
    { uf: 'MG', x: 242, y: 122, w: 52, h: 44 },
    { uf: 'ES', x: 298, y: 144, w: 30, h: 30 },
    { uf: 'RJ', x: 276, y: 176, w: 38, h: 30 },
    { uf: 'SP', x: 232, y: 176, w: 44, h: 36 },
  ],
  sul: [
    { uf: 'PR', x: 198, y: 208, w: 44, h: 30 },
    { uf: 'SC', x: 210, y: 238, w: 38, h: 26 },
    { uf: 'RS', x: 178, y: 254, w: 48, h: 34 },
  ],
}

function BlocoIsometrico({
  x,
  y,
  w,
  h,
  face,
  lateralEsq,
  lateralDir,
  profundidade,
  ativo,
  hovered,
  dimmed,
  label,
  onEnter,
  onLeave,
  onClick,
}: {
  x: number
  y: number
  w: number
  h: number
  face: string
  lateralEsq: string
  lateralDir: string
  profundidade: number
  ativo: boolean
  hovered: boolean
  dimmed: boolean
  label: string
  onEnter: () => void
  onLeave: () => void
  onClick: () => void
}) {
  const lift = ativo || hovered ? -8 : 0
  const depth = profundidade
  const top = `${x + w * 0.5},${y} ${x + w},${y + h * 0.35} ${x + w * 0.5},${y + h * 0.7} ${x},${y + h * 0.35}`
  const sideL = `${x},${y + h * 0.35} ${x + w * 0.5},${y + h * 0.7} ${x + w * 0.5},${y + h * 0.7 + depth} ${x},${y + h * 0.35 + depth}`
  const sideR = `${x + w * 0.5},${y + h * 0.7} ${x + w},${y + h * 0.35} ${x + w},${y + h * 0.35 + depth} ${x + w * 0.5},${y + h * 0.7 + depth}`

  return (
    <g
      transform={`translate(0 ${lift})`}
      opacity={dimmed ? 0.28 : 1}
      style={{ cursor: 'pointer', transition: 'opacity 180ms ease' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <polygon points={sideL} fill={lateralEsq} />
      <polygon points={sideR} fill={lateralDir} />
      <polygon
        points={top}
        fill={face}
        stroke={ativo || hovered ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.28)'}
        strokeWidth={ativo || hovered ? 1.6 : 0.8}
      />
      <text
        x={x + w * 0.5}
        y={y + h * 0.38}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize={Math.min(11, w * 0.32)}
        fontWeight={700}
        style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
      >
        {label}
      </text>
    </g>
  )
}

function RegiaoIsometrica({
  meta,
  profundidade,
  ativa,
  hovered,
  dimmed,
  total,
  onEnter,
  onLeave,
  onClick,
}: {
  meta: RegiaoBrasilMeta
  profundidade: number
  ativa: boolean
  hovered: boolean
  dimmed: boolean
  total: number
  onEnter: () => void
  onLeave: () => void
  onClick: () => void
}) {
  const lift = ativa ? -12 : hovered ? -8 : 0
  const d = PATHS_REGIAO[meta.id]
  const label = LABEL_XY[meta.id]

  return (
    <g
      transform={`translate(0 ${lift})`}
      opacity={dimmed ? 0.22 : 1}
      style={{ cursor: 'pointer', transition: 'opacity 200ms ease' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={ativa}
      aria-label={`${meta.nome}${total > 0 ? `, ${total} clubes` : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <path d={d} transform={`translate(0 ${profundidade})`} fill={meta.lateralEsq} opacity={0.95} />
      <path
        d={d}
        transform={`translate(4 ${profundidade * 0.5})`}
        fill={meta.lateralDir}
        opacity={0.88}
      />
      <path
        d={d}
        fill={meta.face}
        stroke={ativa || hovered ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.35)'}
        strokeWidth={ativa || hovered ? 2.2 : 1}
        style={{
          filter: ativa || hovered ? 'brightness(1.14)' : undefined,
        }}
      />
      <text
        x={label.x}
        y={label.y}
        textAnchor="middle"
        fill="#fff"
        fontSize={13}
        fontWeight={700}
        style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}
      >
        {meta.nome}
      </text>
      {total > 0 && (
        <text
          x={label.x}
          y={label.y + 15}
          textAnchor="middle"
          fill="rgba(255,255,255,0.88)"
          fontSize={9}
          fontWeight={600}
          style={{ pointerEvents: 'none' }}
        >
          {total} clubes
        </text>
      )}
    </g>
  )
}

type Props = {
  afiliacoes: AfiliacaoOnboarding[]
  regioes: RegiaoOnboarding[]
  regiaoAtiva: RegiaoBrasilId | null
  ufHover: string | null
  ufSelecionada: string
  onRegiao: (id: RegiaoBrasilId | null) => void
  onUfHover: (uf: string | null) => void
  onUfSelecionar: (uf: string) => void
  onSelecionarClube: (a: AfiliacaoOnboarding) => void
}

export function MapaBrasilIsometrico({
  afiliacoes,
  regioes,
  regiaoAtiva,
  ufHover,
  ufSelecionada,
  onRegiao,
  onUfHover,
  onUfSelecionar,
  onSelecionarClube,
}: Props) {
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [regiaoHover, setRegiaoHover] = useState<RegiaoBrasilId | null>(null)

  useEffect(() => {
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    }
  }, [])

  function hoverUf(uf: string | null) {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    if (uf) {
      onUfHover(uf)
      return
    }
    // Delay para permitir mover o cursor até o painel de clubes
    leaveTimer.current = setTimeout(() => onUfHover(null), 140)
  }

  const totalPorUf = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of regioes) map.set(r.uf, r.total)
    return map
  }, [regioes])

  const totalPorRegiao = useMemo(() => {
    const map = new Map<RegiaoBrasilId, number>()
    for (const meta of REGIOES_BRASIL) {
      let sum = 0
      for (const uf of meta.ufs) sum += totalPorUf.get(uf) ?? 0
      map.set(meta.id, sum)
    }
    return map
  }, [totalPorUf])

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

  const ufPainel = ufHover || (ufSelecionada && regiaoAtiva ? ufSelecionada : null)
  const clubesPainel = ufPainel ? (clubesPorUf.get(ufPainel) ?? []) : []
  const metaAtiva = regiaoAtiva
    ? REGIOES_BRASIL.find((r) => r.id === regiaoAtiva) ?? null
    : null

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <div
          className="relative px-3 pb-3 pt-4 sm:px-5"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 50% 28%, rgb(var(--color-primary) / 0.14), transparent 68%), linear-gradient(165deg, rgb(var(--surface-raised)) 0%, rgb(var(--surface)) 55%, rgb(var(--background-subtle) / 0.4) 100%)',
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Mapa por região
              </p>
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                {metaAtiva
                  ? `${metaAtiva.nome} — passe o mouse num estado`
                  : 'Clique numa região para explorar'}
              </p>
            </div>
            {regiaoAtiva && (
              <button
                type="button"
                onClick={() => {
                  onRegiao(null)
                  onUfHover(null)
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--color-primary))]/50 hover:text-[rgb(var(--foreground))]"
              >
                <X className="h-3.5 w-3.5" />
                Brasil inteiro
              </button>
            )}
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <svg
              viewBox="0 0 420 330"
              className="mx-auto h-auto w-full"
              role="img"
              aria-label="Mapa isométrico do Brasil por regiões"
            >
              <defs>
                <filter id="mapa-soft-shadow" x="-20%" y="-20%" width="140%" height="160%">
                  <feDropShadow dx="0" dy="10" stdDeviation="8" floodOpacity="0.35" />
                </filter>
              </defs>
              <ellipse cx="220" cy="308" rx="150" ry="16" fill="rgba(0,0,0,0.38)" />

              <g filter="url(#mapa-soft-shadow)">
                <AnimatePresence mode="wait">
                  {!regiaoAtiva ? (
                    <m.g
                      key="regioes"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={springGentle}
                    >
                      {(
                        ['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte'] as RegiaoBrasilId[]
                      ).map((id) => {
                        const meta = REGIOES_BRASIL.find((r) => r.id === id)!
                        const hovered = regiaoHover === id
                        return (
                          <RegiaoIsometrica
                            key={id}
                            meta={meta}
                            profundidade={hovered ? EXTRUDE_ATIVA : EXTRUDE}
                            ativa={false}
                            hovered={hovered}
                            dimmed={Boolean(regiaoHover) && !hovered}
                            total={totalPorRegiao.get(id) ?? 0}
                            onEnter={() => setRegiaoHover(id)}
                            onLeave={() => setRegiaoHover(null)}
                            onClick={() => onRegiao(id)}
                          />
                        )
                      })}
                    </m.g>
                  ) : (
                    <m.g
                      key={`ufs-${regiaoAtiva}`}
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={springGentle}
                    >
                      {BLOCOS_UF[regiaoAtiva].map((bloco) => {
                        const meta = metaAtiva!
                        const hovered = ufHover === bloco.uf
                        const selecionada = ufSelecionada === bloco.uf
                        return (
                          <BlocoIsometrico
                            key={bloco.uf}
                            x={bloco.x}
                            y={bloco.y}
                            w={bloco.w}
                            h={bloco.h}
                            face={meta.face}
                            lateralEsq={meta.lateralEsq}
                            lateralDir={meta.lateralDir}
                            profundidade={hovered || selecionada ? 16 : 11}
                            ativo={selecionada}
                            hovered={hovered}
                            dimmed={Boolean(ufHover || ufSelecionada) && !hovered && !selecionada}
                            label={bloco.uf}
                            onEnter={() => hoverUf(bloco.uf)}
                            onLeave={() => hoverUf(null)}
                            onClick={() => onUfSelecionar(bloco.uf)}
                          />
                        )
                      })}
                    </m.g>
                  )}
                </AnimatePresence>
              </g>
            </svg>

            <AnimatePresence>
              {ufPainel && clubesPainel.length > 0 && (
                <m.div
                  key={ufPainel}
                  variants={popoverPanel}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  transition={springSnappy}
                  className="absolute inset-x-0 bottom-0 z-20 mx-auto max-h-[min(280px,42vh)] w-[min(100%,340px)] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/95 shadow-xl backdrop-blur-md sm:left-auto sm:right-0 sm:top-2 sm:bottom-auto sm:w-[280px]"
                  onMouseEnter={() => hoverUf(ufPainel)}
                  onMouseLeave={() => hoverUf(null)}
                >
                  <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-3 py-2">
                    <div>
                      <p className="text-xs font-semibold text-[rgb(var(--foreground))]">
                        {NOME_UF[ufPainel] ?? ufPainel}
                      </p>
                      <p className="text-[10px] text-[rgb(var(--foreground-muted))]">
                        {clubesPainel.length}{' '}
                        {clubesPainel.length === 1 ? 'clube' : 'clubes'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUfSelecionar(ufPainel)}
                      className="rounded-md bg-[rgb(var(--color-primary))]/15 px-2 py-1 text-[10px] font-semibold text-[rgb(var(--color-primary))]"
                    >
                      Filtrar
                    </button>
                  </div>
                  <ul className="max-h-[220px] space-y-2 overflow-y-auto p-2">
                    {clubesPainel.slice(0, 8).map((c) => (
                      <li key={c.id}>
                        <ClubeOnboardingCard
                          clube={c}
                          onSelecionar={onSelecionarClube}
                          compact
                        />
                      </li>
                    ))}
                    {clubesPainel.length > 8 && (
                      <li className="px-2 pb-1 text-center text-[10px] text-[rgb(var(--foreground-muted))]">
                        +{clubesPainel.length - 8} — clique em Filtrar para ver todos
                      </li>
                    )}
                  </ul>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {regiaoAtiva && metaAtiva && (
            <m.div
              key={`chips-${regiaoAtiva}`}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={springGentle}
              className="border-t border-[rgb(var(--border))] px-3 py-3 sm:px-5"
            >
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Estados · {metaAtiva.nome}
              </p>
              <m.ul
                className="flex flex-wrap gap-2"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                {metaAtiva.ufs.map((uf) => {
                  const total = totalPorUf.get(uf) ?? 0
                  const ativo = ufSelecionada === uf
                  const hovered = ufHover === uf
                  return (
                    <m.li key={uf} variants={staggerItem}>
                      <button
                        type="button"
                        onMouseEnter={() => hoverUf(uf)}
                        onMouseLeave={() => hoverUf(null)}
                        onFocus={() => hoverUf(uf)}
                        onBlur={() => hoverUf(null)}
                        onClick={() => onUfSelecionar(uf)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          ativo || hovered
                            ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary))]'
                            : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--color-primary))]/50'
                        }`}
                      >
                        {uf}
                        <span className="ml-1 opacity-70">({total})</span>
                      </button>
                    </m.li>
                  )
                })}
              </m.ul>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
