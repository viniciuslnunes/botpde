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

  const success = marcaEhVerde
    ? clampHexLightness(/** @type {string} */ (verdesNaMarca[0]), 0.28, 0.45)
    : clampHexLightness(mixHex('#1d4ed8', primaryHex, 0.28), 0.28, 0.48)

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
 * Terceira cor de destaque: accent do clube, senão fallback (ex.: danger).
 * @param {string} primary
 * @param {string} secondary
 * @param {{ accents?: string[], primary?: string } | null | undefined} clube
 * @param {string} [fallback]
 * @returns {string | undefined}
 */
function destaqueDaPaleta(primary, secondary, clube, fallback) {
  const candidates = [
    ...(clube?.accents ?? []),
    clube?.primary &&
    clube.primary.toLowerCase() !== primary.toLowerCase() &&
    clube.primary.toLowerCase() !== secondary.toLowerCase()
      ? clube.primary
      : null,
    fallback,
  ].filter(Boolean)
  for (const c of candidates) {
    const key = /** @type {string} */ (c).toLowerCase()
    if (key !== primary.toLowerCase() && key !== secondary.toLowerCase()) {
      return /** @type {string} */ (c)
    }
  }
  return fallback
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
 *   fonte: 'torcida' | 'harmonia' | 'clube' | 'escudo' | 'preset'
 * }} PaletaSugerida
 */

/**
 * Paletas sugeridas no contexto da torcida e do clube afiliado.
 * Ordem: marca da torcida → escudo → clube → variação monocromática → alto contraste.
 * Não sugere harmônicas genéricas (análoga/complementar) que inventam cores de rival.
 * @param {string} seedHex cor primária atual da torcida
 * @param {{
 *   clube?: { primary: string, secondary: string, accents?: string[] } | null,
 *   extraidas?: string[],
 *   secondary?: string | null,
 * }} [opts]
 * @returns {PaletaSugerida[]}
 */
