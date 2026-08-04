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
  info: 'Badge Aviso (Portal), Informativo (Admin) e faixa de dica no evento',
})

/**
 * Defaults de ação. Sucesso usa azul (não verde): em futebol BR, verde é
 * identidade de vários clubes e cor de rivalidade para outros — nunca forçar.
 */
export const DEFAULT_ACTIONS = /** @type {const} */ ({
  success: '#1d4ed8',
  danger: '#dc2626',
  warning: '#d97706',
  info: '#2563eb',
})

/** Overrides opcionais de texto em botão/badge de ação (null = automático). */
export const DEFAULT_ACTIONS_FG = /** @type {const} */ ({
  success: null,
  danger: null,
  warning: null,
  info: null,
})

/**
 * Overrides de texto da marca em menus/tabs soft (`*-fg`) e botão sólido (`*-on`).
 * null = automático (`corMarcaLegivel` / contraste no preenchimento).
 */
export const DEFAULT_BRAND_FG = /** @type {const} */ ({
  primary: null,
  secondary: null,
})

/** Capa / hero da loja no portal (persiste em `Tenant.design.loja`). */
export const DEFAULT_LOJA_VITRINE = /** @type {const} */ ({
  bannerUrl: null,
  /** Quando true e não há banner, usa a imagem do 1º produto em destaque. */
  usarDestaqueComoCapa: true,
})

const LojaVitrineSchema = z
  .object({
    bannerUrl: z.union([z.string().url(), z.null()]).default(null),
    usarDestaqueComoCapa: z.boolean().default(true),
  })
  .strict()

const ActionsTokensSchema = z
  .object({
    success: hexColor.default(DEFAULT_ACTIONS.success),
    danger: hexColor.default(DEFAULT_ACTIONS.danger),
    warning: hexColor.default(DEFAULT_ACTIONS.warning),
    info: hexColor.default(DEFAULT_ACTIONS.info),
  })
  .strict()

const ActionsFgSchema = z
  .object({
    success: hexOrNull.optional(),
    danger: hexOrNull.optional(),
    warning: hexOrNull.optional(),
    info: hexOrNull.optional(),
  })
  .strict()
  .default({})

const BrandFgSchema = z
  .object({
    primary: hexOrNull.optional(),
    secondary: hexOrNull.optional(),
  })
  .strict()
  .default({})

/** Paleta salva pela torcida (listada em Paletas sugeridas). */
export const CustomPaletteSchema = z
  .object({
    id: z.string().min(1).max(64),
    nome: z.string().min(1).max(60),
    primary: hexColor,
    secondary: hexOrNull.default(null),
    actions: ActionsTokensSchema,
    actionsFg: ActionsFgSchema.optional(),
    swatches: z.array(hexColor).min(1).max(5),
    createdAt: z.string().max(40).optional(),
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
    /** Texto em botão sólido / badge soft — null = auto (contraste / legível). */
    actionsFg: ActionsFgSchema,
    /**
     * Texto da marca em menus/tabs/badges soft (`--color-*-fg`) e botão sólido
     * (`--color-*-on`) — null = automático.
     */
    brandFg: BrandFgSchema,
    /** Paletas criadas pela torcida (além das sugeridas pelo sistema). */
    customPalettes: z.array(CustomPaletteSchema).max(20).default([]),
    light: SurfaceTokensSchema.default({}),
    dark: SurfaceTokensSchema.default({}),
    /** Vitrine do portal `/portal/loja/[tenantId]` — edita em `/admin/loja/vitrine`. */
    loja: LojaVitrineSchema.default({ ...DEFAULT_LOJA_VITRINE }),
  })
  .strict()

