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
    // Injeta a cor do tenant como CSS custom property no :root
    document.documentElement.style.setProperty('--color-primary', cor)
    // Gera variações de luminosidade para hover/active states
    document.documentElement.style.setProperty('--color-primary-raw', hexToRgb(cor))
  }, [cor])

  return (
    <TenantThemeContext.Provider value={tenant ?? { corPrimaria: cor, nome: '' }}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
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

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}
