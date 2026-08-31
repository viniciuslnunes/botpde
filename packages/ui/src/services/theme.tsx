'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  THEME_DEFAULT,
  THEME_STORAGE_KEY,
  type ColorMode,
} from './theme-script'
import {
  ACTION_CSS_VARS,
  ACTION_TOKEN_KEYS,
  DEFAULT_ACTIONS,
  DEFAULT_TENANT_DESIGN,
  contrasteTextoSobre,
  hexToCssRgb,
  precisaAnelFill,
  resolveActionTextColors,
  resolveTenantDesign,
  resolverFillDaMarca,
  resolverSuperficies,
  SURFACE_CSS_VARS,
  SURFACE_TOKEN_KEYS,
  // Import direto do módulo, não do barrel: ThemeProvider está no root layout, e
  // '@torcida/types' (37 `export *`) arrastaria os 37 módulos para toda página.
} from '@torcida/types/design'

/** Espelha TenantDesign de @torcida/types (JS) para tipagem no pacote UI. */
export type TenantDesign = {
  version: 1
  brand: { primary: string; secondary: string | null }
  brandFg?: {
    primary: string | null
    secondary: string | null
  }
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
  actionsFg?: {
    success: string | null
    danger: string | null
    warning: string | null
    info: string | null
  }
  customPalettes?: Array<{
    id: string
    nome: string
    primary: string
    secondary: string | null
    actions: {
      success: string
      danger: string
      warning: string
      info: string
    }
    actionsFg?: {
      success?: string | null
      danger?: string | null
      warning?: string | null
      info?: string | null
    }
    swatches: string[]
    createdAt?: string
  }>
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

function setFillAndRing(
  set: (name: string, value: string) => void,
  cssVar: string,
  fillHex: string,
  surfaceHex: string,
): string {
  const fill = resolverFillDaMarca(fillHex, surfaceHex)
  set(cssVar, hexToCssRgb(fill))
  const ringNeeded = precisaAnelFill(fill, surfaceHex)
  const ring = contrasteTextoSobre(surfaceHex) === 'light' ? '#0a0a0a' : '#fafafa'
  set(`${cssVar}-ring`, hexToCssRgb(ringNeeded ? ring : fill))
  set(`${cssVar}-ring-a`, ringNeeded ? '0.45' : '0')
  return fill
}

function writeTenantDesignTokens(
  set: (name: string, value: string) => void,
  design: TenantDesign,
  mode: 'light' | 'dark',
): void {
  const primary = design.brand.primary
  set('--color-primary-raw', primary)

  const surfaces = resolverSuperficies(design, mode)
  const surfaceHex = surfaces.surface

  const secondaryHex =
    design.brand.secondary ??
    (contrasteTextoSobre(primary) === 'light' ? '#f4f4f5' : '#27272a')

  const brandFg = design.brandFg ?? { primary: null, secondary: null }
  const primaryText = resolveActionTextColors(
    primary,
    brandFg.primary,
    surfaceHex,
  )
  const secondaryText = resolveActionTextColors(
    secondaryHex,
    brandFg.secondary,
    surfaceHex,
  )

  setFillAndRing(set, '--color-primary', primary, surfaceHex)
  set('--primary', hexToCssRgb(primaryText.fill))
  setFillAndRing(set, '--color-secondary', secondaryHex, surfaceHex)
  set('--secondary', hexToCssRgb(secondaryText.fill))

  set('--color-primary-fg', hexToCssRgb(primaryText.fg))
  set('--color-primary-on', hexToCssRgb(primaryText.on))
  set('--primary-fg', hexToCssRgb(primaryText.fg))
  set('--color-secondary-fg', hexToCssRgb(secondaryText.fg))
  set('--color-secondary-on', hexToCssRgb(secondaryText.on))
  set('--secondary-fg', hexToCssRgb(secondaryText.fg))

  const actions = { ...DEFAULT_ACTIONS, ...design.actions }
  const actionsFg = design.actionsFg ?? {}
  for (const key of ACTION_TOKEN_KEYS) {
    const cssVar = ACTION_CSS_VARS[key as keyof typeof ACTION_CSS_VARS]
    const hex = actions[key as keyof typeof actions]
    const override = (actionsFg as Record<string, string | null | undefined>)[key]
    const text = resolveActionTextColors(hex, override, surfaceHex)
    setFillAndRing(set, cssVar, hex, surfaceHex)
    set(`${cssVar}-fg`, hexToCssRgb(text.fg))
    set(`${cssVar}-on`, hexToCssRgb(text.on))
  }

  for (const key of SURFACE_TOKEN_KEYS) {
    const cssVar = SURFACE_CSS_VARS[key as keyof typeof SURFACE_CSS_VARS]
    set(cssVar, hexToCssRgb(surfaces[key]))
  }

  set('--grid-enabled', design.grid.enabled ? '1' : '0')
  set('--grid-size', `${design.grid.sizePx}px`)
  set('--grid-opacity', String(design.grid.lineOpacity))

  if (design.grid.baseColor) {
    set('--grid-base', hexToCssRgb(design.grid.baseColor))
  } else {
    set('--grid-base', hexToCssRgb(surfaces.backgroundSubtle))
  }

  if (design.grid.lineColor) {
    set('--grid-line', hexToCssRgb(design.grid.lineColor))
  } else {
    set('--grid-line', hexToCssRgb(surfaces.foreground))
  }
}

function serializeTenantDesignVars(
  design: TenantDesign,
  mode: 'light' | 'dark',
): string {
  const lines: string[] = []
  writeTenantDesignTokens((name, value) => {
    lines.push(`${name}:${value}`)
  }, design, mode)
  return lines.join(';')
}

/**
 * Aplica tokens de design no documentElement.
 * Superfícies usam o modo ativo (marca preenche buracos); fills de marca
 * empurram L quando branco/preto sumiria no tema.
 */
export function applyTenantDesign(
  design: TenantDesign,
  mode: 'light' | 'dark' = 'dark',
  root: HTMLElement = document.documentElement,
): void {
  writeTenantDesignTokens(
    (name, value) => root.style.setProperty(name, value),
    design,
    mode,
  )
  root.dataset.grid = design.grid.enabled ? 'on' : 'off'
}

/**
 * CSS crítico sem JS. `:root` = tema claro; `.dark` = tema escuro.
 * O script de bloqueio no layout raiz põe `.dark`/`.light` no <html>
 * antes do paint — não despejar o escuro em `:root` (âmbar/rosa de
 * texto-no-escuro some no papel branco).
 *
 * `mode` é ignorado (assinatura antiga); os dois temas saem sempre.
 * `scope` gera regras no seletor (loja visitada) em vez de :root.
 */
export function tenantDesignCriticalCss(
  design: TenantDesign,
  _mode: 'light' | 'dark' = 'dark',
  scope?: string,
): string {
  const light = serializeTenantDesignVars(design, 'light')
  const dark = serializeTenantDesignVars(design, 'dark')
  if (scope) {
    return `${scope}{${light}}.dark ${scope},${scope}.dark{${dark}}`
  }
  return `:root{${light}}.dark{${dark}}`
}

function modeFromRoot(root: HTMLElement): ColorMode {
  return root.classList.contains('dark') ? 'dark' : 'light'
}

function DesignApplier({ design }: { design: TenantDesign }) {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => applyTenantDesign(design, modeFromRoot(root))
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [design])

  return null
}

