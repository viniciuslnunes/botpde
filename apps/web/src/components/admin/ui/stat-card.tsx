'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { springSnappy, staggerItem } from '@/lib/motion-presets'
import { Sparkline, TrendDelta } from '@/components/admin/charts'

export type StatCardTone = 'default' | 'success' | 'warning' | 'danger'

export interface StatCardProps {
  label: string
  /** Valor já formatado na lib/página — nunca Decimal/Date. */
  value: string | number
  /** Ícone já dimensionado (h-5 w-5 no card cheio; h-4 w-4 no compacto). */
  icon?: ReactNode
  href?: string
  /** Linha auxiliar (ex.: "+3 este mês"). */
  badge?: string
  /** Cor da linha auxiliar — default `success` (contexto de crescimento). */
  badgeTone?: StatCardTone
  tone?: StatCardTone
  /** Comparativo vs período anterior — renderiza `TrendDelta`. */
  delta?: { atual: number; anterior: number; invertido?: boolean }
  sparkline?: number[]
  /** Variante compacta (linhas secundárias, resumos financeiro/patrimônio). */
  compact?: boolean
}

const TONE_VALUE: Record<StatCardTone, string> = {
  default: 'text-[rgb(var(--foreground))]',
  success: 'text-[rgb(var(--color-success-fg))]',
  warning: 'text-[rgb(var(--color-warning-fg))]',
  danger: 'text-[rgb(var(--color-danger-fg))]',
}

const TONE_ICON: Record<StatCardTone, string> = {
  default: 'text-[rgb(var(--foreground-muted))]',
  success: 'text-[rgb(var(--color-success-fg))]',
  warning: 'text-[rgb(var(--color-warning-fg))]',
  danger: 'text-[rgb(var(--color-danger-fg))]',
}

/** Card de indicador do admin — anima como filho de `KpiGrid` (staggerItem). */
export function StatCard({
  label,
  value,
  icon,
  href,
  badge,
  badgeTone = 'success',
  tone = 'default',
  delta,
  sparkline,
  compact = false,
}: StatCardProps) {
  const inner = compact ? (
    <m.div variants={staggerItem} whileTap={href ? { scale: 0.98 } : undefined} transition={springSnappy}>
      <div
        className={[
          'flex items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3',
          href ? 'transition-shadow hover:shadow-sm' : '',
        ].join(' ')}
      >
        {icon ? <span className={`shrink-0 ${TONE_ICON[tone]}`}>{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            {label}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={`truncate text-lg font-bold tabular-nums ${TONE_VALUE[tone]}`}>{value}</p>
            {delta ? (
              <TrendDelta atual={delta.atual} anterior={delta.anterior} invertido={delta.invertido} />
            ) : null}
          </div>
          {badge ? (
            <p
              className={`mt-0.5 text-[11px] font-medium ${
                badgeTone === 'default'
                  ? 'text-[rgb(var(--foreground-muted))]'
                  : TONE_VALUE[badgeTone]
              }`}
            >
              {badge}
            </p>
          ) : null}
        </div>
      </div>
    </m.div>
  ) : (
    <m.div
      variants={staggerItem}
      whileTap={href ? { scale: 0.98 } : undefined}
      transition={springSnappy}
      className="h-full"
    >
      <div
        className={[
          'flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5',
          href ? 'transition-shadow hover:shadow-sm' : '',
        ].join(' ')}
      >
        <div className="flex flex-1 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              {label}
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-2 sm:mt-2">
              <p className={`text-3xl font-bold tabular-nums sm:text-4xl ${TONE_VALUE[tone]}`}>
                {value}
              </p>
              {delta ? (
                <TrendDelta atual={delta.atual} anterior={delta.anterior} invertido={delta.invertido} />
              ) : null}
            </div>
            <div className="mt-1 min-h-5">
              {badge ? (
                <p
                  className={`flex items-center gap-1 text-xs font-medium ${
                    badgeTone === 'success'
                      ? 'text-[rgb(var(--color-success-fg))]'
                      : TONE_VALUE[badgeTone]
                  }`}
                >
                  {badgeTone === 'success' ? (
                    <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />
                  ) : null}
                  {badge}
                </p>
              ) : null}
            </div>
          </div>
          {icon ? (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]"
              aria-hidden
            >
              {icon}
            </div>
          ) : null}
        </div>
        {sparkline && sparkline.length > 1 ? (
          <div className="mt-2">
            <Sparkline data={sparkline} width={220} height={36} className="h-9 w-full" />
          </div>
        ) : null}
      </div>
    </m.div>
  )

  return href ? (
    <Link href={href} className={compact ? 'block' : 'block h-full'}>
      {inner}
    </Link>
  ) : (
    <div className={compact ? undefined : 'h-full'}>{inner}</div>
  )
}
