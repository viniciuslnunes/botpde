'use client'

import { m } from 'motion/react'
import { fadeUp, springGentle } from '@/lib/motion-presets'

interface MotionRevealProps {
  children: React.ReactNode
  /** Índice para stagger leve na lista do feed. */
  index?: number
  className?: string
}

/** Revela filhos com fade+slide — usado em listas server-rendered. */
export function MotionReveal({ children, index = 0, className }: MotionRevealProps) {
  return (
    <m.div
      className={className}
      initial="hidden"
      animate="show"
      variants={fadeUp}
      transition={{ ...springGentle, delay: Math.min(index * 0.04, 0.28) }}
    >
      {children}
    </m.div>
  )
}
