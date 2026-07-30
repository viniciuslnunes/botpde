'use client'

import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { MotionRevealOnce } from '@/components/motion/motion-reveal-once'
import { collapsePanel, springSnappy } from '@/lib/motion-presets'

export interface AdminExpansionPanelProps {
  title: string
  description?: string
  /** Aberto na montagem — default `true`. */
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * Seção recolhível do admin (insights, blocos auxiliares). Título + chevron;
 * o conteúdo usa o mesmo grid de `InsightSection` quando aberto.
 */
export function AdminExpansionPanel({
  title,
  description,
  defaultOpen = true,
  children,
}: AdminExpansionPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const seenIds = useRef<Set<string>>(new Set())

  return (
    <MotionRevealOnce id={title} index={0} seenIds={seenIds}>
      <section className="space-y-3" aria-label={title}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-start gap-3 rounded-xl text-left transition-colors hover:bg-[rgb(var(--background-subtle)_/_0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary)_/_0.35)]"
        >
          <div className="min-w-0 flex-1 py-0.5">
            <h2 className="font-semibold text-[rgb(var(--foreground))]">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{description}</p>
            ) : null}
          </div>
          <ChevronDown
            className={[
              'mt-1 h-5 w-5 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform',
              open ? 'rotate-180' : '',
            ].join(' ')}
            aria-hidden
          />
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <m.div
              key="panel"
              variants={collapsePanel}
              initial="hidden"
              animate="show"
              exit="exit"
              transition={springSnappy}
              className="overflow-hidden"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
            </m.div>
          ) : null}
        </AnimatePresence>
      </section>
    </MotionRevealOnce>
  )
}
