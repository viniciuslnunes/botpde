'use client'

import { MotionShell } from '@/components/motion/motion-shell'

/** Motion para área super-admin (operador do SaaS). */
export function SuperAdminMotionShell({ children }: { children: React.ReactNode }) {
  return <MotionShell>{children}</MotionShell>
}
