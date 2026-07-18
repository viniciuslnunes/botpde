import { z } from 'zod'

/** @typedef {'background' | 'backgroundSubtle' | 'foreground' | 'foregroundMuted' | 'border' | 'borderStrong' | 'surface' | 'surfaceRaised'} SurfaceTokenKey */

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (#RRGGBB)')

const hexOrNull = hexColor.nullable()

export const SURFACE_TOKEN_KEYS = /** @type {const} */ ([
  'background',
  'backgroundSubtle',
  'foreground',
  'foregroundMuted',
  'border',
  'borderStrong',
  'surface',
  'surfaceRaised',
])

/** Labels PT para a UI de Design. */
export const SURFACE_TOKEN_LABELS = /** @type {const} */ ({
  background: 'Fundo da página',
  backgroundSubtle: 'Fundo sutil',
  foreground: 'Texto principal',
  foregroundMuted: 'Texto secundário',
  border: 'Borda',
  borderStrong: 'Borda forte',
  surface: 'Superfície',
  surfaceRaised: 'Superfície elevada',
})

const SurfaceTokensSchema = z
  .object({
    background: hexColor.optional(),
    backgroundSubtle: hexColor.optional(),
    foreground: hexColor.optional(),
    foregroundMuted: hexColor.optional(),
    border: hexColor.optional(),
    borderStrong: hexColor.optional(),
    surface: hexColor.optional(),
    surfaceRaised: hexColor.optional(),
  })
  .strict()

export const TenantDesignSchema = z
  .object({
    version: z.literal(1),
    brand: z
      .object({
        primary: hexColor,
        secondary: hexOrNull.default(null),
      })
      .strict(),
    grid: z
      .object({
        enabled: z.boolean().default(true),
        sizePx: z.number().int().min(24).max(96).default(48),
        lineOpacity: z.number().min(0).max(0.12).default(0.03),
        lineColor: hexOrNull.default(null),
        baseColor: hexOrNull.default(null),
      })
      .strict(),
    light: SurfaceTokensSchema.default({}),
    dark: SurfaceTokensSchema.default({}),
  })
  .strict()

/** @typedef {z.infer<typeof TenantDesignSchema>} TenantDesign */

/** Defaults alinhados a `:root` / `.dark` em globals.css. */
export const DEFAULT_SURFACE_LIGHT = /** @type {const} */ ({
  background: '#ffffff',
  backgroundSubtle: '#f9fafb',
  foreground: '#111827',
  foregroundMuted: '#6b7280',
  border: '#e5e7eb',
  borderStrong: '#9ca3af',
  surface: '#ffffff',
  surfaceRaised: '#f9fafb',
})

export const DEFAULT_SURFACE_DARK = /** @type {const} */ ({
  background: '#09090b',
  backgroundSubtle: '#18181b',
  foreground: '#fafafa',
  foregroundMuted: '#a1a1aa',
  border: '#27272a',
  borderStrong: '#3f3f46',
  surface: '#18181b',
  surfaceRaised: '#27272a',
})

export const DEFAULT_TENANT_DESIGN = /** @type {TenantDesign} */ ({
  version: 1,
  brand: { primary: '#7c3aed', secondary: null },
  grid: {
    enabled: true,
    sizePx: 48,
    lineOpacity: 0.03,
    lineColor: null,
    baseColor: null,
  },
  light: {},
  dark: {},
})

/**
 * Normaliza JSON do banco (ou null) + corPrimaria legada → TenantDesign válido.
 * @param {unknown} raw
 * @param {string} [corPrimaria]
 * @returns {TenantDesign}
 */
export function resolveTenantDesign(raw, corPrimaria) {
  const primary =
    typeof corPrimaria === 'string' && /^#[0-9a-fA-F]{6}$/.test(corPrimaria)
      ? corPrimaria
      : DEFAULT_TENANT_DESIGN.brand.primary

  if (raw == null || typeof raw !== 'object') {
    return {
      ...DEFAULT_TENANT_DESIGN,
      brand: { primary, secondary: null },
    }
  }

  const parsed = TenantDesignSchema.safeParse(raw)
  if (parsed.success) {
    // corPrimaria do Tenant continua a fonte de verdade da marca se divergir.
    return {
      ...parsed.data,
      brand: { ...parsed.data.brand, primary },
    }
  }

  return {
    ...DEFAULT_TENANT_DESIGN,
    brand: { primary, secondary: null },
  }
}

/**
 * Monta um design a partir só da cor primária (sem overrides de superfície).
 * @param {string} primary
 * @param {string | null} [secondary]
 * @returns {TenantDesign}
 */
export function designFromPrimary(primary, secondary = null) {
  return {
    ...DEFAULT_TENANT_DESIGN,
    brand: {
      primary,
      secondary:
        secondary && /^#[0-9a-fA-F]{6}$/.test(secondary) ? secondary : null,
    },
  }
}

/**
 * Paletas curadas por clube (nome/apelido normalizado → primary + secondary).
 * Chaves em minúsculas, sem acentos.
 * @type {Record<string, { primary: string, secondary: string, accents?: string[] }>}
 */
export const CLUBE_PALETAS = {
  corinthians: { primary: '#1a1a1a', secondary: '#ffffff', accents: ['#8b0000'] },
  palmeiras: { primary: '#006437', secondary: '#ffffff', accents: ['#c4a35a'] },
  'sao paulo': { primary: '#e4002b', secondary: '#000000', accents: ['#ffffff'] },
  'são paulo': { primary: '#e4002b', secondary: '#000000', accents: ['#ffffff'] },
  santos: { primary: '#000000', secondary: '#ffffff' },
  flamengo: { primary: '#c8102e', secondary: '#000000', accents: ['#ffffff'] },
  vasco: { primary: '#000000', secondary: '#ffffff', accents: ['#c8102e'] },
  fluminense: { primary: '#7b0044', secondary: '#006633', accents: ['#ffffff'] },
  botafogo: { primary: '#000000', secondary: '#ffffff', accents: ['#c8102e'] },
  'atletico-mg': { primary: '#000000', secondary: '#ffffff' },
  'atlético-mg': { primary: '#000000', secondary: '#ffffff' },
  cruzeiro: { primary: '#003da5', secondary: '#ffffff' },
  'america-mg': { primary: '#006b3f', secondary: '#ffffff' },
  'américa-mg': { primary: '#006b3f', secondary: '#ffffff' },
  gremio: { primary: '#0080c8', secondary: '#000000', accents: ['#ffffff'] },
  grêmio: { primary: '#0080c8', secondary: '#000000', accents: ['#ffffff'] },
  internacional: { primary: '#e30613', secondary: '#ffffff' },
  coritiba: { primary: '#006b3f', secondary: '#ffffff' },
  'athletico-pr': { primary: '#e30613', secondary: '#000000' },
  fortaleza: { primary: '#e30613', secondary: '#003da5', accents: ['#ffffff'] },
  bahia: { primary: '#003da5', secondary: '#e30613', accents: ['#ffffff'] },
  sport: { primary: '#e30613', secondary: '#000000' },
  goias: { primary: '#006b3f', secondary: '#ffffff' },
  goiás: { primary: '#006b3f', secondary: '#ffffff' },
  guarani: { primary: '#006b3f', secondary: '#ffffff' },
  ceara: { primary: '#000000', secondary: '#ffffff' },
  ceará: { primary: '#000000', secondary: '#ffffff' },
  'sao caetano': { primary: '#003da5', secondary: '#ffffff' },
  chapecoense: { primary: '#006b3f', secondary: '#ffffff' },
  avai: { primary: '#0066cc', secondary: '#ffffff' },
  avaí: { primary: '#0066cc', secondary: '#ffffff' },
  figueirense: { primary: '#000000', secondary: '#ffffff' },
  caxias: { primary: '#8b0000', secondary: '#ffffff' },
  paulista: { primary: '#e31e24', secondary: '#000000' },
}

/**
 * @param {string} nome
 * @returns {string}
 */
function normalizeClubeKey(nome) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+fc$/i, '')
    .replace(/\s+futebol\s+clube$/i, '')
    .trim()
}