/** @typedef {z.infer<typeof TenantDesignSchema>} TenantDesign */
/** @typedef {z.infer<typeof LojaVitrineSchema>} LojaVitrine */

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
  actionsFg: { ...DEFAULT_ACTIONS_FG },
  brandFg: { ...DEFAULT_BRAND_FG },
  customPalettes: [],
  light: {},
  dark: {},
  loja: { ...DEFAULT_LOJA_VITRINE },
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
      actionsFg: { ...DEFAULT_ACTIONS_FG },
      brandFg: { ...DEFAULT_BRAND_FG },
      customPalettes: [],
      loja: { ...DEFAULT_LOJA_VITRINE },
    }
  }

  const parsed = TenantDesignSchema.safeParse(raw)
  if (parsed.success) {
    // corPrimaria do Tenant continua a fonte de verdade da marca se divergir.
    return {
      ...parsed.data,
      brand: { ...parsed.data.brand, primary },
      actions: { ...DEFAULT_ACTIONS, ...parsed.data.actions },
      actionsFg: {
        ...DEFAULT_ACTIONS_FG,
        ...(parsed.data.actionsFg ?? {}),
      },
      brandFg: {
        ...DEFAULT_BRAND_FG,
        ...(parsed.data.brandFg ?? {}),
      },
      customPalettes: parsed.data.customPalettes ?? [],
      loja: {
        ...DEFAULT_LOJA_VITRINE,
        ...(parsed.data.loja ?? {}),
      },
    }
  }

  // JSON legado sem `loja` (ou com chaves extras) — tenta recuperar capa da vitrine
  // sem perder a marca já salva.
  const loose = /** @type {Record<string, unknown>} */ (raw)
  const lojaLoose =
    loose.loja && typeof loose.loja === 'object'
      ? LojaVitrineSchema.safeParse(loose.loja)
      : null

  return {
    ...DEFAULT_TENANT_DESIGN,
    brand: { primary, secondary: null },
    actions: { ...DEFAULT_ACTIONS },
    actionsFg: { ...DEFAULT_ACTIONS_FG },
    brandFg: { ...DEFAULT_BRAND_FG },
    customPalettes: [],
    loja: lojaLoose?.success
      ? { ...DEFAULT_LOJA_VITRINE, ...lojaLoose.data }
      : { ...DEFAULT_LOJA_VITRINE },
  }
}

/**
 * Só a fatia de vitrine da loja (defaults seguros).
 * @param {unknown} designRaw
 * @param {string} [corPrimaria]
 * @returns {LojaVitrine}
 */
