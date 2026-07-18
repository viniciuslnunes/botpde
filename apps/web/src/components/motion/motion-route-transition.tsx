'use client'

import { AnimatePresence, m } from 'motion/react'
import { routePage, springGentle } from '@/lib/motion-presets'

interface MotionRouteTransitionProps {
  children: React.ReactNode
  /** Chave que dispara exit/enter (pathname ou módulo). */
  routeKey: string
  className?: string
}

/** Transição fade/slide entre rotas ou painéis — base reutilizável.
 *
 * `mode="sync"` (default): enter/exit em paralelo. Evita congelar o conteúdo
 * quando o exit não completa (footgun conhecido com `mode="wait"` no App Router).
 * Página entrante fica clicável por padrão; só o *exit* desliga hits (ver
 * `routePage`) para camada em opacity:0 não capturar o sidebar.
 */
export function MotionRouteTransition({
  children,
  routeKey,
  className,
}: MotionRouteTransitionProps) {
  return (
    <AnimatePresence initial={false}>
      <m.div
        key={routeKey}
        variants={routePage}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={springGentle}
        className={['min-h-0', className].filter(Boolean).join(' ')}
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
