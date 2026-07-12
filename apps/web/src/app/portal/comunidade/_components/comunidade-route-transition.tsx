'use client'

import { usePathname } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { routePage, springGentle } from '@/lib/motion-presets'

/** Transição suave entre subpáginas da comunidade (feed, perfil, vídeos…). */
export function ComunidadeRouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait">
      <m.div
        key={pathname}
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
