'use client'

import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'

const springDefault = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 30,
}

/**
 * Shell Motion para rotas client-heavy (comunidade).
 * LazyMotion carrega só animações DOM; MotionConfig respeita prefers-reduced-motion.
 */
export function MotionShell({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={springDefault}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
