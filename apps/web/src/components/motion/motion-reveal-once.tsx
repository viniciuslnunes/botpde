'use client'

import { useEffect } from 'react'
import { MotionReveal } from '@/components/motion/motion-reveal'

/** Como MotionReveal, mas só anima a entrada na 1ª vez que o id aparece —
 * evita replay quando a virtualização (react-virtual) remonta itens já vistos. */
export function MotionRevealOnce({
  id,
  index,
  seenIds,
  className,
  children,
}: {
  id: string
  index: number
  seenIds: React.MutableRefObject<Set<string>>
  className?: string
  children: React.ReactNode
}) {
  const alreadySeen = seenIds.current.has(id)

  useEffect(() => {
    seenIds.current.add(id)
  }, [id, seenIds])

  if (alreadySeen) {
    return <div className={className}>{children}</div>
  }

  return (
    <MotionReveal index={index} className={className}>
      {children}
    </MotionReveal>
  )
}
