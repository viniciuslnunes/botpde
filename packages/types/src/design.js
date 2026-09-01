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
        /** Cor de arquirrival gravada na torcida. Null = padrao do catalogo. */
        arquirrival: hexOrNull.default(null),
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
    /** Vitrine do portal `/portal/loja/[tenantId]` — edita em `/admin/loja/vitrine` e no hover do portal (`store:manage`). */
    loja: LojaVitrineSchema.default({ ...DEFAULT_LOJA_VITRINE }),
  })
  .strict()

/** @typedef {z.infer<typeof TenantDesignSchema>} TenantDesign */
/** @typedef {z.infer<typeof LojaVitrineSchema>} LojaVitrine */

/** Defaults alinhados a `:root` / `.dark` em globals.css. */
/** WCAG AA texto normal. */
export const CONTRASTE_AA = 4.5
/** WCAG AA texto grande / chrome 14px+ bold. */
export const CONTRASTE_AA_GRANDE = 3
/** Fill vs superfície — abaixo disso o botão some (branco no claro, preto no escuro). */
export const CONTRASTE_FILL_MIN = 1.25
/** WCAG 1.4.11 componentes de UI (botão discernível do fundo). */
export const CONTRASTE_UI = 3
/** Wash de badge/soft no produto (`/_0.16`). É o par mais difícil: no claro
 *  o fundo escurece; no escuro clareia — texto de 10px precisa de 4.5:1 aqui. */
export const WASH_ACAO = 0.16

