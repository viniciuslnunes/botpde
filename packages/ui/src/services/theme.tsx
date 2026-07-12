'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { createContext, useContext, useEffect } from 'react'

interface TenantTheme {
  corPrimaria: string
  nome: string
  logoUrl?: string | null
}

const TenantThemeContext = createContext<TenantTheme>({
  corPrimaria: '#7c3aed',
  nome: '',
  logoUrl: null,
})

interface ThemeProviderProps {
  children: React.ReactNode
  tenant?: TenantTheme
}

export function ThemeProvider({ children, tenant }: ThemeProviderProps) {
  const cor = tenant?.corPrimaria ?? '#7c3aed'

  useEffect(() => {
    // --color-primary é consumida como `rgb(var(--color-primary))` em todo o
    // app (ver globals.css) — precisa ser canais RGB, não o hex puro.
    const rgb = hexToRgb(cor)
    document.documentElement.style.setProperty('--color-primary', rgb)
    document.documentElement.style.setProperty('--primary', rgb)
    document.documentElement.style.setProperty('--color-primary-raw', cor)
  }, [cor])

  return (
    <TenantThemeContext.Provider value={tenant ?? { corPrimaria: cor, nome: '' }}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        storageKey="torcida-theme"
        disableTransitionOnChange
      >
        {children}
      </NextThemesProvider>
    </TenantThemeContext.Provider>
  )
}

export function useTenantTheme() {
  return useContext(TenantThemeContext)
}

export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}