export function resolveLojaVitrine(designRaw, corPrimaria) {
  return resolveTenantDesign(designRaw, corPrimaria).loja
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
 * Cor primária default da plataforma (produto Torcida), NÃO de nenhuma torcida.
 * Se o tenant ainda estiver com esta cor, as sugestões usam o catálogo curado.
 */
export const COR_PRIMARIA_PLATAFORMA = '#7c3aed'

/**
 * Cores primárias curadas por slug (espelho de `packages/db/src/data/torcidas-brasil.js`).
 * @type {Record<string, string>}
 */
export const TORCIDA_CORES_PRIMARIAS = {
  'pde-gavioes-fiel': '#1a1a1a',
  'camisa-12-corinthians': '#111111',
  'pavilhao-nove': '#2d2d2d',
  'mancha-alviverde': '#006437',
  'tup-palmeiras': '#006437',
  'tti-sao-paulo': '#e4002b',
  'dragoes-da-real': '#c8102e',
  'torcida-jovem-santos': '#ffffff',
  'furia-independente-guarani': '#006b3f',
  'raca-tricolor-paulista': '#e31e24',
  'torcida-jovem-flamengo': '#c8102e',
  'raca-rubro-negra': '#c8102e',
  'forca-jovem-vasco': '#000000',
  'young-flu': '#7b0044',
  'forca-flu': '#7b0044',
  'furia-jovem-botafogo': '#000000',
  'galoucura': '#000000',
  'mafia-azul': '#003da5',
  'pavilhao-independente-cruzeiro': '#003da5',
  'seita-verde': '#006b3f',
  'geral-do-gremio': '#0080c8',
  'torcida-jovem-gremio': '#0080c8',
  'camisa-12-inter': '#e30613',
  'falange-grena-caxias': '#8b0000',
  'imperio-alviverde': '#006b3f',
  'furia-caterva': '#e30613',
  'torcida-jovem-avai': '#0066cc',
  'torcida-jovem-figueirense': '#000000',
  'trem-bala-fortaleza': '#e30613',
  'esquadrao-tricolor-bahia': '#003da5',
  'barra-brava-sport': '#e30613',
  'inferno-verde-goias': '#006b3f',
}

/**
 * @param {string | null | undefined} hex
 * @returns {boolean}
 */
export function isCorPadraoPlataforma(hex) {
  return (
    typeof hex === 'string' &&
    hex.toLowerCase() === COR_PRIMARIA_PLATAFORMA.toLowerCase()
  )
}

/**
 * Paleta curada da torcida (slug do tenant) + apoio do clube afiliado.
 * @param {string | null | undefined} slug
 * @param {{ primary: string, secondary: string, accents?: string[] } | null | undefined} [clube]
 * @returns {{ primary: string, secondary: string, accents: string[], fonte: 'catalogo' } | null}
 */
export function paletaDaTorcida(slug, clube = null) {
  if (!slug || typeof slug !== 'string') return null
  const primary = TORCIDA_CORES_PRIMARIAS[slug]
  if (!primary) return null
  const secondary =
    clube?.secondary ||
    (contrasteTextoSobre(primary) === 'light' ? '#ffffff' : '#0a0a0a')
  return {
    primary,
    secondary,
    accents: clube?.accents ?? [],
    fonte: 'catalogo',
  }
}

/**
 * Resolve a marca efetiva para sugestões: nunca tratar o roxo da plataforma
 * como “cor da torcida” se houver catálogo ou paleta do clube.
 * @param {{
 *   corPrimaria?: string | null,
 *   secondary?: string | null,
 *   slug?: string | null,
 *   clube?: { primary: string, secondary: string, accents?: string[] } | null,
 * }} opts
 * @returns {{ primary: string, secondary: string, accents: string[], fonte: 'tenant' | 'catalogo' | 'clube' | 'plataforma' }}
 */
export function resolverMarcaTorcida(opts = {}) {
  const clube = opts.clube ?? null
  const catalogo = paletaDaTorcida(opts.slug, clube)
  const corAtual =
    typeof opts.corPrimaria === 'string' && /^#[0-9a-fA-F]{6}$/.test(opts.corPrimaria)
      ? opts.corPrimaria
      : null
  const secundariaAtual =
    typeof opts.secondary === 'string' && /^#[0-9a-fA-F]{6}$/.test(opts.secondary)
      ? opts.secondary
      : null

  // Cor personalizada da torcida (não é o default do produto).
  if (corAtual && !isCorPadraoPlataforma(corAtual)) {
    const secondary =
      secundariaAtual ||
      catalogo?.secondary ||
      clube?.secondary ||
      (contrasteTextoSobre(corAtual) === 'light' ? '#ffffff' : '#0a0a0a')
    return {
      primary: corAtual,
      secondary,
      accents: catalogo?.accents?.length
        ? catalogo.accents
        : (clube?.accents ?? []),
      fonte: 'tenant',
    }
  }

  if (catalogo) {
    return {
      primary: catalogo.primary,
      secondary: secundariaAtual || catalogo.secondary,
      accents: catalogo.accents,
      fonte: 'catalogo',
    }
  }

  if (clube?.primary) {
    return {
      primary: clube.primary,
      secondary: secundariaAtual || clube.secondary,
      accents: clube.accents ?? [],
      fonte: 'clube',
    }
  }

  return {
    primary: corAtual || COR_PRIMARIA_PLATAFORMA,
    secondary:
      secundariaAtual ||
      (contrasteTextoSobre(corAtual || COR_PRIMARIA_PLATAFORMA) === 'light'
        ? '#ffffff'
        : '#0a0a0a'),
    accents: [],
    fonte: 'plataforma',
  }
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
 * Cobre fundo, sutil, superfície e elevada — sem “drenched” pesado.
 * @param {string} primaryHex
 * @returns {{ light: Record<string, string>, dark: Record<string, string>, secondary: string }}
 */
export function derivarSuperficiesDaMarca(primaryHex) {
  const secondary = contrasteTextoSobre(primaryHex) === 'light' ? '#ffffff' : '#0a0a0a'

  // Light: página branca → sutil/elevada com tint suave da marca.
  const lightBg = mixHex('#ffffff', primaryHex, 0.03)
  const lightSubtle = mixHex('#f9fafb', primaryHex, 0.08)
  const lightSurface = mixHex('#ffffff', primaryHex, 0.04)
  const lightRaised = mixHex('#f4f4f5', primaryHex, 0.1)

  // Dark: zinc base → tint progressivo (página < sutil < surface < raised).
  const darkBg = mixHex('#09090b', primaryHex, 0.06)
  const darkSubtle = mixHex('#18181b', primaryHex, 0.14)
  const darkSurface = mixHex('#18181b', primaryHex, 0.1)
  const darkRaised = mixHex('#27272a', primaryHex, 0.16)

  return {
    secondary,
    light: {
      background: lightBg,
      backgroundSubtle: lightSubtle,
      surface: lightSurface,
      surfaceRaised: lightRaised,
    },
    dark: {
      background: darkBg,
      backgroundSubtle: darkSubtle,
      surface: darkSurface,
      surfaceRaised: darkRaised,
    },
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
    // Neutro (preto/branco/cinza): só ajusta luminância — saturação > 0
    // com hue 0 vira marrom e quebra identidade de torcidas P&B.
    const targetL = l < minL ? minL : l > maxL ? maxL : l
    return hslToHex(0, 0, targetL)
  }
  return hslToHex(h, s, Math.min(maxL, Math.max(minL, l)))
}

/**
 * Hue “verde de campo” (≈90–165°) com saturação mínima — identidade ou rivalidade.
 * @param {string} hex
 * @returns {boolean}
 */
export function isVerdeIdentidade(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return false
  const { h, s } = hexToHsl(hex)
  return s >= 0.18 && h >= 85 && h <= 165
}

/**
 * Remove verdes de uma lista quando a identidade da torcida/clube não é verde
 * (evita sugerir cor de rival por acidente de harmonia ou ruído de extrator).
 * @param {string[]} hexes
 * @param {string[]} identidadeHexes cores da marca/clube/escudo que definem o contexto
 * @returns {string[]}
 */
export function filtrarVerdeForaDeContexto(hexes, identidadeHexes = []) {
  const identidadeAceitaVerde = identidadeHexes.some(isVerdeIdentidade)
  if (identidadeAceitaVerde) return hexes.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
  return hexes.filter(
    (c) => /^#[0-9a-fA-F]{6}$/.test(c) && !isVerdeIdentidade(c),
  )
}

/**
 * Texto de marca legível sobre superfície (badges / soft buttons).
 * Preto em fundo escuro (ou branco em fundo claro) some — clareia/escurece o hue.
 * @param {string} brandHex
 * @param {string} surfaceHex
 * @param {number} [minRatio]
 * @returns {string}
 */
export function corMarcaLegivel(brandHex, surfaceHex, minRatio = 3.2) {
  if (contrasteRatio(brandHex, surfaceHex) >= minRatio) return brandHex
  const { h, s, l } = hexToHsl(brandHex)
  const surfaceDark = luminanciaRelativa(surfaceHex) < 0.45
  if (surfaceDark) {
    const targetL = s < 0.12 ? 0.78 : Math.max(0.55, Math.min(0.72, l + 0.42))
    return hslToHex(h, s < 0.12 ? 0 : Math.max(s, 0.2), targetL)
  }
  const targetL = s < 0.12 ? 0.22 : Math.min(0.38, Math.max(0.16, l - 0.35))
  return hslToHex(h, s < 0.12 ? 0 : Math.max(s, 0.2), targetL)
}

/**
 * Texto de botão sólido (`on`) e de badge/soft (`fg`) para uma ação.
 *
 * - Automático: `on` contraste no preenchimento; `fg` tom da ação legível na
 *   superfície do tema (claro/escuro) — badge soft usa wash ~14% sobre a surface.
 * - Override manual: só é aplicado onde o contraste fecha (≥3:1). Se branco
 *   funciona no botão mas falha no badge claro (ou o inverso), aquele contexto
 *   volta ao automático — assim mudar num tema não quebra o outro.
 *
 * @param {string} actionHex
 * @param {string | null | undefined} overrideHex
 * @param {string} surfaceHex superfície do modo ativo (light/dark)
 * @returns {{ on: string, fg: string }}
 */
export function resolveActionTextColors(actionHex, overrideHex, surfaceHex) {
  const autoOn = contrasteTextoSobre(actionHex) === 'light' ? '#ffffff' : '#0a0a0a'
  const autoFg = corMarcaLegivel(actionHex, surfaceHex)
  /** Aprox. de `bg color / 0.14` sobre a superfície (Badge / soft). */
  const softBg = mixHex(surfaceHex, actionHex, 0.14)
  const minRatio = 3

  if (typeof overrideHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(overrideHex)) {
    return {
      on:
        contrasteRatio(overrideHex, actionHex) >= minRatio ? overrideHex : autoOn,
      fg: contrasteRatio(overrideHex, softBg) >= minRatio ? overrideHex : autoFg,
    }
  }

  return { on: autoOn, fg: autoFg }
}

/**
 * Deriva cores de ação a partir da marca/clube.
 * Sucesso só é verde se a identidade já for verde (ex.: Palmeiras, Goiás).
 * Caso contrário usa azul (ou tom da marca) — nunca injeta verde de rivalidade.
 * @param {string} primaryHex
 * @param {{ secondary?: string | null, accents?: string[] }} [opts]
 */
export function derivarAcoesDaMarca(primaryHex, opts = {}) {
  const { h } = hexToHsl(primaryHex)
  const verdesNaMarca = [primaryHex, opts.secondary, ...(opts.accents ?? [])]
    .filter(Boolean)
    .filter(isVerdeIdentidade)
  const marcaEhVerde = verdesNaMarca.length > 0

  // Positivo = cor da marca (legível em botão). Só verde se a identidade for verde.
  // Nunca injetar azul “genérico” que some da paleta sugerida (ex.: Gaviões P&B+vermelho).
  const success = marcaEhVerde
    ? clampHexLightness(/** @type {string} */ (verdesNaMarca[0]), 0.28, 0.45)
    : clampHexLightness(primaryHex, 0.14, 0.42)

  const danger = clampHexLightness(
    mixHex('#dc2626', hslToHex((h + 8) % 360, 0.72, 0.42), 0.25),
    0.32,
    0.5,
  )
  const warning = clampHexLightness(
    mixHex('#d97706', hslToHex((h + 35) % 360, 0.7, 0.45), 0.2),
    0.35,
    0.52,
  )
  // Info continua azul-neutro (status informativo, não “aprovação”).
  const info = clampHexLightness(mixHex('#2563eb', primaryHex, 0.3), 0.28, 0.55)

  return { success, danger, warning, info }
}

/**
 * Até 3 swatches únicos para a UI de paletas sugeridas.
 * @param {string[]} hexes
 * @param {number} [max]
 * @returns {string[]}
 */
export function limitarSwatches(hexes, max = 3) {
  /** @type {string[]} */
  const out = []
  const seen = new Set()
  for (const raw of hexes) {
    if (typeof raw !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw)) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(raw)
    if (out.length >= max) break
  }
  return out
}

/**
 * Primeiro accent cromático distinto de primária/secundária (destaque da identidade).
 * Neutros/cinzas do extrator não viram danger — senão o 3º swatch “some” da marca.
 * @param {string} primary
 * @param {string} secondary
 * @param {string[]} [accents]
 * @returns {string | null}
 */
function accentDestaque(primary, secondary, accents = []) {
  const p = primary.toLowerCase()
  const s = secondary.toLowerCase()
  for (const raw of accents) {
    if (typeof raw !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw)) continue
    const key = raw.toLowerCase()
    if (key === p || key === s) continue
    const { s: sat } = hexToHsl(raw)
    if (sat < 0.18) continue
    return raw
  }
  return null
}

