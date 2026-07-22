'use client'

import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { staggerContainer } from '@/lib/motion-presets'

const COLS_CLASS: Record<2 | 3 | 4, string> = {
  2: 'grid gap-4 sm:grid-cols-2',
  3: 'grid gap-4 sm:grid-cols-3',
  4: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4',
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