/**
 * Busca paleta curada pelo nome ou apelido da afiliação.
 * @param {string | null | undefined} nome
 * @param {string | null | undefined} apelido
 * @returns {{ primary: string, secondary: string, accents: string[], fonte: 'clube' } | null}
 */
export function paletaDoClube(nome, apelido) {
  const candidates = [apelido, nome].filter(Boolean)
  for (const c of candidates) {
    const key = normalizeClubeKey(/** @type {string} */ (c))
    const hit = CLUBE_PALETAS[key]
    if (hit) {
      return {
        primary: hit.primary,
        secondary: hit.secondary,
        accents: hit.accents ?? [],
        fonte: 'clube',
      }
    }
    // Tentativa parcial (ex.: "São Paulo FC" → "sao paulo")
    for (const [k, v] of Object.entries(CLUBE_PALETAS)) {
      if (key.includes(k) || k.includes(key)) {
        return {
          primary: v.primary,
          secondary: v.secondary,
          accents: v.accents ?? [],
          fonte: 'clube',
        }
      }
    }
  }
  return null
}

/**
 * Deriva overrides leves de superfície a partir da cor primária (tint no hue).
 * Não força dark "drenched" — só um leve tom no background-subtle.
 * @param {string} primaryHex
 * @returns {{ light: Record<string, string>, dark: Record<string, string>, secondary: string }}
 */
