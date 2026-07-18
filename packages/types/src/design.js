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

/** Cores semânticas de fluxo (aprovar, reprovar, alerta, info). */
export const ACTION_TOKEN_KEYS = /** @type {const} */ ([
  'success',
  'danger',
  'warning',
  'info',
])

export const ACTION_TOKEN_LABELS = /** @type {const} */ ({
  success: 'Aprovar / positivo',
  danger: 'Reprovar / cancelar / destrutivo',
  warning: 'Atenção / pendente',
  info: 'Informativo',
})

export const ACTION_TOKEN_HINTS = /** @type {const} */ ({
  success: 'Botões de aprovar, confirmar positivo e badges de sucesso',
  danger: 'Reprovar, excluir, cancelar inscrição e badges de erro',
  warning: 'Pendências, lista de espera e avisos',
  info: 'Dicas e status neutro-informativo',
})

/** Defaults alinhados ao emerald/red/amber/blue usados hoje no app. */
export const DEFAULT_ACTIONS = /** @type {const} */ ({
  success: '#059669',
  danger: '#dc2626',
  warning: '#d97706',
  info: '#2563eb',
})

const ActionsTokensSchema = z
  .object({
    success: hexColor.default(DEFAULT_ACTIONS.success),
    danger: hexColor.default(DEFAULT_ACTIONS.danger),
    warning: hexColor.default(DEFAULT_ACTIONS.warning),
    info: hexColor.default(DEFAULT_ACTIONS.info),
  })
  .strict()

/** @type {Record<(typeof ACTION_TOKEN_KEYS)[number], string>} */
export const ACTION_CSS_VARS = {
  success: '--color-success',
  danger: '--color-danger',
  warning: '--color-warning',
  info: '--color-info',
}

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
    actions: ActionsTokensSchema.default({ ...DEFAULT_ACTIONS }),
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
  actions: { ...DEFAULT_ACTIONS },
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
      actions: { ...DEFAULT_ACTIONS },
    }
  }

  const parsed = TenantDesignSchema.safeParse(raw)
  if (parsed.success) {
    // corPrimaria do Tenant continua a fonte de verdade da marca se divergir.
    return {
      ...parsed.data,
      brand: { ...parsed.data.brand, primary },
      actions: { ...DEFAULT_ACTIONS, ...parsed.data.actions },
    }
  }

  return {
    ...DEFAULT_TENANT_DESIGN,
    brand: { primary, secondary: null },
    actions: { ...DEFAULT_ACTIONS },
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
    actions: { ...DEFAULT_ACTIONS },
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
 * @returns {{ h: number, s: number, l: number }}
 */
export function hexToHsl(hex) {
  const [r0, g0, b0] = hexToRgbChannels(hex).map((c) => c / 255)
  const max = Math.max(r0, g0, b0)
  const min = Math.min(r0, g0, b0)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r0) h = ((g0 - b0) / d + (g0 < b0 ? 6 : 0)) / 6
  else if (max === g0) h = ((b0 - r0) / d + 2) / 6
  else h = ((r0 - g0) / d + 4) / 6
  return { h: h * 360, s, l }
}

/**
 * @param {number} h 0–360
 * @param {number} s 0–1
 * @param {number} l 0–1
 * @returns {string}
 */
export function hslToHex(h, s, l) {
  const hh = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  /** @param {number} n */
  const f = (n) => {
    const k = (n + hh / 30) % 12
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * c)
  }
  return rgbToHex(f(0), f(8), f(4))
}

/**
 * Garante luminância útil para botões (nem branco, nem preto puro).
 * @param {string} hex
 * @param {number} [minL]
 * @param {number} [maxL]
 */
function clampHexLightness(hex, minL = 0.22, maxL = 0.62) {
  const { h, s, l } = hexToHsl(hex)
  if (s < 0.08) {
    // Quase monocromático — empurra para um tom utilizável.
    return hslToHex(h, 0.12, Math.min(maxL, Math.max(minL, l)))
  }
  return hslToHex(h, s, Math.min(maxL, Math.max(minL, l)))
}

/**
 * Deriva cores de ação legíveis a partir da marca (semânticas reconhecíveis).
 * @param {string} primaryHex
 */
export function derivarAcoesDaMarca(primaryHex) {
  const { h } = hexToHsl(primaryHex)
  // Sucesso fica em verde; perigo em vermelho; warning âmbar; info perto da marca ou azul.
  const success = mixHex('#059669', hslToHex((h + 140) % 360, 0.55, 0.38), 0.25)
  const danger = mixHex('#dc2626', hslToHex((h + 20) % 360, 0.7, 0.42), 0.2)
  const warning = mixHex('#d97706', hslToHex((h + 40) % 360, 0.75, 0.45), 0.2)
  const info = clampHexLightness(
    mixHex('#2563eb', primaryHex, 0.35),
    0.28,
    0.55,
  )
  return {
    success: clampHexLightness(success, 0.28, 0.48),
    danger: clampHexLightness(danger, 0.32, 0.5),
    warning: clampHexLightness(warning, 0.35, 0.52),
    info,
  }
}

/**
 * @typedef {{
 *   id: string,
 *   nome: string,
 *   descricao: string,
 *   primary: string,
 *   secondary: string,
 *   actions: { success: string, danger: string, warning: string, info: string },
 *   swatches: string[],
 *   fonte: 'harmonia' | 'clube' | 'escudo' | 'preset'
 * }} PaletaSugerida
 */

/**
 * Gera paletas harmônicas a partir de uma cor semente (marca atual, clube ou escudo).
 * @param {string} seedHex
 * @param {{ clube?: { primary: string, secondary: string, accents?: string[] } | null, extraidas?: string[] }} [opts]
 * @returns {PaletaSugerida[]}
 */
