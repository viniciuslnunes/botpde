'use client'

import { usePathname } from 'next/navigation'
import { MotionRouteTransition } from '@/components/motion/motion-route-transition'

/** Chave por seção, com sub-rota no Bar (PDV/estoque/…) para não reusar o
 *  mesmo nó Motion entre telas distintas do módulo. */
function adminRouteKey(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'admin' || !parts[1]) return pathname
  if (parts[1] === 'bar' && parts[2]) return `bar/${parts[2]}`
  return parts[1]
}

/** Transição suave entre seções do admin (loja, membros, comunidade…). */
export function AdminRouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const immersivePdv = pathname === '/admin/bar/pdv'
  return (
    <MotionRouteTransition
      routeKey={adminRouteKey(pathname)}
      className={immersivePdv ? 'flex h-full min-h-0 flex-col' : undefined}
    >
      {children}
    </MotionRouteTransition>
  )
}
