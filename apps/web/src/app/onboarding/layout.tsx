import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bem-vindo' }

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="app-shell-bg min-h-screen">
      <main className="app-container relative flex min-h-screen flex-col py-8">
        {children}
      </main>
    </div>
  )
}
