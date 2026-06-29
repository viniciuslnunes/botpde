import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@torcida/ui'
import { ToastProvider } from '@torcida/ui'
import { DialogProvider } from '@torcida/ui'

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