export function gerarPaletasSugeridas(seedHex, opts = {}) {
  const seed =
    typeof seedHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(seedHex)
      ? seedHex
      : DEFAULT_TENANT_DESIGN.brand.primary
  const seedSecondary =
    typeof opts.secondary === 'string' && /^#[0-9a-fA-F]{6}$/.test(opts.secondary)
      ? opts.secondary
      : null
  const { h, s } = hexToHsl(seed)
  const surfaces = derivarSuperficiesDaMarca(seed)

  const identidadeBase = [
    seed,
    seedSecondary,
    opts.clube?.primary,
    opts.clube?.secondary,
    ...(opts.clube?.accents ?? []),
  ].filter(Boolean)

  /** @type {PaletaSugerida[]} */
  const out = []

  // 1) Marca da torcida (prioridade) — exatamente 3 cores: primária, secundária, destaque
  {
    const primary = seed
    const secondary = seedSecondary ?? surfaces.secondary
    const actions = derivarAcoesDaMarca(primary, {
      secondary,
      accents: opts.clube?.accents,
    })
    const destaque = destaqueDaPaleta(
      primary,
      secondary,
      opts.clube,
      actions.danger,
    )
    out.push({
      id: 'marca-torcida',
      nome: 'Marca da torcida',
      descricao: 'Primária · secundária · destaque (sem inventar cor de rival)',
      primary,
      secondary,
      actions,
      swatches: limitarSwatches([primary, secondary, destaque]),
      fonte: 'torcida',
    })
  }

  // 2) Escudo / logo da torcida
  const extraRaw = (opts.extraidas ?? []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
  // Identidade = torcida + clube; não usar o extrator como “permissão” de verde.
  const extra = filtrarVerdeForaDeContexto(extraRaw, identidadeBase)
  if (extra.length >= 2) {
    const primary = extra[0]
    const secondary = extra[1]
    const accents = extra.slice(2, 5)
    const actions = derivarAcoesDaMarca(primary, { secondary, accents })
    out.push({
      id: 'escudo',
      nome: 'Do escudo / logo',
      descricao: 'Extraído da imagem da torcida',
      primary,
      secondary,
      actions,
      swatches: limitarSwatches(extra),
      fonte: 'escudo',
    })
  }

  // 3) Clube afiliado
  if (opts.clube?.primary) {
    const primary = opts.clube.primary
    const secondary =
      opts.clube.secondary || derivarSuperficiesDaMarca(primary).secondary
    const accents = opts.clube.accents ?? []
    const actions = derivarAcoesDaMarca(primary, { secondary, accents })
    const destaque = destaqueDaPaleta(primary, secondary, opts.clube, actions.danger)
    out.push({
      id: 'clube',
      nome: 'Paleta do clube',
      descricao: 'Cores oficiais do time afiliado',
      primary,
      secondary,
      actions,
      swatches: limitarSwatches(
        filtrarVerdeForaDeContexto(
          [primary, secondary, destaque],
          [primary, secondary, ...accents],
        ),
      ),
      fonte: 'clube',
    })
  }

  // 4) Torcida + clube (quando há ambos e diferem)
  if (
    opts.clube?.primary &&
    opts.clube.primary.toLowerCase() !== seed.toLowerCase()
  ) {
    const primary = seed
    const secondary = opts.clube.secondary || opts.clube.primary
    const accents = [
      ...(opts.clube.accents ?? []),
      opts.clube.primary,
    ].filter((c, i, arr) => arr.indexOf(c) === i)
    const actions = derivarAcoesDaMarca(primary, { secondary, accents })
    const destaque = destaqueDaPaleta(primary, secondary, opts.clube, accents[0])
    out.push({
      id: 'torcida-clube',
      nome: 'Torcida + clube',
      descricao: 'Marca da torcida com apoio das cores do time',
      primary,
      secondary,
      actions,
      swatches: limitarSwatches(
        filtrarVerdeForaDeContexto(
          [primary, secondary, destaque],
          [...identidadeBase, primary, secondary, ...accents],
        ),
      ),
      fonte: 'torcida',
    })
  }

  // 5) Monocromática — só a família da marca (sem hue estrangeiro)
  {
    const achromatic = s < 0.08
    const primary = achromatic
      ? '#1a1a1a'
      : hslToHex(h, Math.max(0.2, s * 0.7), 0.28)
    const secondary = achromatic
      ? '#f4f4f5'
      : hslToHex(h, Math.max(0.1, s * 0.4), 0.72)
    const mid = achromatic ? '#737373' : hslToHex(h, s * 0.5, 0.45)
    const actions = derivarAcoesDaMarca(primary, { secondary: seedSecondary })
    out.push({
      id: 'mono',
      nome: 'Monocromática',
      descricao: 'Só a família da marca — sem cores de fora',
      primary: achromatic ? primary : clampHexLightness(primary, 0.15, 0.4),
      secondary: achromatic ? secondary : clampHexLightness(secondary, 0.55, 0.85),
      actions,
      swatches: limitarSwatches(
        achromatic
          ? ['#0a0a0a', mid, '#fafafa']
          : [hslToHex(h, s, 0.15), primary, secondary],
      ),
      fonte: 'harmonia',
    })
  }

  // 6) Alto contraste — leitura máxima; sucesso azul (não verde)
  {
    // Mantém a primária da marca (preto continua preto — sem clamp que inventa matiz).
    const primary = seed
    const actions = derivarAcoesDaMarca(primary, {
      secondary: '#ffffff',
      accents: opts.clube?.accents,
    })
    out.push({
      id: 'alto-contraste',
      nome: 'Alto contraste',
      descricao: 'Prioriza leitura — positivo sem verde forçado',
      primary,
      secondary: '#ffffff',
      actions,
      swatches: limitarSwatches(
        filtrarVerdeForaDeContexto(
          [primary, '#ffffff', actions.danger],
          identidadeBase,
        ),
      ),
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