/**
 * Fecha uma paleta sugerida: ações derivadas + swatches = o que Aplicar grava.
 * O 3º swatch é sempre `actions.danger` (accent da identidade quando existir).
 * @param {{
 *   id: string,
 *   nome: string,
 *   descricao: string,
 *   primary: string,
 *   secondary: string,
 *   accents?: string[],
 *   identidade?: string[],
 *   fonte: PaletaSugerida['fonte'],
 * }} spec
 * @returns {PaletaSugerida}
 */
function fecharPaletaSugerida(spec) {
  const identidade = filtrarVerdeForaDeContexto(
    (spec.identidade ?? [spec.primary, spec.secondary, ...(spec.accents ?? [])]).filter(
      Boolean,
    ),
    [spec.primary, spec.secondary, ...(spec.accents ?? [])],
  )
  const accents = filtrarVerdeForaDeContexto(spec.accents ?? [], identidade)
  const actions = derivarAcoesDaMarca(spec.primary, {
    secondary: spec.secondary,
    accents,
  })
  const destaque = accentDestaque(spec.primary, spec.secondary, accents)
  if (destaque) {
    // Accent da torcida/clube vira o danger aplicado — swatch ≠ fantasma.
    actions.danger = clampHexLightness(destaque, 0.28, 0.52)
  }
  return {
    id: spec.id,
    nome: spec.nome,
    descricao: spec.descricao,
    primary: spec.primary,
    secondary: spec.secondary,
    actions,
    swatches: limitarSwatches([spec.primary, spec.secondary, actions.danger]),
    fonte: spec.fonte,
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
 *   fonte: 'torcida' | 'harmonia' | 'clube' | 'escudo' | 'preset' | 'custom' | 'atual'
 *   actionsFg?: { success: string | null, danger: string | null, warning: string | null, info: string | null }
 * }} PaletaSugerida
 */

