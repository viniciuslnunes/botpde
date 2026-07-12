import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@torcida/ui'
import { DialogProvider } from '@torcida/ui'
import { ClientToastProvider } from '@/components/providers/client-toast-provider'
import { PrismaQueryLogger } from '@/components/dev/prisma-query-logger'

export const metadata: Metadata = {
  title: {
    template: '%s | Torcida',
    default: 'Torcida — Gestão de Torcidas Organizadas',
  },
  description: 'Plataforma de gestão para torcidas organizadas',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
            <PrismaQueryLogger />
            {children}
            <ClientToastProvider />
          </DialogProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