export function derivarSuperficiesDaMarca(primaryHex) {
  const rgb = hexToRgbChannels(primaryHex)
  const secondary = contrasteTextoSobre(primaryHex) === 'light' ? '#ffffff' : '#0a0a0a'

  // Mix bem suave com o default (≈8% da marca no subtle light; ≈12% no dark).
  const lightSubtle = mixHex('#f9fafb', primaryHex, 0.08)
  const darkSubtle = mixHex('#18181b', primaryHex, 0.14)
  const darkSurface = mixHex('#18181b', primaryHex, 0.1)

  return {
    secondary,
    light: { backgroundSubtle: lightSubtle },
    dark: { backgroundSubtle: darkSubtle, surface: darkSurface },
  }
}

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgbChannels(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

/**
 * @param {string} hex
 * @returns {string} canais "r g b" para CSS `rgb(var(--x))`
 */
export function hexToCssRgb(hex) {
  return hexToRgbChannels(hex).join(' ')
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * @param {string} a
 * @param {string} b
 * @param {number} t 0..1 fração de b
 * @returns {string}
 */
export function mixHex(a, b, t) {
  const [ar, ag, ab] = hexToRgbChannels(a)
  const [br, bg, bb] = hexToRgbChannels(b)
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

/**
 * Luminância relativa WCAG.
 * @param {string} hex
 * @returns {number}
 */
export function luminanciaRelativa(hex) {
  const [r, g, b] = hexToRgbChannels(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * @param {string} fg
 * @param {string} bg
 * @returns {number}
 */
export function contrasteRatio(fg, bg) {
  const L1 = luminanciaRelativa(fg)
  const L2 = luminanciaRelativa(bg)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * @param {string} bgHex
 * @returns {'light' | 'dark'}
 */
export function contrasteTextoSobre(bgHex) {
  return luminanciaRelativa(bgHex) > 0.4 ? 'dark' : 'light'
}

/**
 * Mapa CSS var ← token de superfície.
 * @type {Record<SurfaceTokenKey, string>}
 */
export const SURFACE_CSS_VARS = {
  background: '--background',
  backgroundSubtle: '--background-subtle',
  foreground: '--foreground',
  foregroundMuted: '--foreground-muted',
  border: '--border',
  borderStrong: '--border-strong',
  surface: '--surface',
  surfaceRaised: '--surface-raised',
}