/**
 * Exatamente 3 paletas sugeridas — regra de negócio: torcida → escudo → clube.
 * Sem mono/alto-contraste/harmônicas genéricas. Cada card tem 3 swatches que
 * batem com o que `aplicarPaletaAoDesign` grava (primária · secundária · danger).
 * @param {string} seedHex cor primária atual (tenant) — se for o roxo da plataforma,
 *   a marca da torcida usa catálogo/clube via `opts.slug`
 * @param {{
 *   clube?: { primary: string, secondary: string, accents?: string[] } | null,
 *   extraidas?: string[],
 *   secondary?: string | null,
 *   slug?: string | null,
 * }} [opts]
 * @returns {PaletaSugerida[]}
 */
export function gerarPaletasSugeridas(seedHex, opts = {}) {
  const marca = resolverMarcaTorcida({
    corPrimaria: seedHex,
    secondary: opts.secondary,
    slug: opts.slug,
    clube: opts.clube ?? null,
  })
  const seed = marca.primary
  const seedSecondary = marca.secondary
  const marcaAccents = marca.accents.length
    ? marca.accents
    : (opts.clube?.accents ?? [])

  const identidadeBase = [
    seed,
    seedSecondary,
    opts.clube?.primary,
    opts.clube?.secondary,
    ...(opts.clube?.accents ?? []),
    ...marcaAccents,
  ].filter(Boolean)

  const descricaoMarca =
    marca.fonte === 'catalogo'
      ? 'Cores curadas desta torcida (não o roxo padrão da plataforma)'
      : marca.fonte === 'clube'
        ? 'Ainda sem cor própria — usando a paleta do clube afiliado'
        : marca.fonte === 'plataforma'
          ? 'Padrão da plataforma — personalize a primária'
          : 'Primária · secundária · destaque (sem inventar cor de rival)'

  // 1) Marca da torcida
  const paletaMarca = fecharPaletaSugerida({
    id: 'marca-torcida',
    nome: 'Marca da torcida',
    descricao: descricaoMarca,
    primary: seed,
    secondary: seedSecondary,
    accents: marcaAccents,
    identidade: identidadeBase,
    fonte: 'torcida',
  })

  // 2) Escudo / logo — fallback estável se o extrator ainda não tiver 2+ cores
  const extraRaw = (opts.extraidas ?? []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
  const extra = filtrarVerdeForaDeContexto(extraRaw, identidadeBase)
  /** @type {PaletaSugerida} */
  let paletaEscudo
  if (extra.length >= 2) {
    paletaEscudo = fecharPaletaSugerida({
      id: 'escudo',
      nome: 'Do escudo / logo',
      descricao: 'Extraído da imagem da torcida',
      primary: extra[0],
      secondary: extra[1],
      accents: extra.slice(2, 5),
      identidade: [...identidadeBase, ...extra],
      fonte: 'escudo',
    })
  } else {
    // Sem extrato: mesma família da marca (aplicável), sem inventar hue de rival.
    paletaEscudo = fecharPaletaSugerida({
      id: 'escudo',
      nome: 'Do escudo / logo',
      descricao:
        extra.length === 1
          ? 'Poucas cores no logo — completa com a marca'
          : 'Sem imagem ainda — usa a marca até extrair o escudo',
      primary: extra[0] || seed,
      secondary: seedSecondary,
      accents: marcaAccents,
      identidade: identidadeBase,
      fonte: 'escudo',
    })
  }

  // 3) Clube afiliado — fallback na marca se não houver afiliação curada
  /** @type {PaletaSugerida} */
  let paletaClube
  if (opts.clube?.primary) {
    const primary = opts.clube.primary
    const secondary =
      opts.clube.secondary || derivarSuperficiesDaMarca(primary).secondary
    const accents = opts.clube.accents ?? []
    paletaClube = fecharPaletaSugerida({
      id: 'clube',
      nome: 'Paleta do clube',
      descricao: 'Cores oficiais do time afiliado',
      primary,
      secondary,
      accents,
      identidade: [primary, secondary, ...accents],
      fonte: 'clube',
    })
  } else {
    paletaClube = fecharPaletaSugerida({
      id: 'clube',
      nome: 'Paleta do clube',
      descricao: 'Sem clube afiliado — espelho da marca da torcida',
      primary: seed,
      secondary: seedSecondary,
      accents: marcaAccents,
      identidade: identidadeBase,
      fonte: 'clube',
    })
  }

  return [paletaMarca, paletaEscudo, paletaClube]
}

/**
 * Swatches (até 3) a partir do design atual — para cards de paleta.
 * Ordem alinhada às sugeridas: primária → secundária → destaque (danger/aviso),
 * nunca `success` (em marcas P&B o sucesso vira cinza #242424 e parece uma
 * “terceira cor” fantasma diferente do vermelho da marca).
 * @param {import('zod').infer<typeof TenantDesignSchema> | object} design
 * @returns {string[]}
 */
export function swatchesDoDesign(design) {
  const actions = { ...DEFAULT_ACTIONS, ...(design.actions ?? {}) }
  const primary = design.brand?.primary
  const secondary =
    design.brand?.secondary && /^#[0-9a-fA-F]{6}$/.test(design.brand.secondary)
      ? design.brand.secondary
      : '#ffffff'
  return limitarSwatches([
    primary,
    secondary,
    actions.danger,
    actions.warning,
    actions.info,
  ])
}

/**
 * Converte o design em card de paleta (Paleta atual / snapshot).
 * @param {import('zod').infer<typeof TenantDesignSchema> | object} design
 * @param {{ id: string, nome: string, descricao?: string, fonte?: PaletaSugerida['fonte'] }} meta
 * @returns {PaletaSugerida}
 */
export function designParaPaletaSugerida(design, meta) {
  const actions = { ...DEFAULT_ACTIONS, ...(design.actions ?? {}) }
  const secondary =
    design.brand?.secondary && /^#[0-9a-fA-F]{6}$/.test(design.brand.secondary)
      ? design.brand.secondary
      : '#ffffff'
  return {
    id: meta.id,
    nome: meta.nome,
    descricao: meta.descricao ?? '',
    primary: design.brand.primary,
    secondary,
    actions,
    actionsFg: design.actionsFg
      ? { ...DEFAULT_ACTIONS_FG, ...design.actionsFg }
      : undefined,
    swatches: swatchesDoDesign(design),
    fonte: meta.fonte ?? 'atual',
  }
}

/**
 * @param {import('zod').infer<typeof CustomPaletteSchema>} p
 * @returns {PaletaSugerida}
 */
export function customPaletteParaSugerida(p) {
  const actions = { ...DEFAULT_ACTIONS, ...(p.actions ?? {}) }
  return {
    id: `custom:${p.id}`,
    nome: p.nome,
    descricao: 'Salva pela torcida',
    primary: p.primary,
    secondary: p.secondary ?? '#ffffff',
    actions,
    actionsFg: p.actionsFg
      ? { ...DEFAULT_ACTIONS_FG, ...p.actionsFg }
      : undefined,
    swatches:
      p.swatches?.length > 0
        ? p.swatches
        : limitarSwatches([p.primary, p.secondary, actions.danger].filter(Boolean)),
    fonte: 'custom',
  }
}

/**
 * Captura o rascunho atual como paleta persistível.
 * @param {import('zod').infer<typeof TenantDesignSchema> | object} design
 * @param {string} nome
 * @returns {import('zod').infer<typeof CustomPaletteSchema>}
 */
export function capturarPaletaDoDesign(design, nome) {
  const actions = { ...DEFAULT_ACTIONS, ...(design.actions ?? {}) }
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}`
  return {
    id,
    nome: String(nome || 'Minha paleta')
      .trim()
      .slice(0, 60) || 'Minha paleta',
    primary: design.brand.primary,
    secondary: design.brand.secondary ?? null,
    actions,
    actionsFg: {
      success: design.actionsFg?.success ?? null,
      danger: design.actionsFg?.danger ?? null,
      warning: design.actionsFg?.warning ?? null,
      info: design.actionsFg?.info ?? null,
    },
    swatches: swatchesDoDesign(design),
    createdAt: new Date().toISOString(),
  }
}

/**
 * Aplica uma paleta sugerida sobre um design existente (preserva grade e paletas salvas).
 * Sempre herda brand + actions + superfícies derivadas + texto automático —
 * o que o card mostra (3 swatches) é o que entra no rascunho.
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
    brandFg: { ...DEFAULT_BRAND_FG },
    actions: { ...DEFAULT_ACTIONS, ...paleta.actions },
    actionsFg: paleta.actionsFg
      ? { ...DEFAULT_ACTIONS_FG, ...paleta.actionsFg }
      : { ...DEFAULT_ACTIONS_FG },
    customPalettes: design.customPalettes ?? [],
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
