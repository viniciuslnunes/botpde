'use client'

import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { staggerContainer } from '@/lib/motion-presets'

/** Track base `minmax(0,1fr)` + filhos `min-w-0`: StatCard com Sparkline larga
 *  não define o min-content da coluna no mobile (mesmo padrão do InsightSection). */
const COLS_CLASS: Record<2 | 3 | 4, string> = {
  2: 'grid grid-cols-[minmax(0,1fr)] gap-4 [&>*]:min-w-0 sm:grid-cols-2',
  3: 'grid grid-cols-[minmax(0,1fr)] gap-4 [&>*]:min-w-0 sm:grid-cols-3',
  4: 'grid grid-cols-[minmax(0,1fr)] gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-4',
}

export interface KpiGridProps {
  children: ReactNode
  cols?: 2 | 3 | 4
  /** Substitui as classes de grid padrão quando o layout precisa fugir dos presets. */
  className?: string
}

/** Grid responsivo de `StatCard`s com stagger de entrada. */
export function KpiGrid({ children, cols = 4, className }: KpiGridProps) {
  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={className ?? COLS_CLASS[cols]}
    >
      {children}
    </m.div>
  )
}
