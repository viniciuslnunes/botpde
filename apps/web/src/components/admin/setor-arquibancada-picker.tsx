'use client'

import { useId } from 'react'
import { m } from 'motion/react'
import {
  SETORES_ARQUIBANCADA,
  SETOR_ARQUIBANCADA_LABEL,
  setorAceitaGeral,
} from '@torcida/types'
import type { SetorArquibancadaCardeal } from '@/lib/setor-arquibancada'

type Props = {
  cardeal: SetorArquibancadaCardeal | null
  geral: boolean
  onCardeal: (cardeal: SetorArquibancadaCardeal) => void
  disabled?: boolean
  className?: string
}

const PATHS: Record<SetorArquibancadaCardeal, string> = {
  // Cabeceiras incluem as curvas do bowl — o canto não é opção à parte.
  NORTE:
    'M52 22h176c22 0 40 18 40 40v42H212V78c0-8-6-14-14-14H82c-8 0-14 6-14 14v26H12V62c0-22 18-40 40-40z',
  SUL: 'M12 236h56v26c0 8 6 14 14 14h116c8 0 14-6 14-14v-26h56v42c0 22-18 40-40 40H52c-22 0-40-18-40-40v-42z',
  OESTE: 'M12 104h56v132H12z',
  LESTE: 'M212 104h56v132h-56z',
}

function corSetor(opts: { selecionado: boolean; geral: boolean }): string {
  if (opts.selecionado && opts.geral) return 'rgb(var(--color-primary) / 0.92)'
  if (opts.selecionado) return 'rgb(var(--color-primary) / 0.78)'
  return 'rgb(var(--foreground) / 0.10)'
}

/**
 * SVG esquemático (eixo Norte–Sul, gols nas cabeceiras). Cantos visíveis,
 * não clicáveis à parte — entram no Setor Norte/Sul.
 */
export function SetorArquibancadaPicker({
  cardeal,
  geral,
  onCardeal,
  disabled = false,
  className = '',
}: Props) {
  const gid = useId()
  const pitchId = `${gid}-pitch`

  return (
    <div className={className}>
      <svg
        viewBox="0 0 280 340"
        role="radiogroup"
        aria-label="Setor na arquibancada"
        className="mx-auto block w-full max-w-[320px] select-none"
      >
        <defs>
          <pattern id={`${gid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeOpacity="0.35" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Bowl */}
        <rect
          x="8"
          y="8"
          width="264"
          height="324"
          rx="52"
          fill="rgb(var(--foreground) / 0.06)"
          stroke="rgb(var(--border))"
          strokeWidth="1.5"
        />

        {SETORES_ARQUIBANCADA.map((id) => {
          const selecionado = cardeal === id
          const hatch = selecionado && geral && setorAceitaGeral(id)
          return (
            <g key={id}>
              <m.path
                d={PATHS[id]}
                role="radio"
                aria-label={SETOR_ARQUIBANCADA_LABEL[id]}
                aria-checked={selecionado}
                tabIndex={disabled ? -1 : 0}
                fill={corSetor({ selecionado, geral: hatch })}
                stroke={selecionado ? 'rgb(var(--color-primary))' : 'rgb(var(--border))'}
                strokeWidth={selecionado ? 2 : 1}
                className={disabled ? 'cursor-default' : 'cursor-pointer outline-none'}
                onClick={() => {
                  if (!disabled) onCardeal(id)
                }}
                onKeyDown={(e) => {
                  if (disabled) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onCardeal(id)
                  }
                }}
              />
              {hatch ? (
                <path d={PATHS[id]} fill={`url(#${gid}-hatch)`} pointerEvents="none" />
              ) : null}
            </g>
          )
        })}

        {/* Gramado — eixo Norte–Sul, gols nas cabeceiras */}
        <g id={pitchId} pointerEvents="none">
          <rect x="80" y="104" width="120" height="132" rx="3" fill="rgb(22 101 52 / 0.85)" />
          <rect x="80" y="104" width="120" height="132" rx="3" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="1.2" />
          <line x1="80" y1="170" x2="200" y2="170" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
          <circle cx="140" cy="170" r="16" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
          <rect x="108" y="104" width="64" height="22" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
          <rect x="108" y="214" width="64" height="22" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
          <rect x="128" y="100" width="24" height="4" rx="1" fill="white" fillOpacity="0.7" />
          <rect x="128" y="236" width="24" height="4" rx="1" fill="white" fillOpacity="0.7" />
        </g>

        <text x="140" y="48" textAnchor="middle" className="fill-[rgb(var(--foreground))]" fontSize="11" fontWeight="700">
          Setor Norte
        </text>
        <text x="140" y="304" textAnchor="middle" className="fill-[rgb(var(--foreground))]" fontSize="11" fontWeight="700">
          Setor Sul
        </text>
        <text x="40" y="174" textAnchor="middle" className="fill-[rgb(var(--foreground))]" fontSize="11" fontWeight="700" transform="rotate(-90 40 174)">
          Setor Oeste
        </text>
        <text x="240" y="174" textAnchor="middle" className="fill-[rgb(var(--foreground))]" fontSize="11" fontWeight="700" transform="rotate(90 240 174)">
          Setor Leste
        </text>
      </svg>
    </div>
  )
}
