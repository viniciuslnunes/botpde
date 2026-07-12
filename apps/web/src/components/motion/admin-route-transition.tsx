'use client'

import { usePathname } from 'next/navigation'
import { MotionRouteTransition } from '@/components/motion/motion-route-transition'

function adminRouteKey(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'admin' && parts[1]) return parts[1]
  return pathname
}

/** Transição suave entre seções do admin (loja, membros, comunidade…). */
export function AdminRouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <MotionRouteTransition routeKey={adminRouteKey(pathname)}>{children}</MotionRouteTransition>
}
