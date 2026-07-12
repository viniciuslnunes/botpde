'use client'

import { MotionReveal } from '@/components/motion/motion-reveal'

export function CarteirinhaReveal({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  return <MotionReveal index={index}>{children}</MotionReveal>
}
