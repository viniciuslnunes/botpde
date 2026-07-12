'use client'

import { MotionReveal } from '@/components/motion/motion-reveal'

/** Coluna de informações do produto com entrada suave. */
export function ProdutoDetailCol({ children }: { children: React.ReactNode }) {
  return <MotionReveal className="space-y-6">{children}</MotionReveal>
}
