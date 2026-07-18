'use client'

import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import {
  ACTION_CSS_VARS,
  ACTION_TOKEN_KEYS,
  DEFAULT_ACTIONS,
  DEFAULT_SURFACE_DARK,
  DEFAULT_SURFACE_LIGHT,
  DEFAULT_TENANT_DESIGN,
  contrasteTextoSobre,
  corMarcaLegivel,
  hexToCssRgb,
  resolveTenantDesign,
  SURFACE_CSS_VARS,
  SURFACE_TOKEN_KEYS,
} from '@torcida/types'

/** Espelha TenantDesign de @torcida/types (JS) para tipagem no pacote UI. */
export type TenantDesign = {
  version: 1
  brand: { primary: string; secondary: string | null }
  grid: {
    enabled: boolean
    sizePx: number
    lineOpacity: number
    lineColor: string | null
    baseColor: string | null
  }
  actions: {
    success: string
    danger: string
    warning: string
    info: string
  }
  light: Partial<Record<(typeof SURFACE_TOKEN_KEYS)[number], string>>
  dark: Partial<Record<(typeof SURFACE_TOKEN_KEYS)[number], string>>
}

interface TenantTheme {
  corPrimaria: string
  nome: string
  logoUrl?: string | null
  design?: TenantDesign | null
}

const TenantThemeContext = createContext<TenantTheme>({
  corPrimaria: '#7c3aed',
  nome: '',
  logoUrl: null,
  design: null,
})

interface ThemeProviderProps {
  children: ReactNode
  tenant?: TenantTheme
}

/**
 * Aplica tokens de design no documentElement.
 * Superfícies usam overrides do modo ativo; grade e marca são globais.
 */
export function applyTenantDesign(
  design: TenantDesign,
  mode: 'light' | 'dark' = 'dark',
  root: HTMLElement = document.documentElement,
): void {
  const primary = design.brand.primary
  const rgb = hexToCssRgb(primary)
  root.style.setProperty('--color-primary', rgb)
  root.style.setProperty('--primary', rgb)
  root.style.setProperty('--color-primary-raw', primary)

  // Sempre define secundária: se o tenant não escolheu, deriva contraste da primária
  // para botões/badges auxiliares não ficarem “mortos”.
  const secondaryHex =
    design.brand.secondary ??
    (contrasteTextoSobre(primary) === 'light' ? '#f4f4f5' : '#27272a')
  root.style.setProperty('--color-secondary', hexToCssRgb(secondaryHex))
  root.style.setProperty('--secondary', hexToCssRgb(secondaryHex))

  const defaults = mode === 'dark' ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT
  const overrides = mode === 'dark' ? design.dark : design.light
  const surfaceHex =
    (overrides as Record<string, string | undefined>).surface ??
    (defaults as Record<string, string>).surface

  root.style.setProperty(
    '--color-primary-fg',
    hexToCssRgb(corMarcaLegivel(primary, surfaceHex)),
  )
  root.style.setProperty(
    '--color-secondary-fg',
    hexToCssRgb(corMarcaLegivel(secondaryHex, surfaceHex)),
  )

  const actions = { ...DEFAULT_ACTIONS, ...design.actions }
  for (const key of ACTION_TOKEN_KEYS) {
    const cssVar = ACTION_CSS_VARS[key as keyof typeof ACTION_CSS_VARS]
    const hex = actions[key as keyof typeof actions]
    root.style.setProperty(cssVar, hexToCssRgb(hex))
    root.style.setProperty(
      `${cssVar}-fg`,
      hexToCssRgb(corMarcaLegivel(hex, surfaceHex)),
    )
  }

  for (const key of SURFACE_TOKEN_KEYS) {
    const cssVar = SURFACE_CSS_VARS[key as keyof typeof SURFACE_CSS_VARS]
    const hex =
      (overrides as Record<string, string | undefined>)[key] ??
      (defaults as Record<string, string>)[key]
    root.style.setProperty(cssVar, hexToCssRgb(hex))
  }

  root.style.setProperty('--grid-enabled', design.grid.enabled ? '1' : '0')
  root.style.setProperty('--grid-size', `${design.grid.sizePx}px`)
  root.style.setProperty('--grid-opacity', String(design.grid.lineOpacity))
  root.dataset.grid = design.grid.enabled ? 'on' : 'off'

  if (design.grid.baseColor) {
    root.style.setProperty('--grid-base', hexToCssRgb(design.grid.baseColor))
  } else {
    const subtle =
      (overrides as Record<string, string | undefined>).backgroundSubtle ??
      (defaults as Record<string, string>).backgroundSubtle
    root.style.setProperty('--grid-base', hexToCssRgb(subtle))
  }

  if (design.grid.lineColor) {
    root.style.setProperty('--grid-line', hexToCssRgb(design.grid.lineColor))
  } else {
    const fg =
      (overrides as Record<string, string | undefined>).foreground ??
      (defaults as Record<string, string>).foreground
    root.style.setProperty('--grid-line', hexToCssRgb(fg))
  }
}

