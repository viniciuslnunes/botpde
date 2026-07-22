'use client'

import { useId } from 'react'
import { m } from 'motion/react'
import { springGentle } from '@/lib/motion-presets'

export interface SparklineProps {
  data: number[]
  height?: number
  width?: number
  className?: string
}

/** Linha de tendência compacta (SVG puro) — linha com `pathLength` animado + área com gradiente. */
export function Sparkline({ data, height = 40, width = 160, className }: SparklineProps) {
  const gradId = useId()
  if (data.length < 2) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pad = 2
  const stepX = (width - pad * 2) / (data.length - 1)
  const pontos = data.map((valor, i) => ({
    x: pad + i * stepX,
    y: pad + (1 - (valor - min) / range) * (height - pad * 2),
  }))
  const linha = pontos
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ')
  const area = `${linha} L${pontos[pontos.length - 1].x.toFixed(2)},${height} L${pontos[0].x.toFixed(2)},${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Evolução em ${data.length} pontos, de ${data[0]} a ${data[data.length - 1]}`}
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-primary))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="rgb(var(--color-primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <m.path
        d={area}
        fill={`url(#${gradId})`}
        stroke="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...springGentle, delay: 0.15 }}
      />
      <m.path
        d={linha}
        fill="none"
        stroke="rgb(var(--color-primary))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={springGentle}
      />
    </svg>
  )
}
