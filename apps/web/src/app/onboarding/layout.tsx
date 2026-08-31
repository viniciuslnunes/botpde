import type { Metadata } from 'next'
import { MotionShell } from '@/components/motion/motion-shell'

export const metadata: Metadata = { title: 'Bem-vindo' }

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MotionShell>
      <div className="app-shell-bg min-h-dvh overflow-x-hidden">
        <main className="app-container relative flex min-h-dvh min-w-0 flex-col py-8">
          {children}
        </main>
      </div>
    </MotionShell>
  )
}
