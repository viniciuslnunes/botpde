'use client'

import { m } from 'motion/react'
import { springGentle } from '@/lib/motion-presets'

const CORES_PADRAO = [
  'rgb(var(--color-primary))',
  'rgb(var(--color-info))',
  'rgb(var(--color-success))',
  'rgb(var(--color-warning))',
  'rgb(var(--color-danger))',
  'rgb(var(--color-secondary))',
]

export interface DonutChartItem {
  rotulo: string
  valor: number
  /** Valor formatado para a legenda (ex.: moeda). Se omitido, exibe `valor`. */
  valorLabel?: string
  /** Qualquer cor CSS — padrão: paleta temável cíclica. */
  cor?: string
}

export interface DonutChartProps {
  data: DonutChartItem[]
  /** Texto no centro do anel (ex.: total). */
  centro?: string
}

const RAIO = 40

/** Donut SVG puro — arcos animados via `pathLength` + legenda com valores. */
export function DonutChart({ data, centro }: DonutChartProps) {
  const itens = data.filter((d) => d.valor > 0)
  const total = itens.reduce((acc, d) => acc + d.valor, 0)

  if (total <= 0) {
    return <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem dados no período.</p>
  }

  const segmentos = itens.map((item, i) => {
    const frac = item.valor / total
    const inicio = itens.slice(0, i).reduce((acc, ant) => acc + ant.valor / total, 0)
    return { ...item, frac, inicio, corFinal: item.cor ?? CORES_PADRAO[i % CORES_PADRAO.length] }
  })

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label={`Distribuição em ${segmentos.length} ${segmentos.length === 1 ? 'categoria' : 'categorias'}`}
          className="h-full w-full"
        >
          <circle
            cx={50}
            cy={50}
            r={RAIO}
            fill="none"
            stroke="rgb(var(--border) / 0.5)"
            strokeWidth={12}
          />
          {segmentos.map((s, i) => (
            <m.circle
              key={`${s.rotulo}-${i}`}
              cx={50}
              cy={50}
              r={RAIO}
              fill="none"
              stroke={s.corFinal}
              strokeWidth={12}
              transform={`rotate(${s.inicio * 360 - 90} 50 50)`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: s.frac }}
              transition={{ ...springGentle, delay: i * 0.06 }}
            />
          ))}
        </svg>
        {centro ? (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
            <span className="text-sm font-bold tabular-nums text-[rgb(var(--foreground))]">
              {centro}
            </span>
          </div>
        ) : null}
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {segmentos.map((s, i) => (
          <li key={`${s.rotulo}-${i}`} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.corFinal }}
                aria-hidden
              />
              <span className="truncate text-[rgb(var(--foreground))]">{s.rotulo}</span>
              <span className="shrink-0 text-[rgb(var(--foreground-muted))]">
                {Math.round(s.frac * 100)}%
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-[rgb(var(--foreground))]">
              {s.valorLabel ?? s.valor}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
