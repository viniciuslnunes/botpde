'use client'

import { useRef } from 'react'
import type { ReactNode } from 'react'
import { MotionRevealOnce } from '@/components/motion/motion-reveal-once'

export interface InsightSectionProps {
  title: string
  description?: string
  children: ReactNode
}

/** Seção de insights de um módulo — título + grid de cards/charts com reveal único. */
export function InsightSection({ title, description, children }: InsightSectionProps) {
  const seenIds = useRef<Set<string>>(new Set())

  return (
    <MotionRevealOnce id={title} index={0} seenIds={seenIds}>
      <section className="space-y-3" aria-label={title}>
        <div className="space-y-2">
          <h2 className="portal-kicker text-[rgb(var(--foreground))]">{title}</h2>
          {description ? (
            <p className="text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">{description}</p>
          ) : null}
        </div>
        {/* Track base `minmax(0,1fr)` + `min-w-0` nos filhos: coluna implícita
            `auto` faz o chart/tabela definir o track e estourar a viewport;
            `min-width: auto` no item de grid impede encolher abaixo do
            min-content. De `sm` em diante `grid-cols-N` já é
            `repeat(N, minmax(0,1fr))`. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      </section>
    </MotionRevealOnce>
  )
}