/** Gera bloco CSS crítico (SSR) para evitar flash sem JS. */
export function tenantDesignCriticalCss(
  design: TenantDesign,
  mode: 'light' | 'dark' = 'dark',
): string {
  const primary = design.brand.primary
  const rgb = hexToCssRgb(primary)
  const defaults = mode === 'dark' ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT
  const overrides = mode === 'dark' ? design.dark : design.light

  const lines: string[] = [
    `--color-primary:${rgb}`,
    `--primary:${rgb}`,
    `--color-primary-raw:${primary}`,
    `--grid-enabled:${design.grid.enabled ? '1' : '0'}`,
    `--grid-size:${design.grid.sizePx}px`,
    `--grid-opacity:${design.grid.lineOpacity}`,
  ]

  const secondaryHex =
    design.brand.secondary ??
    (contrasteTextoSobre(primary) === 'light' ? '#f4f4f5' : '#27272a')
  lines.push(`--color-secondary:${hexToCssRgb(secondaryHex)}`)
  lines.push(`--secondary:${hexToCssRgb(secondaryHex)}`)

  const surfaceHex =
    (overrides as Record<string, string | undefined>).surface ??
    (defaults as Record<string, string>).surface
  lines.push(`--color-primary-fg:${hexToCssRgb(corMarcaLegivel(primary, surfaceHex))}`)
  lines.push(
    `--color-secondary-fg:${hexToCssRgb(corMarcaLegivel(secondaryHex, surfaceHex))}`,
  )

  const actions = { ...DEFAULT_ACTIONS, ...design.actions }
  for (const key of ACTION_TOKEN_KEYS) {
    const cssVar = ACTION_CSS_VARS[key as keyof typeof ACTION_CSS_VARS]
    const hex = actions[key as keyof typeof actions]
    lines.push(`${cssVar}:${hexToCssRgb(hex)}`)
    lines.push(`${cssVar}-fg:${hexToCssRgb(corMarcaLegivel(hex, surfaceHex))}`)
  }

  for (const key of SURFACE_TOKEN_KEYS) {
    const hex =
      (overrides as Record<string, string | undefined>)[key] ??
      (defaults as Record<string, string>)[key]
    lines.push(
      `${SURFACE_CSS_VARS[key as keyof typeof SURFACE_CSS_VARS]}:${hexToCssRgb(hex)}`,
    )
  }

  const base =
    design.grid.baseColor ??
    (overrides as Record<string, string | undefined>).backgroundSubtle ??
    (defaults as Record<string, string>).backgroundSubtle
  const line =
    design.grid.lineColor ??
    (overrides as Record<string, string | undefined>).foreground ??
    (defaults as Record<string, string>).foreground
  lines.push(`--grid-base:${hexToCssRgb(base)}`)
  lines.push(`--grid-line:${hexToCssRgb(line)}`)

  return `:root{${lines.join(';')}}`
}

function DesignApplier({ design }: { design: TenantDesign }) {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const mode = resolvedTheme === 'light' ? 'light' : 'dark'
    applyTenantDesign(design, mode)
  }, [design, resolvedTheme])

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      const mode = root.classList.contains('dark') ? 'dark' : 'light'
      applyTenantDesign(design, mode)
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [design])

  return null
}

export function ThemeProvider({ children, tenant }: ThemeProviderProps) {
  const cor = tenant?.corPrimaria ?? '#7c3aed'
  const design = useMemo((): TenantDesign => {
    const resolved = resolveTenantDesign(tenant?.design ?? null, cor) as TenantDesign
    return resolved
  }, [tenant?.design, cor])

  const ctxValue = useMemo(
    () => ({
      corPrimaria: cor,
      nome: tenant?.nome ?? '',
      logoUrl: tenant?.logoUrl ?? null,
      design,
    }),
    [cor, tenant?.nome, tenant?.logoUrl, design],
  )

  return (
    <TenantThemeContext.Provider value={ctxValue}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        storageKey="torcida-theme"
        disableTransitionOnChange
      >
        {tenant ? <DesignApplier design={design} /> : null}
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

export { DEFAULT_TENANT_DESIGN, resolveTenantDesign }
export type { TenantTheme }
