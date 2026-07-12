'use client'

import { usePathname } from 'next/navigation'
import { MotionRouteTransition } from '@/components/motion/motion-route-transition'

/** Transição entre subpáginas da comunidade (feed, perfil, vídeos…). */
export function ComunidadeRouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <MotionRouteTransition routeKey={pathname}>{children}</MotionRouteTransition>
}
