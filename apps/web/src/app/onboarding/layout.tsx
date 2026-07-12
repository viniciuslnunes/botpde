import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bem-vindo' }

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[rgb(var(--background-subtle))]">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