const THEME_EVENT = 'torcida-theme'

function readStoredTheme(): ColorMode {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return THEME_DEFAULT
  }
}

function applyColorMode(mode: ColorMode): void {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(mode)
  root.style.colorScheme = mode
}

function disableTransitions(): void {
  const css = document.createElement('style')
  css.appendChild(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;transition:none!important}',
    ),
  )
  document.head.appendChild(css)
  ;(() => window.getComputedStyle(document.body))()
  window.setTimeout(() => {
    css.parentNode?.removeChild(css)
  }, 1)
}

function subscribeTheme(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(THEME_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(THEME_EVENT, onChange)
  }
}

function getServerTheme(): ColorMode {
  return THEME_DEFAULT
}

function setTheme(next: string | ((prev: string) => string)): void {
  const current = readStoredTheme()
  const raw = typeof next === 'function' ? next(current) : next
  const mode: ColorMode = raw === 'light' ? 'light' : 'dark'
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    /* private mode / quota */
  }
  disableTransitions()
  applyColorMode(mode)
  window.dispatchEvent(new Event(THEME_EVENT))
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readStoredTheme,
    getServerTheme,
  )
  return useMemo(
    () => ({
      theme,
      resolvedTheme: theme,
      setTheme,
      themes: ['light', 'dark'] as const,
    }),
    [theme],
  )
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
      {tenant ? <DesignApplier design={design} /> : null}
      {children}
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
