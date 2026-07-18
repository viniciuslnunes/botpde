'use client'

import { AnimatePresence, m } from 'motion/react'
import { routePage, springGentle } from '@/lib/motion-presets'

interface MotionRouteTransitionProps {
  children: React.ReactNode
  /** Chave que dispara exit/enter (pathname ou módulo). */
  routeKey: string
}

/** Transição fade/slide entre rotas ou painéis — base reutilizável.
 *
 * `mode="sync"` (default): enter/exit em paralelo. Evita congelar o conteúdo
 * quando o exit não completa (footgun conhecido com `mode="wait"` no App Router).
 */
export function MotionRouteTransition({ children, routeKey }: MotionRouteTransitionProps) {
  return (
    <AnimatePresence>
      <m.div
        key={routeKey}
        variants={routePage}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={springGentle}
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