export const DEFAULT_SURFACE_LIGHT = /** @type {const} */ ({
  background: '#ffffff',
  backgroundSubtle: '#f9fafb',
  foreground: '#111827',
  foregroundMuted: '#4b5563',
  border: '#e5e7eb',
  borderStrong: '#9ca3af',
  surface: '#ffffff',
  surfaceRaised: '#f4f4f5',
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
  brand: { primary: '#7c3aed', secondary: null, arquirrival: null },
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
 * @param {unknown} corArquirrivalOuOpts
 * @returns {{
 *   corArquirrival?: string | null,
 *   slug?: string | null,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 * }}
 */
function parseResolveRivalOpts(corArquirrivalOuOpts) {
  if (corArquirrivalOuOpts == null) return {}
  if (typeof corArquirrivalOuOpts === 'string') {
    return { corArquirrival: corArquirrivalOuOpts }
  }
  if (typeof corArquirrivalOuOpts === 'object') {
    return /** @type {{ corArquirrival?: string | null, slug?: string | null, clubeNome?: string | null, clubeApelido?: string | null }} */ (
      corArquirrivalOuOpts
    )
  }
  return {}
}

/**
 * Recolore `actions.*` contra o arquirrival da unidade (info/aviso inclusos).
 * @param {TenantDesign} design
 * @param {{ corArquirrival?: string | null, slug?: string | null, clubeNome?: string | null, clubeApelido?: string | null }} extra
 * @returns {TenantDesign}
 */
function comAcoesSemRivalidade(design, extra = {}) {
  return {
    ...design,
    actions: sanearAcoesContraRivalidade(
      { ...DEFAULT_ACTIONS, ...design.actions },
      {
        corPrimaria: design.brand.primary,
        corArquirrival: extra.corArquirrival ?? design.brand.arquirrival,
        slug: extra.slug,
        clubeNome: extra.clubeNome,
        clubeApelido: extra.clubeApelido,
        design,
      },
    ),
  }
}

/**
 * Normaliza JSON do banco (ou null) + corPrimaria / corArquirrival legadas → TenantDesign válido.
 * Tokens de ação passam por `sanearAcoesContraRivalidade` (Galoucura não pinta
 * aviso/informativo com o azul da Máfia Azul).
 * @param {unknown} raw
 * @param {string} [corPrimaria]
 * @param {string | null | {
 *   corArquirrival?: string | null,
 *   slug?: string | null,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 * }} [corArquirrivalOuOpts] hex legado **ou** opts (slug para o catálogo)
 * @returns {TenantDesign}
 */
export function resolveTenantDesign(raw, corPrimaria, corArquirrivalOuOpts) {
  const extra = parseResolveRivalOpts(corArquirrivalOuOpts)
  const primary =
    typeof corPrimaria === 'string' && /^#[0-9a-fA-F]{6}$/.test(corPrimaria)
      ? corPrimaria
      : DEFAULT_TENANT_DESIGN.brand.primary
  const rival = asHexCor(extra.corArquirrival)

  if (raw == null || typeof raw !== 'object') {
    return comAcoesSemRivalidade(
      {
        ...DEFAULT_TENANT_DESIGN,
        brand: { primary, secondary: null, arquirrival: rival },
        actions: { ...DEFAULT_ACTIONS },
        actionsFg: { ...DEFAULT_ACTIONS_FG },
        brandFg: { ...DEFAULT_BRAND_FG },
        customPalettes: [],
        loja: { ...DEFAULT_LOJA_VITRINE },
      },
      extra,
    )
  }

  const parsed = TenantDesignSchema.safeParse(raw)
  if (parsed.success) {
    // Colunas do Tenant vencem o JSON se divergirem.
    return comAcoesSemRivalidade(
      {
        ...parsed.data,
        brand: {
          ...parsed.data.brand,
          primary,
          arquirrival: rival ?? parsed.data.brand.arquirrival ?? null,
        },
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
      },
      extra,
    )
  }

  // JSON legado sem `loja` (ou com chaves extras) — tenta recuperar capa da vitrine
  // sem perder a marca já salva.
  const loose = /** @type {Record<string, unknown>} */ (raw)
  const lojaLoose =
    loose.loja && typeof loose.loja === 'object'
      ? LojaVitrineSchema.safeParse(loose.loja)
      : null

  return comAcoesSemRivalidade(
    {
      ...DEFAULT_TENANT_DESIGN,
      brand: { primary, secondary: null, arquirrival: rival },
      actions: { ...DEFAULT_ACTIONS },
      actionsFg: { ...DEFAULT_ACTIONS_FG },
      brandFg: { ...DEFAULT_BRAND_FG },
      customPalettes: [],
      loja: lojaLoose?.success
        ? { ...DEFAULT_LOJA_VITRINE, ...lojaLoose.data }
        : { ...DEFAULT_LOJA_VITRINE },
    },
    extra,
  )
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
 * URL da capa visível no portal: banner próprio, ou foto do destaque se a
 * opção estiver ligada. `capaCustom` é o banner gravado (não o fallback).
 * @param {{ bannerUrl: string | null, usarDestaqueComoCapa: boolean }} vitrine
 * @param {string | null | undefined} destaqueImagemUrl
 * @returns {{ capaUrl: string | null, capaCustom: boolean }}
 */
export function resolverCapaLoja(vitrine, destaqueImagemUrl) {
  if (vitrine.bannerUrl) return { capaUrl: vitrine.bannerUrl, capaCustom: true }
  if (vitrine.usarDestaqueComoCapa && destaqueImagemUrl) {
    return { capaUrl: destaqueImagemUrl, capaCustom: false }
  }
  return { capaUrl: null, capaCustom: false }
}

/**
 * Monta um design a partir só da cor primária (sem overrides de superfície).
 * @param {string} primary
 * @param {string | null} [secondary]
 * @returns {TenantDesign}
 */
export function designFromPrimary(primary, secondary = null) {
  const sec =
    secondary && /^#[0-9a-fA-F]{6}$/.test(secondary) ? secondary : null
  const derived = derivarSuperficiesDaMarca(primary)
  return {
    ...DEFAULT_TENANT_DESIGN,
    brand: { primary, secondary: sec, arquirrival: null },
    actions: derivarAcoesDaMarca(primary, { secondary: sec }),
    light: derived.light,
    dark: derived.dark,
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
  bragantino: { primary: '#cc0000', secondary: '#ffffff', accents: ['#001e62'] },
  'red bull bragantino': { primary: '#cc0000', secondary: '#ffffff', accents: ['#001e62'] },
  nautico: { primary: '#d21034', secondary: '#ffffff' },
  'ponte preta': { primary: '#000000', secondary: '#ffffff' },
  vitoria: { primary: '#e30613', secondary: '#000000' },
  vitória: { primary: '#e30613', secondary: '#000000' },
  cuiaba: { primary: '#006b3f', secondary: '#ffd100' },
  cuiabá: { primary: '#006b3f', secondary: '#ffd100' },
  juventude: { primary: '#006b3f', secondary: '#ffffff' },
}

/**
 * Nomes oficiais / aliases → chave de `CLUBE_PALETAS`.
 * Sem substring curta (`sport` dentro de “Sport Club Corinthians”).
 * @type {Record<string, string>}
 */
export const CLUBE_PALETA_ALIASES = {
  'sport club corinthians paulista': 'corinthians',
  'sport club internacional': 'internacional',
  'sociedade esportiva palmeiras': 'palmeiras',
  'sao paulo futebol clube': 'sao paulo',
  'clube de regatas do flamengo': 'flamengo',
  'clube de regatas flamengo': 'flamengo',
  'club de regatas vasco da gama': 'vasco',
  'vasco da gama': 'vasco',
  'fluminense football club': 'fluminense',
  'botafogo de futebol e regatas': 'botafogo',
  'santos futebol clube': 'santos',
  'clube atletico mineiro': 'atletico-mg',
  'atletico mineiro': 'atletico-mg',
  'atletico mg': 'atletico-mg',
  'gremio foot ball porto alegrense': 'gremio',
  'clube atletico paranaense': 'athletico-pr',
  'athletico paranaense': 'athletico-pr',
  'athletico pr': 'athletico-pr',
  'america mineiro': 'america-mg',
  'america mg': 'america-mg',
  'coritiba foot ball club': 'coritiba',
  'ceara sporting clube': 'ceara',
  'ceara sporting club': 'ceara',
  'sport club do recife': 'sport',
  'sociedade esportiva recreativa caxias do sul': 'caxias',
  'caxias futebol clube': 'caxias',
  'associacao atletica ponte preta': 'ponte preta',
  'clube nautico capiberibe': 'nautico',
  'nautico capibaribe': 'nautico',
  'red bull bragantino': 'bragantino',
  'esporte clube vitoria': 'vitoria',
  'esporte clube juventude': 'juventude',
  'cuiaba esporte clube': 'cuiaba',
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
 * Slug da torcida → chave de `CLUBE_PALETAS`. Fallback quando a afiliação
 * ainda não veio no request; a cor de rival sai daqui + `CLUBE_ARQUIRRIVAIS`.
 * @type {Record<string, string>}
 */
export const TORCIDA_CLUBE_CHAVE = {
  'pde-gavioes-fiel': 'corinthians',
  'camisa-12-corinthians': 'corinthians',
  'pavilhao-nove': 'corinthians',
  'mancha-alviverde': 'palmeiras',
  'tup-palmeiras': 'palmeiras',
  'tti-sao-paulo': 'sao paulo',
  'dragoes-da-real': 'sao paulo',
  'torcida-jovem-santos': 'santos',
  'furia-independente-guarani': 'guarani',
  'raca-tricolor-paulista': 'paulista',
  'torcida-jovem-flamengo': 'flamengo',
  'raca-rubro-negra': 'flamengo',
  'forca-jovem-vasco': 'vasco',
  'young-flu': 'fluminense',
  'forca-flu': 'fluminense',
  'furia-jovem-botafogo': 'botafogo',
  galoucura: 'atletico-mg',
  'mafia-azul': 'cruzeiro',
  'pavilhao-independente-cruzeiro': 'cruzeiro',
  'seita-verde': 'america-mg',
  'geral-do-gremio': 'gremio',
  'torcida-jovem-gremio': 'gremio',
  'camisa-12-inter': 'internacional',
  'falange-grena-caxias': 'caxias',
  'imperio-alviverde': 'coritiba',
  'furia-caterva': 'athletico-pr',
  'torcida-jovem-avai': 'avai',
  'torcida-jovem-figueirense': 'figueirense',
  'trem-bala-fortaleza': 'fortaleza',
  'esquadrao-tricolor-bahia': 'bahia',
  'barra-brava-sport': 'sport',
  'inferno-verde-goias': 'goias',
}

/**
 * Arquirrivais para cor de UI (clássicos que isolam). Não é o grafo completo
 * de `RivalidadeClube` — só o hue que pinta a casa do outro. A ordem importa:
 * `proporCorArquirrival` pula quem é alvinegro (Santos × Corinthians) e pega
 * o próximo com hue distinto (Palmeiras / Mancha verde). Accent do rival P&B
 * (bordo corinthiano) não conta — identidade é primária/secundária.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const CLUBE_ARQUIRRIVAIS = Object.freeze({
  corinthians: ['palmeiras'],
  palmeiras: ['corinthians'],
  'sao paulo': ['palmeiras', 'corinthians'],
  santos: ['corinthians', 'palmeiras'],
  flamengo: ['fluminense', 'vasco'],
  fluminense: ['flamengo', 'vasco', 'botafogo'],
  vasco: ['flamengo', 'fluminense'],
  botafogo: ['flamengo', 'fluminense', 'vasco'],
  gremio: ['internacional'],
  internacional: ['gremio'],
  'atletico-mg': ['cruzeiro', 'america-mg'],
  cruzeiro: ['atletico-mg', 'america-mg'],
  'america-mg': ['atletico-mg', 'cruzeiro'],
  bahia: ['vitoria'],
  vitoria: ['bahia'],
  fortaleza: ['ceara'],
  ceara: ['fortaleza'],
  coritiba: ['athletico-pr'],
  'athletico-pr': ['coritiba'],
  sport: ['nautico'],
  nautico: ['sport'],
  avai: ['figueirense'],
  figueirense: ['avai'],
  guarani: ['ponte preta'],
  'ponte preta': ['guarani'],
})

/**
 * Cor de arquirrival curada por clube — dado, não palpite de paleta.
 * Vence o walk quando a chave existe: hex = tabu; `null` = sem tabu extra
 * (Cruzeiro × Galo P&B não inventa verde América). Clube ausente do mapa
 * cai em `proporCorArquirrival`. Hex = a cor que a UI não pinta (Gaviões:
 * verde Palmeiras).
 * @type {Readonly<Record<string, string | null>>}
 */
export const CLUBE_COR_ARQUIRRIVAL = Object.freeze({
  corinthians: '#006437',
  palmeiras: null,
  'sao paulo': '#006437',
  santos: '#006437',
  flamengo: '#006633',
  fluminense: '#c8102e',
  vasco: '#c8102e',
  botafogo: '#c8102e',
  gremio: '#e30613',
  internacional: '#0080c8',
  'atletico-mg': '#003da5',
  cruzeiro: null,
  'america-mg': null,
  bahia: null,
  vitoria: '#003da5',
  fortaleza: null,
  ceara: '#e30613',
  coritiba: '#e30613',
  'athletico-pr': '#006b3f',
  sport: null,
  nautico: '#e30613',
  avai: null,
  figueirense: '#0066cc',
  guarani: null,
  'ponte preta': '#006b3f',
  goias: null,
})

/**
 * Override por slug da torcida quando o tabu nao e o do clube.
 * Vazio de proposito — preencha so excecao.
 * @type {Readonly<Record<string, string>>}
 */
export const TORCIDA_COR_ARQUIRRIVAL = Object.freeze({})

/**
 * Hex de arquirrival efetivo: override da unidade, JSON do design, slug,
 * mapa curado do clube (hex ou `null` explícito), senão o walk
 * `proporCorArquirrival` (pula clássico alvinegro).
 * @param {{
 *   corArquirrival?: string | null,
 *   slug?: string | null,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 *   design?: unknown,
 * }} [opts]
 * @returns {string | null}
 */
export function corArquirrivalCatalogo(opts = {}) {
  const gravada =
    typeof opts.corArquirrival === 'string' && /^#[0-9a-fA-F]{6}$/.test(opts.corArquirrival)
      ? opts.corArquirrival
      : null
  if (gravada) return gravada.toLowerCase()
  const design = opts.design && typeof opts.design === 'object' ? opts.design : null
  const doDesign =
    design && 'brand' in /** @type {object} */ (design)
      ? /** @type {{ brand?: { arquirrival?: unknown } }} */ (design).brand?.arquirrival
      : null
  if (typeof doDesign === 'string' && /^#[0-9a-fA-F]{6}$/.test(doDesign)) {
    return doDesign.toLowerCase()
  }
  if (opts.slug && TORCIDA_COR_ARQUIRRIVAL[opts.slug]) {
    return TORCIDA_COR_ARQUIRRIVAL[opts.slug].toLowerCase()
  }
  const key =
    chavePaletaClube(opts.clubeNome, opts.clubeApelido) ??
    (opts.slug ? TORCIDA_CLUBE_CHAVE[opts.slug] : null) ??
    null
  if (key && Object.prototype.hasOwnProperty.call(CLUBE_COR_ARQUIRRIVAL, key)) {
    const hex = CLUBE_COR_ARQUIRRIVAL[key]
    return typeof hex === 'string' ? hex.toLowerCase() : null
  }
  const proposta = proporCorArquirrival(opts)
  return proposta.hex
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
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Casa nome/apelido oficial com o catálogo — chave exata, alias, hífen,
 * depois a chave mais longa como palavra inteira (nunca `sport` dentro de
 * “Sport Club Corinthians”).
 */
function lookupChavePaletaClube(normalized) {
  if (!normalized) return null
  if (CLUBE_PALETAS[normalized]) return normalized
  const aliased = CLUBE_PALETA_ALIASES[normalized]
  if (aliased && CLUBE_PALETAS[aliased]) return aliased
  const hyphen = normalized.replace(/\s+/g, '-')
  if (hyphen !== normalized && CLUBE_PALETAS[hyphen]) return hyphen
  let bestKey = /** @type {string | null} */ (null)
  let bestLen = 0
  for (const k of Object.keys(CLUBE_PALETAS)) {
    if (k.length < 4 || k.length <= bestLen) continue
    const re = new RegExp(`(?:^|\\s)${escapeRegex(k)}(?:\\s|$)`)
    if (re.test(normalized)) {
      bestKey = k
      bestLen = k.length
    }
  }
  return bestKey
}

function lookupPaletaClube(normalized) {
  const key = lookupChavePaletaClube(normalized)
  return key ? CLUBE_PALETAS[key] : null
}

/**
 * Chave de `CLUBE_PALETAS` a partir do nome/apelido da afiliação.
 * @param {string | null | undefined} nome
 * @param {string | null | undefined} apelido
 * @returns {string | null}
 */
export function chavePaletaClube(nome, apelido) {
  const candidates = [apelido, nome].filter(Boolean)
  for (const c of candidates) {
    const key = lookupChavePaletaClube(normalizeClubeKey(/** @type {string} */ (c)))
    if (key) return key
  }
  return null
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
    const hit = lookupPaletaClube(key)
    if (hit) {
      return {
        primary: hit.primary,
        secondary: hit.secondary,
        accents: hit.accents ?? [],
        fonte: 'clube',
      }
    }
  }
  return null
}

/**
 * Pastel de alta L / baixa C no hue da marca — tint de papel, não mistura do
 * hex escuro no branco (isso virava cinza sujo e derrubava o muted).
 * Neutros (P&B) não tingem o claro.
 * @param {string} primaryHex
 * @returns {string | null}
 */
function pastelDaMarca(primaryHex) {
  const { h, s } = hexToHsl(primaryHex)
  if (s < 0.08) return null
  return hslToHex(h, Math.min(s, 0.22) * 0.42, 0.96)
}

/**
 * Sombra cromática para o tema escuro. Neutros ficam no zinc.
 * @param {string} primaryHex
 * @returns {string | null}
 */
function sombraDaMarca(primaryHex) {
  const { h, s } = hexToHsl(primaryHex)
  if (s < 0.08) return null
  return hslToHex(h, Math.min(s, 0.28) * 0.48, 0.11)
}

/**
 * Completa um modo (claro/escuro): garante texto 4.5:1 em todas as superfícies
 * e bordas visíveis. Não reescreve os fundos passados.
 * @param {'light' | 'dark'} mode
 * @param {Partial<Record<SurfaceTokenKey, string>>} partial
 * @returns {Record<SurfaceTokenKey, string>}
 */
export function completarSuperficies(mode, partial = {}) {
  const defaults = mode === 'dark' ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT
  const s = { ...defaults, ...partial }
  const papers = [s.background, s.backgroundSubtle, s.surface, s.surfaceRaised]
  let fg = s.foreground
  let muted = s.foregroundMuted
  for (const paper of papers) {
    fg = ajustarParaContraste(fg, paper, CONTRASTE_AA)
    muted = ajustarParaContraste(muted, paper, CONTRASTE_AA)
  }
  let border = s.border
  if (contrasteRatio(border, s.background) < 1.3) {
    border = mixHex(s.background, fg, mode === 'dark' ? 0.18 : 0.12)
  }
  let borderStrong = s.borderStrong
  if (contrasteRatio(borderStrong, s.background) < 1.5) {
    borderStrong = mixHex(s.background, fg, mode === 'dark' ? 0.32 : 0.22)
  }
  return {
    background: s.background,
    backgroundSubtle: s.backgroundSubtle,
    foreground: fg,
    foregroundMuted: muted,
    border,
    borderStrong,
    surface: s.surface,
    surfaceRaised: s.surfaceRaised,
  }
}

/**
 * Superfícies dos dois temas a partir da primária.
 * Claro: papel alto-L (pastel do hue, ou branco puro se P&B) + texto AA.
 * Escuro: zinc com sombra cromática + texto AA.
 * @param {string} primaryHex
 * @returns {{ light: Record<SurfaceTokenKey, string>, dark: Record<SurfaceTokenKey, string>, secondary: string }}
 */
export function derivarSuperficiesDaMarca(primaryHex) {
  const secondary = contrasteTextoSobre(primaryHex) === 'light' ? '#ffffff' : '#0a0a0a'
  const pastel = pastelDaMarca(primaryHex)
  const sombra = sombraDaMarca(primaryHex)

  const light = completarSuperficies('light', {
    background: pastel ? mixHex('#ffffff', pastel, 0.55) : '#ffffff',
    backgroundSubtle: pastel ? mixHex('#f9fafb', pastel, 0.7) : '#f9fafb',
    surface: pastel ? mixHex('#ffffff', pastel, 0.4) : '#ffffff',
    surfaceRaised: pastel ? mixHex('#f4f4f5', pastel, 0.65) : '#f4f4f5',
  })
  const dark = completarSuperficies('dark', {
    background: sombra ? mixHex('#09090b', sombra, 0.55) : '#09090b',
    backgroundSubtle: sombra ? mixHex('#18181b', sombra, 0.45) : '#18181b',
    surface: sombra ? mixHex('#18181b', sombra, 0.4) : '#18181b',
    surfaceRaised: sombra ? mixHex('#27272a', sombra, 0.4) : '#27272a',
  })

  return { secondary, light, dark }
}

/**
 * Resolve tokens de superfície do modo ativo.
 * Override do tenant ganha; buracos vêm da marca (não do cinza da plataforma)
 * e o texto não definido é saneado contra os fundos efetivos.
 * @param {{ brand?: { primary?: string }, light?: Record<string, string>, dark?: Record<string, string> }} design
 * @param {'light' | 'dark'} mode
 * @returns {Record<SurfaceTokenKey, string>}
 */
export function resolverSuperficies(design, mode) {
  const primary =
    typeof design.brand?.primary === 'string' && /^#[0-9a-fA-F]{6}$/.test(design.brand.primary)
      ? design.brand.primary
      : DEFAULT_TENANT_DESIGN.brand.primary
  const derived = derivarSuperficiesDaMarca(primary)[mode]
  const overrides = /** @type {Record<string, string | undefined>} */ (
    (mode === 'dark' ? design.dark : design.light) ?? {}
  )
  const merged = { ...derived, ...overrides }
  const userSet = (/** @type {SurfaceTokenKey} */ key) =>
    typeof overrides[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(overrides[key])
  const papers = [
    merged.background,
    merged.backgroundSubtle,
    merged.surface,
    merged.surfaceRaised,
  ]
  let fg = merged.foreground
  let muted = merged.foregroundMuted
  if (!userSet('foreground')) {
    for (const paper of papers) fg = ajustarParaContraste(fg, paper, CONTRASTE_AA)
  }
  if (!userSet('foregroundMuted')) {
    for (const paper of papers) muted = ajustarParaContraste(muted, paper, CONTRASTE_AA)
  }
  let border = merged.border
  let borderStrong = merged.borderStrong
  if (!userSet('border') && contrasteRatio(border, merged.background) < 1.3) {
    border = mixHex(merged.background, fg, mode === 'dark' ? 0.18 : 0.12)
  }
  if (!userSet('borderStrong') && contrasteRatio(borderStrong, merged.background) < 1.5) {
    borderStrong = mixHex(merged.background, fg, mode === 'dark' ? 0.32 : 0.22)
  }
  return {
    background: merged.background,
    backgroundSubtle: merged.backgroundSubtle,
    foreground: fg,
    foregroundMuted: muted,
    border,
    borderStrong,
    surface: merged.surface,
    surfaceRaised: merged.surfaceRaised,
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
  return filtrarCoresDeRival(hexes, { identidadeHexes })
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asHexCor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null
}

/**
 * Hexes que definem a identidade (marca + catálogo da torcida + clube).
 * @param {{
 *   slug?: string | null,
 *   corPrimaria?: string | null,
 *   design?: unknown,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 *   clube?: { primary: string, secondary: string, accents?: string[] } | null,
 * }} [opts]
 * @returns {string[]}
 */
export function hexesIdentidadeMarca(opts = {}) {
  /** @type {string[]} */
  const out = []
  /** @param {unknown} v */
  const push = (v) => {
    const hex = asHexCor(v)
    if (hex) out.push(hex)
  }
  push(opts.corPrimaria)
  if (opts.slug && TORCIDA_CORES_PRIMARIAS[opts.slug]) {
    push(TORCIDA_CORES_PRIMARIAS[opts.slug])
  }
  const design = opts.design && typeof opts.design === 'object' ? opts.design : null
  const brand =
    design && 'brand' in /** @type {object} */ (design)
      ? /** @type {{ primary?: unknown, secondary?: unknown, accents?: unknown }} */ (
          /** @type {{ brand?: unknown }} */ (design).brand
        )
      : null
  if (brand && typeof brand === 'object') {
    push(brand.primary)
    push(brand.secondary)
    if (Array.isArray(brand.accents)) brand.accents.forEach(push)
  }
  const clube = opts.clube ?? paletaDoClube(opts.clubeNome, opts.clubeApelido)
  if (clube) {
    push(clube.primary)
    push(clube.secondary)
    for (const accent of clube.accents ?? []) push(accent)
  }
  return out
}

/**
 * Paletas dos arquirrivais (clássicos) a partir do clube ou do slug da torcida.
 * @param {{
 *   slug?: string | null,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 * }} [opts]
 * @returns {Array<{ primary: string, secondary: string, accents?: string[] }>}
 */
export function paletasArquirrivais(opts = {}) {
  const key =
    chavePaletaClube(opts.clubeNome, opts.clubeApelido) ??
    (opts.slug ? TORCIDA_CLUBE_CHAVE[opts.slug] : null) ??
    null
  if (!key) return []
  const rivais = CLUBE_ARQUIRRIVAIS[key] ?? []
  /** @type {Array<{ primary: string, secondary: string, accents?: string[] }>} */
  const out = []
  for (const rivalKey of rivais) {
    const paleta = CLUBE_PALETAS[rivalKey]
    if (paleta) out.push(paleta)
  }
  return out
}

/** Nome curto para copy do estúdio Design. */
export const CLUBE_ROTULO = Object.freeze({
  corinthians: 'Corinthians',
  palmeiras: 'Palmeiras',
  santos: 'Santos',
  'sao paulo': 'São Paulo',
  flamengo: 'Flamengo',
  fluminense: 'Fluminense',
  vasco: 'Vasco',
  botafogo: 'Botafogo',
  gremio: 'Grêmio',
  internacional: 'Internacional',
  'atletico-mg': 'Atlético-MG',
  cruzeiro: 'Cruzeiro',
  'america-mg': 'América-MG',
  bahia: 'Bahia',
  vitoria: 'Vitória',
  fortaleza: 'Fortaleza',
  ceara: 'Ceará',
  coritiba: 'Coritiba',
  'athletico-pr': 'Athletico-PR',
  sport: 'Sport',
  nautico: 'Náutico',
  avai: 'Avaí',
  figueirense: 'Figueirense',
  guarani: 'Guarani',
  'ponte preta': 'Ponte Preta',
  goias: 'Goiás',
})

/**
 * @param {string | null | undefined} chave
 * @returns {string}
 */
export function rotuloClubeChave(chave) {
  if (!chave) return ''
  return CLUBE_ROTULO[chave] ?? chave
}

/**
 * Identidade só P&B / cinza — clássico alvinegro não gera hue a isolar.
 * @param {{ primary: string, secondary: string, accents?: string[] } | null | undefined} paleta
 */
function paletaIdentidadeEhNeutra(paleta) {
  if (!paleta) return true
  return !familiaHueCromatica(paleta.primary) && !familiaHueCromatica(paleta.secondary)
}

/**
 * Primeira cor cromática da camisa (primária/secundária — sem accent).
 * @param {{ primary: string, secondary: string, accents?: string[] }} paleta
 * @returns {string | null}
 */
function hexIdentidadeCromatica(paleta) {
  for (const hex of [paleta.primary, paleta.secondary]) {
    if (typeof hex === 'string' && familiaHueCromatica(hex)) return hex.toLowerCase()
  }
  return null
}

/**
 * Percorre a lista de arquirrivais: pula quem é alvinegro (mesma casa P&B, ou
 * sem hue para isolar) e quem já é a cor da própria camisa. O primeiro hue
 * distinto vira a proposta (Santos × Corinthians → Palmeiras / Mancha verde).
 *
 * @param {{
 *   slug?: string | null,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 *   corPrimaria?: string | null,
 *   design?: unknown,
 *   clube?: { primary: string, secondary: string, accents?: string[] } | null,
 * }} [opts]
 * @returns {{
 *   hex: string | null,
 *   clubeChave: string | null,
 *   rivalChave: string | null,
 *   rivalRotulo: string | null,
 *   pulados: Array<{ chave: string, rotulo: string }>,
 *   mesmoAlvinegro: boolean,
 * }}
 */
export function proporCorArquirrival(opts = {}) {
  const clubeChave =
    chavePaletaClube(opts.clubeNome, opts.clubeApelido) ??
    (opts.slug ? TORCIDA_CLUBE_CHAVE[opts.slug] : null) ??
    null
  const casa = clubeChave ? CLUBE_PALETAS[clubeChave] : null
  /** @type {Set<string>} */
  const own = new Set()
  for (const hex of hexesIdentidadeMarca({
    ...opts,
    clube: opts.clube ?? casa ?? undefined,
  })) {
    const fam = familiaHueCromatica(hex)
    if (fam) own.add(fam)
  }
  const casaNeutra = paletaIdentidadeEhNeutra(casa)
  /** @type {Array<{ chave: string, rotulo: string }>} */
  const pulados = []
  const vazio = {
    hex: /** @type {string | null} */ (null),
    clubeChave,
    rivalChave: /** @type {string | null} */ (null),
    rivalRotulo: /** @type {string | null} */ (null),
    pulados,
    mesmoAlvinegro: false,
  }
  if (!clubeChave) return vazio

  for (const rivalKey of CLUBE_ARQUIRRIVAIS[clubeChave] ?? []) {
    const paleta = CLUBE_PALETAS[rivalKey]
    const rotulo = rotuloClubeChave(rivalKey)
    if (!paleta || paletaIdentidadeEhNeutra(paleta)) {
      pulados.push({ chave: rivalKey, rotulo })
      continue
    }
    const hex = hexIdentidadeCromatica(paleta)
    const fam = hex ? familiaHueCromatica(hex) : null
    if (!hex || !fam || own.has(fam)) {
      pulados.push({ chave: rivalKey, rotulo })
      continue
    }
    return {
      hex,
      clubeChave,
      rivalChave: rivalKey,
      rivalRotulo: rotulo,
      pulados,
      mesmoAlvinegro: casaNeutra && pulados.length > 0,
    }
  }

  return {
    ...vazio,
    pulados,
    mesmoAlvinegro: casaNeutra && pulados.length > 0,
  }
}

/**
 * Hue cromático agrupado para rivalidade. Neutro (P&B/cinza) retorna null —
 * preto e branco compartilhados nunca são “cor de rival”.
 * @param {string} hex
 * @returns {'verde' | 'teal' | 'azul' | 'roxo' | 'magenta' | 'vermelho' | 'laranja' | 'amarelo' | null}
 */
export function familiaHueCromatica(hex) {
  const parsed = asHexCor(hex)
  if (!parsed) return null
  const { h, s } = hexToHsl(parsed)
  if (s < 0.18) return null
  // Mesma faixa de `isVerdeIdentidade` (verde de campo / Palmeiras).
  if (h >= 85 && h <= 165) return 'verde'
  if (h > 165 && h <= 200) return 'teal'
  if (h > 200 && h < 255) return 'azul'
  if (h >= 255 && h < 290) return 'roxo'
  if (h >= 290 && h < 345) return 'magenta'
  if (h >= 345 || h < 15) return 'vermelho'
  if (h >= 15 && h < 45) return 'laranja'
  if (h >= 45 && h < 85) return 'amarelo'
  return null
}

/**
 * Famílias cromáticas da identidade × famílias da cor de arquirrival gravada.
 * Só o hue do arquirrival é tabu (Galoucura: azul da Máfia; Gaviões: verde
 * Palmeiras). Verde de aliada (Mancha × Galoucura) não é bloqueado.
 * @param {string[]} identidadeHexes
 * @param {string[]} [coresArquirrival]
 * @returns {Set<string>}
 */
export function familiasProibidasPorRivalidade(identidadeHexes = [], coresArquirrival = []) {
  /** @type {Set<string>} */
  const own = new Set()
  for (const hex of identidadeHexes) {
    const fam = familiaHueCromatica(hex)
    if (fam) own.add(fam)
  }
  /** @type {Set<string>} */
  const forbidden = new Set()
  for (const hex of coresArquirrival) {
    const fam = familiaHueCromatica(hex)
    if (fam && !own.has(fam)) forbidden.add(fam)
  }
  // Azul e teal leem como a mesma casa (Cruzeiro / Grêmio / Máfia Azul).
  if (forbidden.has('azul') && !own.has('teal')) forbidden.add('teal')
  if (forbidden.has('teal') && !own.has('azul')) forbidden.add('azul')
  return forbidden
}

/**
 * Remove cores cuja família é do arquirrival (ou verde fora de contexto).
 * @param {string[]} hexes
 * @param {{
 *   identidadeHexes?: string[],
 *   paletasRivais?: Array<{ primary: string, secondary: string, accents?: string[] }>,
 *   slug?: string | null,
 *   corPrimaria?: string | null,
 *   design?: unknown,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 * }} [opts]
 * @returns {string[]}
 */
export function filtrarCoresDeRival(hexes, opts = {}) {
  const identidade = opts.identidadeHexes ?? hexesIdentidadeMarca(opts)
  const tabu = corArquirrivalCatalogo(opts)
  const forbidden = familiasProibidasPorRivalidade(identidade, tabu ? [tabu] : [])
  return hexes.filter((c) => {
    if (!asHexCor(c)) return false
    const fam = familiaHueCromatica(c)
    return !fam || !forbidden.has(fam)
  })
}

/**
 * Recolore um hex de UI (card de departamento, badge) para não pintar a casa
 * com a cor do arquirrival. Preserva S/L e gira o hue até uma família permitida.
 * @param {string} hex
 * @param {{
 *   identidadeHexes?: string[],
 *   paletasRivais?: Array<{ primary: string, secondary: string, accents?: string[] }>,
 *   slug?: string | null,
 *   corPrimaria?: string | null,
 *   corArquirrival?: string | null,
 *   design?: unknown,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 *   clube?: { primary: string, secondary: string, accents?: string[] } | null,
 * }} [opts]
 * @returns {string}
 */
export function resolverCorSemRivalidade(hex, opts = {}) {
  const parsed = asHexCor(hex)
  if (!parsed) return hex
  const identidade = opts.identidadeHexes ?? hexesIdentidadeMarca(opts)
  const tabu = corArquirrivalCatalogo(opts)
  const forbidden = familiasProibidasPorRivalidade(identidade, tabu ? [tabu] : [])
  const fam = familiaHueCromatica(parsed)
  if (!fam || !forbidden.has(fam)) return parsed.toLowerCase()

  const { h, s, l } = hexToHsl(parsed)
  for (const delta of [180, 150, 210, 120, 240, 90, 270, 60, 300]) {
    const candidate = hslToHex((h + delta) % 360, s, l)
    const nextFam = familiaHueCromatica(candidate)
    if (nextFam && !forbidden.has(nextFam)) return candidate.toLowerCase()
  }
  return hslToHex(0, 0, l).toLowerCase()
}

/**
 * Recolore o jogo de tokens de ação para não pintar a casa com a família do
 * arquirrival (nem verde de campo fora de contexto). Gira o hue até uma
 * família permitida e **distinta** das outras ações — info não cai no
 * warning, success não vira o mesmo laranja.
 *
 * Ordem: danger → warning (semântica estável) → success → info.
 *
 * @param {{ success: string, danger: string, warning: string, info: string }} actions
 * @param {{
 *   identidadeHexes?: string[],
 *   slug?: string | null,
 *   corPrimaria?: string | null,
 *   corArquirrival?: string | null,
 *   design?: unknown,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 *   clube?: { primary: string, secondary: string, accents?: string[] } | null,
 * }} [opts]
 * @returns {{ success: string, danger: string, warning: string, info: string }}
 */
export function sanearAcoesContraRivalidade(actions, opts = {}) {
  const identidade = opts.identidadeHexes ?? hexesIdentidadeMarca(opts)
  const tabu = corArquirrivalCatalogo(opts)
  const forbidden = familiasProibidasPorRivalidade(identidade, tabu ? [tabu] : [])
  /** @type {Set<string>} */
  const used = new Set()

  /**
   * @param {string} hex
   * @param {boolean} [preferVerde] sucesso/positivo: Mancha é aliada da Galoucura
   */
  const remap = (hex, preferVerde = false) => {
    const parsed = asHexCor(hex)
    if (!parsed) return hex
    const fam = familiaHueCromatica(parsed)
    // Família permitida permanece mesmo se outra ação já a usa (success e
    // info default são os dois azuis). Só evita colisão ao girar o hue.
    if (!fam || !forbidden.has(fam)) {
      if (fam) used.add(fam)
      return parsed.toLowerCase()
    }
    const { s, l } = hexToHsl(parsed)
    if (preferVerde && !forbidden.has('verde') && !used.has('verde')) {
      used.add('verde')
      return hslToHex(145, Math.max(s, 0.5), Math.min(Math.max(l, 0.32), 0.48)).toLowerCase()
    }
    const { h } = hexToHsl(parsed)
    for (const delta of [180, 150, 210, 120, 240, 90, 270, 60, 300, 30, 330]) {
      const candidate = hslToHex((h + delta) % 360, Math.max(s, 0.42), l)
      const nextFam = familiaHueCromatica(candidate)
      if (nextFam && !forbidden.has(nextFam) && !used.has(nextFam)) {
        used.add(nextFam)
        return candidate.toLowerCase()
      }
    }
    return hslToHex(0, 0, l).toLowerCase()
  }

  return {
    danger: remap(actions.danger),
    warning: remap(actions.warning),
    success: remap(actions.success, true),
    info: remap(actions.info),
  }
}

/**
 * Texto de marca legível sobre superfície (badges / soft / links).
 * Ajusta L no hue até fechar o contraste — neutros continuam P&B (sem marrom).
 * @param {string} brandHex
 * @param {string} surfaceHex
 * @param {number} [minRatio]
 * @returns {string}
 */
export function corMarcaLegivel(brandHex, surfaceHex, minRatio = CONTRASTE_AA) {
  return ajustarParaContraste(brandHex, surfaceHex, minRatio)
}

/**
 * Texto de botão sólido (`on`) e de badge/soft/link (`fg`) para uma ação.
 *
 * - Automático: `on` é branco ou preto conforme o ratio real no fill (não o
 *   cutoff 0.4 de luminância); `fg` precisa fechar 4.5:1 na superfície (KPI)
 *   e 4.5:1 no wash do badge (10px). `fill` é o hex visível naquele tema.
 * - Override manual: só vale onde o contraste fecha; senão volta ao auto —
 *   assim um branco no botão escuro não quebra o badge no claro.
 *
 * @param {string} actionHex
 * @param {string | null | undefined} overrideHex
 * @param {string} surfaceHex superfície do modo ativo (light/dark)
 * @returns {{ on: string, fg: string, fill: string }}
 */
export function resolveActionTextColors(actionHex, overrideHex, surfaceHex) {
  const fill = resolverFillDaMarca(actionHex, surfaceHex)
  const autoOn = textoSobreFill(fill)
  const papers = [
    surfaceHex,
    mixHex(surfaceHex, fill, 0.1),
    mixHex(surfaceHex, fill, 0.14),
    mixHex(surfaceHex, fill, WASH_ACAO),
  ]
  let autoFg = actionHex
  for (let round = 0; round < 2; round++) {
    for (const paper of papers) {
      autoFg = ajustarParaContraste(autoFg, paper, CONTRASTE_AA)
    }
  }

  if (typeof overrideHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(overrideHex)) {
    const onOk = contrasteRatio(overrideHex, fill) >= CONTRASTE_AA
    const fgOk = papers.every((p) => contrasteRatio(overrideHex, p) >= CONTRASTE_AA)
    return {
      on: onOk ? overrideHex : autoOn,
      fg: fgOk ? overrideHex : autoFg,
      fill,
    }
  }

  return { on: autoOn, fg: autoFg, fill }
}

/**
 * Deriva cores de ação a partir da marca/clube.
 * Verde de sucesso só se a identidade já for verde. Quando o arquirrival é
 * outra família (Galoucura × azul), `sanearAcoesContraRivalidade` recolore o
 * sucesso default (azul) para verde de aliada. Gaviões permanece sem verde.
 * @param {string} primaryHex
 * @param {{
 *   secondary?: string | null,
 *   accents?: string[],
 *   slug?: string | null,
 *   corArquirrival?: string | null,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 *   identidadeHexes?: string[],
 * }} [opts]
 */
export function derivarAcoesDaMarca(primaryHex, opts = {}) {
  const { h } = hexToHsl(primaryHex)
  const verdesNaMarca = [primaryHex, opts.secondary, ...(opts.accents ?? [])]
    .filter(Boolean)
    .filter(isVerdeIdentidade)
  const marcaEhVerde = verdesNaMarca.length > 0
  const identidade = opts.identidadeHexes ?? hexesIdentidadeMarca({ ...opts, corPrimaria: primaryHex })
  const tabu = corArquirrivalCatalogo({ ...opts, corPrimaria: primaryHex })
  const forbidden = familiasProibidasPorRivalidade(identidade, tabu ? [tabu] : [])

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
  const info = !forbidden.has('azul')
    ? clampHexLightness(mixHex('#2563eb', primaryHex, 0.3), 0.28, 0.55)
    : clampHexLightness(mixHex('#a21caf', primaryHex, 0.25), 0.28, 0.55)

  return sanearAcoesContraRivalidade(
    { success, danger, warning, info },
    { ...opts, corPrimaria: primaryHex },
  )
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
 *   slug?: string | null,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 *   corArquirrival?: string | null,
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
    slug: spec.slug,
    clubeNome: spec.clubeNome,
    clubeApelido: spec.clubeApelido,
    corArquirrival: spec.corArquirrival,
    identidadeHexes: identidade,
    corPrimaria: spec.primary,
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
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 *   corArquirrival?: string | null,
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

  /** @param {Parameters<typeof fecharPaletaSugerida>[0]} spec */
  const fechar = (spec) =>
    fecharPaletaSugerida({
      ...spec,
      slug: opts.slug,
      clubeNome: opts.clubeNome,
      clubeApelido: opts.clubeApelido,
      corArquirrival: opts.corArquirrival,
    })

  const descricaoMarca =
    marca.fonte === 'catalogo'
      ? 'Cores curadas desta torcida (não o roxo padrão da plataforma)'
      : marca.fonte === 'clube'
        ? 'Ainda sem cor própria — usando a paleta do clube afiliado'
        : marca.fonte === 'plataforma'
          ? 'Padrão da plataforma — personalize a primária'
          : 'Primária · secundária · destaque (sem inventar cor de rival)'

  // 1) Marca da torcida
  const paletaMarca = fechar({
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
    paletaEscudo = fechar({
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
    paletaEscudo = fechar({
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
    paletaClube = fechar({
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
    paletaClube = fechar({
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
  return aplicarMarcaAoDesign(design, {
    primary: paleta.primary,
    secondary: paleta.secondary,
    accents: paleta.swatches?.slice(2) ?? [],
    actions: paleta.actions,
    actionsFg: paleta.actionsFg,
    corArquirrival: design.brand?.arquirrival,
  })
}

/**
 * Recalcula ações + superfícies claro/escuro a partir da marca.
 * Identidade (hex da primária/secundária) permanece; o que muda é o papel
 * e o texto automático para os dois temas fecharem contraste.
 * @param {import('zod').infer<typeof TenantDesignSchema> | object} design
 * @param {{
 *   primary?: string,
 *   secondary?: string | null,
 *   accents?: string[],
 *   actions?: PaletaSugerida['actions'],
 *   actionsFg?: PaletaSugerida['actionsFg'],
 *   rederiveSurfaces?: boolean,
 *   slug?: string | null,
 *   clubeNome?: string | null,
 *   clubeApelido?: string | null,
 *   corArquirrival?: string | null,
 * }} [opts]
 */
export function aplicarMarcaAoDesign(design, opts = {}) {
  const primary = opts.primary ?? design.brand.primary
  const secondary =
    opts.secondary !== undefined ? opts.secondary : (design.brand.secondary ?? null)
  const derived = derivarSuperficiesDaMarca(primary)
  const accents = opts.accents ?? []
  const actionsBrutas = opts.actions
    ? { ...DEFAULT_ACTIONS, ...opts.actions }
    : derivarAcoesDaMarca(primary, {
        secondary,
        accents,
        slug: opts.slug,
        clubeNome: opts.clubeNome,
        clubeApelido: opts.clubeApelido,
        corArquirrival: opts.corArquirrival ?? design.brand?.arquirrival,
        corPrimaria: primary,
      })
  if (!opts.actions) {
    const destaque = accentDestaque(
      primary,
      typeof secondary === 'string' ? secondary : derived.secondary,
      accents,
    )
    if (destaque) {
      actionsBrutas.danger = clampHexLightness(destaque, 0.28, 0.52)
    }
  }
  const arquirrival = design.brand?.arquirrival ?? opts.corArquirrival ?? null
  const actions = sanearAcoesContraRivalidade(actionsBrutas, {
    corPrimaria: primary,
    corArquirrival: arquirrival,
    slug: opts.slug,
    clubeNome: opts.clubeNome,
    clubeApelido: opts.clubeApelido,
    design: { ...design, brand: { primary, secondary, arquirrival } },
  })
  const rederive = opts.rederiveSurfaces !== false
  return {
    ...design,
    version: 1,
    brand: {
      primary,
      secondary:
        typeof secondary === 'string' && /^#[0-9a-fA-F]{6}$/.test(secondary)
          ? secondary
          : null,
      arquirrival,
    },
    brandFg: { ...DEFAULT_BRAND_FG },
    actions,
    actionsFg: opts.actionsFg
      ? { ...DEFAULT_ACTIONS_FG, ...opts.actionsFg }
      : { ...DEFAULT_ACTIONS_FG },
    customPalettes: design.customPalettes ?? [],
    light: rederive ? derived.light : (design.light ?? derived.light),
    dark: rederive ? derived.dark : (design.dark ?? derived.dark),
    grid: design.grid ?? DEFAULT_TENANT_DESIGN.grid,
  }
}

/**
 * Mantém fundos escolhidos; saneia texto/borda e zera overrides de fg
 * que quebram um dos temas. Usado no botão “Corrigir contraste”.
 * @param {import('zod').infer<typeof TenantDesignSchema> | object} design
 */
export function sanearContrasteDoDesign(design) {
  const primary = design.brand?.primary ?? DEFAULT_TENANT_DESIGN.brand.primary
  const derived = derivarSuperficiesDaMarca(primary)
  return {
    ...design,
    version: 1,
    brandFg: { ...DEFAULT_BRAND_FG },
    actionsFg: { ...DEFAULT_ACTIONS_FG },
    light: completarSuperficies('light', { ...derived.light, ...(design.light ?? {}) }),
    dark: completarSuperficies('dark', { ...derived.dark, ...(design.dark ?? {}) }),
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
 * Branco vs preto no fill — escolhe pelo ratio real (âmbar/amarelo pede preto).
 * @param {string} bgHex
 * @returns {string}
 */
export function textoSobreFill(bgHex) {
  const white = '#ffffff'
  const black = '#0a0a0a'
  return contrasteRatio(white, bgHex) >= contrasteRatio(black, bgHex) ? white : black
}

/**
 * Caminha a luminância no hue até fechar `minRatio`. Neutros ficam acromáticos.
 * @param {string} fgHex
 * @param {string} bgHex
 * @param {number} [minRatio]
 * @returns {string}
 */
export function ajustarParaContraste(fgHex, bgHex, minRatio = CONTRASTE_AA) {
  if (typeof fgHex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(fgHex)) {
    return luminanciaRelativa(bgHex) < 0.45 ? '#fafafa' : '#0a0a0a'
  }
  if (typeof bgHex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(bgHex)) return fgHex
  if (contrasteRatio(fgHex, bgHex) >= minRatio) return fgHex
  const { h, s, l } = hexToHsl(fgHex)
  const sat = s < 0.08 ? 0 : s
  const hue = sat === 0 ? 0 : h
  const bgDark = luminanciaRelativa(bgHex) < 0.45
  const dir = bgDark ? 1 : -1
  for (let step = 0.02; step <= 1; step += 0.02) {
    const nextL = Math.max(0.04, Math.min(0.96, l + dir * step))
    const candidate = hslToHex(hue, sat, nextL)
    if (contrasteRatio(candidate, bgHex) >= minRatio) return candidate
  }
  const white = '#fafafa'
  const black = '#0a0a0a'
  return contrasteRatio(white, bgHex) >= contrasteRatio(black, bgHex) ? white : black
}

/**
 * Fill da marca/ação visível contra a superfície do tema.
 * Branco no claro e preto no escuro ganham um empurrão de L — a identidade
 * gravada no JSON não muda; só o CSS do modo ativo.
 * @param {string} fillHex
 * @param {string} surfaceHex
 * @returns {string}
 */
export function resolverFillDaMarca(fillHex, surfaceHex) {
  if (typeof fillHex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(fillHex)) return fillHex
  if (typeof surfaceHex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(surfaceHex)) {
    return fillHex
  }
  if (contrasteRatio(fillHex, surfaceHex) >= CONTRASTE_FILL_MIN) return fillHex
  const { h, s, l } = hexToHsl(fillHex)
  const sat = s < 0.08 ? 0 : s
  const hue = sat === 0 ? 0 : h
  const surfaceDark = luminanciaRelativa(surfaceHex) < 0.45
  const targetL = surfaceDark ? Math.min(0.92, l + 0.18) : Math.max(0.08, l - 0.18)
  return hslToHex(hue, sat, targetL)
}

/**
 * WCAG 1.4.11: botão precisa de 3:1 contra o fundo adjacente. Se o fill
 * (mesmo após o empurrão) ainda não fecha, o CSS desenha um anel.
 * @param {string} fillHex
 * @param {string} surfaceHex
 * @returns {boolean}
 */
export function precisaAnelFill(fillHex, surfaceHex) {
  if (typeof fillHex !== 'string' || typeof surfaceHex !== 'string') return false
  return contrasteRatio(fillHex, surfaceHex) < CONTRASTE_UI
}

/**
 * Paleta sugerida já fecha AA de papel + botão primário nos dois temas.
 * @param {PaletaSugerida} paleta
 * @returns {boolean}
 */
export function paletaTemContrasteOk(paleta) {
  const d = aplicarPaletaAoDesign(DEFAULT_TENANT_DESIGN, paleta)
  const actions = { ...DEFAULT_ACTIONS, ...paleta.actions }
  for (const mode of /** @type {const} */ (['light', 'dark'])) {
    const s = resolverSuperficies(d, mode)
    if (contrasteRatio(s.foreground, s.background) < CONTRASTE_AA) return false
    if (contrasteRatio(s.foregroundMuted, s.background) < CONTRASTE_AA) return false
    if (contrasteRatio(s.foregroundMuted, s.surface) < CONTRASTE_AA) return false
    const brand = resolveActionTextColors(paleta.primary, null, s.surface)
    if (contrasteRatio(brand.on, brand.fill) < CONTRASTE_AA) return false
    if (contrasteRatio(brand.fg, s.surface) < CONTRASTE_AA) return false
    for (const key of ACTION_TOKEN_KEYS) {
      const text = resolveActionTextColors(actions[key], null, s.surface)
      if (contrasteRatio(text.on, text.fill) < CONTRASTE_AA) return false
      if (contrasteRatio(text.fg, s.surface) < CONTRASTE_AA) return false
      const soft = mixHex(s.surface, text.fill, WASH_ACAO)
      if (contrasteRatio(text.fg, soft) < CONTRASTE_AA) return false
    }
  }
  return true
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
