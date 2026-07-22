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
        <div>
          <h2 className="font-semibold text-[rgb(var(--foreground))]">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{description}</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      </section>
    </MotionRevealOnce>
  )
}
