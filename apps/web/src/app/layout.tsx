import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@torcida/ui'
/** Módulo direto — barrel `@torcida/ui` duplica o Context e quebra useDialog no SSR. */
import { DialogProvider } from '@torcida/ui/services/dialog'
import { ClientToastProvider } from '@/components/providers/client-toast-provider'
import { UnsavedChangesProvider } from '@/lib/unsaved-changes'
import { LinkStatusBarSuppressor } from '@/components/link-status-bar-suppressor'
import { ThemeInitScript } from '@/components/theme-init-script'

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
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeInitScript />
        <ThemeProvider>
          <DialogProvider>
            <UnsavedChangesProvider>
              <LinkStatusBarSuppressor />
              {children}
              <ClientToastProvider />
            </UnsavedChangesProvider>
          </DialogProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
