'use client'

import { useState } from 'react'
import { m, AnimatePresence } from 'motion/react'

/** Envolve um card recém-inserido (prepend otimista) com um anel que se
 * dissipa sozinho em ~1.6s — evita depender de re-render externo pra sumir. */
export function OptimisticHighlight({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  const [pulsing, setPulsing] = useState(active)

  // Rearma no render quando `active` sobe (o anel também some sozinho ao fim
  // da animação, daí o estado não ser só derivado de `active`).
  const [activeAnterior, setActiveAnterior] = useState(active)
  if (active !== activeAnterior) {
    setActiveAnterior(active)
    if (active) setPulsing(true)
  }

  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {pulsing && (
          <m.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-[rgb(var(--color-primary)_/_0.5)]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
            onAnimationComplete={() => setPulsing(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
