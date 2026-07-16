'use client'

import { MotionShell } from '@/components/motion/motion-shell'

export default function VideoSalaLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionShell>
      <div className="min-h-dvh bg-black">{children}</div>
    </MotionShell>
  )
}
