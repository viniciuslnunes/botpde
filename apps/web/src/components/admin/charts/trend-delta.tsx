'use client'

import { m } from 'motion/react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { calcularDelta } from '@/lib/admin-insights'
import { fadeScale, springGentle } from '@/lib/motion-presets'

export interface TrendDeltaProps {
  atual: number
  anterior: number
  /** `true` quando subir é ruim (ex.: despesas, inadimplência). */
  invertido?: boolean
  /** Formata o delta percentual — padrão: `+12%` / `-3,4%`. */
  format?: (delta: number) => string
}

function formatarDeltaPct(delta: number): string {
  const abs = Math.abs(delta)
  const casas = abs >= 10 ? 0 : 1
  const valor = abs.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
  if (delta > 0) return `+${valor}%`
  if (delta < 0) return `-${valor}%`
  return `${valor}%`
}

/** Variação % vs período anterior, com seta e cor de sucesso/perigo. */
export function TrendDelta({ atual, anterior, invertido = false, format }: TrendDeltaProps) {
  const delta = calcularDelta(atual, anterior)

  if (delta === null) {
    return (
      <span
        className="text-xs font-medium text-[rgb(var(--foreground-muted))]"
        aria-label="Sem base de comparação no período anterior"
      >
        {atual > 0 ? 'novo' : '—'}
      </span>
    )
  }

  const subiu = delta > 0
  const neutro = delta === 0
  const positivo = invertido ? delta < 0 : delta > 0
  const cor = neutro
    ? 'text-[rgb(var(--foreground-muted))]'
    : positivo
      ? 'text-[rgb(var(--color-success-fg))]'
      : 'text-[rgb(var(--color-danger-fg))]'
  const rotulo = format ? format(delta) : formatarDeltaPct(delta)

  return (
    <m.span
      initial="hidden"
      animate="show"
      variants={fadeScale}
      transition={springGentle}
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${cor}`}
      aria-label={`Variação de ${rotulo} em relação ao período anterior`}
    >
      {neutro ? null : subiu ? (
        <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <TrendingDown className="h-3 w-3 shrink-0" aria-hidden />
      )}
      {rotulo}
    </m.span>
  )
}
