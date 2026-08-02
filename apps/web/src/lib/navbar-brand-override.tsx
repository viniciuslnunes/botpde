'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

/** Marca exibida no slot esquerdo da navbar (nome/escudo/cor). */
export interface NavbarBrand {
  nome: string
  corPrimaria: string
  logoUrl: string | null
}

interface NavbarBrandOverrideContextValue {
  override: NavbarBrand | null
  setOverride: (brand: NavbarBrand | null) => void
  /**
   * Escopo da Comunidade resolvido pelo chrome (`nacional`/`torcida`/`unidade`).
   * `null` fora desse chrome — a navbar cai no fallback da URL.
   */
  escopoAtivo: EscopoComunidade | null
  setEscopoAtivo: (escopo: EscopoComunidade | null) => void
}

const NavbarBrandOverrideContext = createContext<NavbarBrandOverrideContextValue | null>(null)

/**
 * Provider cosmético: permite que uma rota (ex.: visão de canal) troque
 * temporariamente nome/escudo/cor exibidos no slot esquerdo da `PortalNavbar`,
 * sem tocar sessão, tenant ativo real ou permissões. Envolve `PortalNavbar` +
 * `main` em `portal/layout.tsx`.
 */
export function NavbarBrandOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<NavbarBrand | null>(null)
  const [escopoAtivo, setEscopoAtivoState] = useState<EscopoComunidade | null>(null)
  const setOverride = useCallback((brand: NavbarBrand | null) => setOverrideState(brand), [])
  const setEscopoAtivo = useCallback(
    (escopo: EscopoComunidade | null) => setEscopoAtivoState(escopo),
    [],
  )

  return (
    <NavbarBrandOverrideContext.Provider
      value={{ override, setOverride, escopoAtivo, setEscopoAtivo }}
    >
      {children}
    </NavbarBrandOverrideContext.Provider>
  )
}

export function useNavbarBrandOverride(): NavbarBrandOverrideContextValue {
  const ctx = useContext(NavbarBrandOverrideContext)
  if (!ctx) {
    throw new Error('useNavbarBrandOverride deve ser usado dentro de NavbarBrandOverrideProvider')
  }
  return ctx
}
