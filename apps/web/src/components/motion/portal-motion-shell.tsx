'use client'

import { MotionShell } from '@/components/motion/motion-shell'
import { PortalRouteTransition } from '@/components/motion/portal-route-transition'

/** MotionShell + transição por módulo — montar em `portal/layout.tsx`. */
export function PortalMotionShell({ children }: { children: React.ReactNode }) {
  return (
    <MotionShell>
      <PortalRouteTransition>{children}</PortalRouteTransition>
    </MotionShell>
  )
}
