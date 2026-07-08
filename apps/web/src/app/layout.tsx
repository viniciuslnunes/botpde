import type { Metadata } from 'next'
import './globals.css'
import dynamic from 'next/dynamic'
import { ThemeProvider } from '@torcida/ui'
import { DialogProvider } from '@torcida/ui'

const ToastProvider = dynamic(
  () => import('@torcida/ui').then((mod) => mod.ToastProvider),
  { ssr: false },
)

export const metadata: Metadata = {
  title: {
    template: '%s | Torcida',
    default: 'Torcida — Gestão de Torcidas Organizadas',
  },
  description: 'Plataforma de gestão para torcidas organizadas',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <DialogProvider>
            {children}
            <ToastProvider />
          </DialogProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
