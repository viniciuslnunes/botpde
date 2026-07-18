'use client'

interface MotionRouteTransitionProps {
  children: React.ReactNode
  /** Mantido por compat — transição de página desligada (bloqueava inputs). */
  routeKey: string
  className?: string
}

/**
 * Wrapper de rota sem AnimatePresence.
 *
 * Histórico: animar `opacity`/`pointerEvents`/`position` no enter/exit deixava
 * formulários visíveis com caret, mas sem digitação (camada fantasma em
 * opacity:0). Digitação > motion — reativar só com teste E2E de input.
 */
export function MotionRouteTransition({
  children,
  className,
}: MotionRouteTransitionProps) {
  return <div className={['min-h-0', className].filter(Boolean).join(' ')}>{children}</div>
}
