'use client'

import { MotionShell } from '@/components/motion/motion-shell'

/** Motion para área admin (fora do portal autenticado padrão). */
export function AdminMotionShell({ children }: { children: React.ReactNode }) {
  return <MotionShell>{children}</MotionShell>
}