export function gerarPaletasSugeridas(seedHex, opts = {}) {
  const seed =
    typeof seedHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(seedHex)
      ? seedHex
      : DEFAULT_ACTIONS.info
  const { h, s, l } = hexToHsl(seed)
  const surfaces = derivarSuperficiesDaMarca(seed)

  /** @type {PaletaSugerida[]} */
  const out = []

  // 1) Marca atual + ações derivadas
  {
    const primary = clampHexLightness(seed, 0.12, 0.55)
    const actions = derivarAcoesDaMarca(primary)
    out.push({
      id: 'marca-harmonizada',
      nome: 'Marca harmonizada',
      descricao: 'Mantém sua cor e equilibra aprovar/reprovar/alerta',
      primary,
      secondary: surfaces.secondary,
      actions,
      swatches: [primary, surfaces.secondary, actions.success, actions.danger, actions.warning],
      fonte: 'harmonia',
    })
  }

  // 2) Análoga
  {
    const primary = hslToHex(h, Math.max(0.35, s), Math.min(0.45, Math.max(0.25, l)))
    const secondary = hslToHex((h + 28) % 360, Math.max(0.25, s * 0.8), 0.42)
    const actions = derivarAcoesDaMarca(primary)
    out.push({
      id: 'analoga',
      nome: 'Análoga',
      descricao: 'Tons vizinhos no círculo cromático — visual coeso',
      primary: clampHexLightness(primary),
      secondary: clampHexLightness(secondary, 0.2, 0.7),
      actions,
      swatches: [primary, secondary, actions.info, actions.success],
      fonte: 'harmonia',
    })
  }

  // 3) Complementar (energia de torcida)
  {
    const primary = clampHexLightness(seed)
    const accent = hslToHex((h + 180) % 360, Math.max(0.45, s), 0.42)
    const actions = {
      ...derivarAcoesDaMarca(primary),
      danger: clampHexLightness(accent, 0.3, 0.5),
    }
    out.push({
      id: 'complementar',
      nome: 'Complementar',
      descricao: 'Contraste forte — destaque em ações destrutivas',
      primary,
      secondary: contrasteTextoSobre(primary) === 'light' ? '#ffffff' : '#0a0a0a',
      actions,
      swatches: [primary, accent, actions.success, actions.warning],
      fonte: 'harmonia',
    })
  }

  // 4) Monocromática
  {
    const primary = hslToHex(h, Math.max(0.2, s * 0.7), 0.28)
    const secondary = hslToHex(h, Math.max(0.1, s * 0.4), 0.72)
    const actions = derivarAcoesDaMarca(primary)
    out.push({
      id: 'mono',
      nome: 'Monocromática',
      descricao: 'Só a família da marca — sóbria e profissional',
      primary: clampHexLightness(primary, 0.15, 0.4),
      secondary: clampHexLightness(secondary, 0.55, 0.85),
      actions,
      swatches: [
        hslToHex(h, s, 0.15),
        primary,
        hslToHex(h, s * 0.5, 0.45),
        secondary,
      ],
      fonte: 'harmonia',
    })
  }

  // 5) Clube (se houver)
  if (opts.clube?.primary) {
    const primary = opts.clube.primary
    const secondary = opts.clube.secondary || derivarSuperficiesDaMarca(primary).secondary
    const actions = derivarAcoesDaMarca(primary)
    out.unshift({
      id: 'clube',
      nome: 'Paleta do clube',
      descricao: 'Cores oficiais do time afiliado',
      primary,
      secondary,
      actions,
      swatches: [primary, secondary, ...(opts.clube.accents ?? []).slice(0, 2), actions.success],
      fonte: 'clube',
    })
  }

  // 6) Escudo — usa 1ª cor extraída como semente
  const extra = (opts.extraidas ?? []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
  if (extra.length >= 2) {
    const primary = clampHexLightness(extra[0])
    const secondary = extra[1]
    const actions = derivarAcoesDaMarca(primary)
    out.splice(opts.clube ? 1 : 0, 0, {
      id: 'escudo',
      nome: 'Do escudo / logo',
      descricao: 'Extraído da imagem da torcida',
      primary,
      secondary,
      actions,
      swatches: extra.slice(0, 5),
      fonte: 'escudo',
    })
  }

  // 7) Preset alto contraste
  {
    const primary = clampHexLightness(seed, 0.1, 0.35)
    out.push({
      id: 'alto-contraste',
      nome: 'Alto contraste',
      descricao: 'Prioriza leitura — ações semânticas clássicas',
      primary,
      secondary: '#ffffff',
      actions: { ...DEFAULT_ACTIONS },
      swatches: [primary, '#ffffff', DEFAULT_ACTIONS.success, DEFAULT_ACTIONS.danger],
      fonte: 'preset',
    })
  }

  return out
}

/**
 * Aplica uma paleta sugerida sobre um design existente (preserva grade).
 * @param {import('zod').infer<typeof TenantDesignSchema> | object} design
 * @param {PaletaSugerida} paleta
 */
export function aplicarPaletaAoDesign(design, paleta) {
  const derived = derivarSuperficiesDaMarca(paleta.primary)
  return {
    ...design,
    version: 1,
    brand: {
      primary: paleta.primary,
      secondary: paleta.secondary,
    },
    actions: { ...DEFAULT_ACTIONS, ...paleta.actions },
    light: { ...(design.light ?? {}), ...derived.light },
    dark: { ...(design.dark ?? {}), ...derived.dark },
    grid: design.grid ?? DEFAULT_TENANT_DESIGN.grid,
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
