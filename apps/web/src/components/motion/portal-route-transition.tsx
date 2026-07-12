'use client'

import { usePathname } from 'next/navigation'
import { MotionRouteTransition } from '@/components/motion/motion-route-transition'

/** Primeiro segmento após `/portal/` — evita re-animar em cada sub-rota do mesmo módulo. */
export function portalModuleKey(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'portal' && parts[1]) return parts[1]
  return pathname
}

/** Transição entre módulos do portal (comunidade, loja, eventos…). */
export function PortalRouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <MotionRouteTransition routeKey={portalModuleKey(pathname)}>{children}</MotionRouteTransition>
}
