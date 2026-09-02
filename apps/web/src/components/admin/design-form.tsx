'use client'

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { AlertTriangle, BookmarkPlus, CheckCircle2, Clock, Contrast, Grid3x3, Layers, Loader2, MousePointerClick, Palette, RotateCcw, Save, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { applyTenantDesign, type TenantDesign } from '@torcida/ui'
import {
  ACTION_TOKEN_HINTS,
  ACTION_TOKEN_KEYS,
  ACTION_TOKEN_LABELS,
  CONTRASTE_AA,
  WASH_ACAO,
  DEFAULT_ACTIONS,
  DEFAULT_ACTIONS_FG,
  DEFAULT_BRAND_FG,
  SURFACE_TOKEN_KEYS,
  SURFACE_TOKEN_LABELS,
  aplicarMarcaAoDesign,
  aplicarPaletaAoDesign,
  capturarPaletaDoDesign,
  contrasteRatio,
  contrasteTextoSobre,
  customPaletteParaSugerida,
  gerarPaletasSugeridas,
  isCorPadraoPlataforma,
  mixHex,
  paletaDoClube,
  paletaTemContrasteOk,
  proporCorArquirrival,
  resolveActionTextColors,
  resolveTenantDesign,
  resolverSuperficies,
  sanearAcoesContraRivalidade,
  sanearContrasteDoDesign,
  corArquirrivalCatalogo,
} from '@torcida/types'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { useUnsavedChanges } from '@/lib/unsaved-changes'
import { runPersistAction } from '@/lib/toast-action'
import { extrairPaletaDeImagem } from '@/lib/extrair-paleta'
import { restaurarDesignPadrao, salvarDesignTenant } from '@/app/admin/(plataforma)/design/actions'
import { useTheme } from '@torcida/ui/services/theme'
import {
  DesignStudioPreview,
  type PreviewMode,
  type PreviewScene,
  type TokenFocus,
} from '@/components/admin/design-studio-preview'
import { AppButton } from '@/components/ui/button'

type EditorSection = 'identidade' | 'acoes' | 'fundo' | 'superficies'

type Props = {
  initialDesign: TenantDesign
  corPrimaria: string
  tenantNome: string
  /** slug do tenant — catálogo de cores (ex.: pde-gavioes-fiel → preto). */
  tenantSlug: string
  clubeNome: string | null
  clubeApelido: string | null
  imagemUrls: string[]
}

type ContrastCheck = {
  id: string
  label: string
  mode: PreviewMode
  ratio: number
  min: number
  ok: boolean
  tip: string
}

const SECTIONS: { id: EditorSection; label: string; icon: typeof Palette }[] = [
  { id: 'identidade', label: 'Identidade', icon: Palette },
  { id: 'acoes', label: 'Ações', icon: MousePointerClick },
  { id: 'fundo', label: 'Fundo', icon: Grid3x3 },
  { id: 'superficies', label: 'Superfícies', icon: Layers },
]

function resolveSurfaces(design: TenantDesign, mode: PreviewMode) {
  return resolverSuperficies(design, mode)
}

function secondaryHexOf(design: TenantDesign): string {
  if (
    design.brand.secondary &&
    /^#[0-9a-fA-F]{6}$/.test(design.brand.secondary)
  ) {
    return design.brand.secondary
  }
  return contrasteTextoSobre(design.brand.primary) === 'light'
    ? '#f4f4f5'
    : '#27272a'
}

/** Pares WCAG de um tema — marca, ações e superfícies. */
function buildContrastChecksForMode(
  design: TenantDesign,
  mode: PreviewMode,
): ContrastCheck[] {
  const s = resolveSurfaces(design, mode)
  const actions = { ...DEFAULT_ACTIONS, ...design.actions }
  const actionsFg = { ...DEFAULT_ACTIONS_FG, ...(design.actionsFg ?? {}) }
  const brandFg = { ...DEFAULT_BRAND_FG, ...(design.brandFg ?? {}) }
  const primaryText = resolveActionTextColors(
    design.brand.primary,
    brandFg.primary,
    s.surface,
  )
  const secondaryHex = secondaryHexOf(design)
  const secondaryText = resolveActionTextColors(
    secondaryHex,
    brandFg.secondary,
    s.surface,
  )
  const primarySoftBg = mixHex(s.surface, primaryText.fill, WASH_ACAO)
  const secondarySoftBg = mixHex(s.surface, secondaryText.fill, WASH_ACAO)
  const tema = mode === 'dark' ? 'escuro' : 'claro'

  const pairs: {
    id: string
    label: string
    fg: string
    bg: string
    min: number
    tip: string
  }[] = [
    {
      id: 'title',
      label: 'Título no fundo',
      fg: s.foreground,
      bg: s.background,
      min: 4.5,
      tip: 'Ajuste texto principal ou fundo da página.',
    },
    {
      id: 'title-subtle',
      label: 'Título no fundo sutil',
      fg: s.foreground,
      bg: s.backgroundSubtle,
      min: 4.5,
      tip: 'Áreas com grade usam fundo sutil — título pode sumir.',
    },
    {
      id: 'muted',
      label: 'Texto secundário no fundo',
      fg: s.foregroundMuted,
      bg: s.background,
      min: 4.5,
      tip: 'Descrições ilegíveis — escureça/clareie o texto secundário.',
    },
    {
      id: 'muted-card',
      label: 'Texto secundário no cartão',
      fg: s.foregroundMuted,
      bg: s.surface,
      min: 4.5,
      tip: 'Legendas em cartão somem neste tema.',
    },
    {
      id: 'card',
      label: 'Texto em cartão',
      fg: s.foreground,
      bg: s.surface,
      min: 4.5,
      tip: 'Cartões precisam de texto legível.',
    },
    {
      id: 'raised',
      label: 'Texto em superfície elevada',
      fg: s.foreground,
      bg: s.surfaceRaised,
      min: 4.5,
      tip: 'Menus/popovers usam superfície elevada.',
    },
    {
      id: 'primary-btn',
      label: 'Botão primário',
      fg: primaryText.on,
      bg: primaryText.fill,
      min: CONTRASTE_AA,
      tip: 'Ajuste a primária ou o texto da primária.',
    },
    {
      id: 'primary-menu',
      label: 'Menu / tab ativo',
      fg: primaryText.fg,
      bg: primarySoftBg,
      min: CONTRASTE_AA,
      tip: 'Texto de abas some — use Automático ou outra cor de texto.',
    },
    {
      id: 'secondary-btn',
      label: 'Botão secundário',
      fg: secondaryText.on,
      bg: secondaryText.fill,
      min: CONTRASTE_AA,
      tip: 'Secundária clara precisa de texto escuro (e vice-versa).',
    },
    {
      id: 'secondary-soft',
      label: 'Badge / link secundário',
      fg: secondaryText.fg,
      bg: secondarySoftBg,
      min: CONTRASTE_AA,
      tip: 'Badge soft ou link da secundária ilegível neste tema.',
    },
  ]

  // Grade: linha vs base (visível nos dois temas; null = herda superfície do tema)
  const grid = gridResolved(design, mode)
  pairs.push({
    id: 'grid-line',
    label: 'Linha da grade',
    fg: grid.line,
    bg: grid.base,
    min: 1.4,
    tip: 'Linha da grade some no fundo — ajuste cor da linha ou deixe Automático.',
  })

  for (const key of ACTION_TOKEN_KEYS) {
    const fill = actions[key]
    const text = resolveActionTextColors(fill, actionsFg[key], s.surface)
    const nome = ACTION_TOKEN_LABELS[key].split(' / ')[0]!.toLowerCase()
    const softBg = mixHex(s.surface, text.fill, WASH_ACAO)
    pairs.push(
      {
        id: `${key}-btn`,
        label: `Botão ${nome}`,
        fg: text.on,
        bg: text.fill,
        min: CONTRASTE_AA,
        tip: `Ajuste a cor ou o texto de ${ACTION_TOKEN_LABELS[key]}.`,
      },
      {
        id: `${key}-text`,
        label: `Texto ${nome} no papel`,
        fg: text.fg,
        bg: s.surface,
        min: CONTRASTE_AA,
        tip: `KPI/status (${nome}) ilegível no cartão no tema ${tema}.`,
      },
      {
        id: `${key}-soft`,
        label: `Badge ${nome}`,
        fg: text.fg,
        bg: softBg,
        min: CONTRASTE_AA,
        tip: `Badge ${nome} (ex.: Sem gestor) ilegível no tema ${tema}.`,
      },
    )
  }

  return pairs.map((p) => {
    const ratio = contrasteRatio(p.fg, p.bg)
    return {
      id: `${mode}:${p.id}`,
      label: p.label,
      mode,
      ratio,
      min: p.min,
      ok: ratio >= p.min,
      tip: p.tip,
    }
  })
}

/** Sempre avalia claro e escuro — cores de marca/ação são compartilhadas. */
function buildContrastChecks(design: TenantDesign): ContrastCheck[] {
  return [
    ...buildContrastChecksForMode(design, 'light'),
    ...buildContrastChecksForMode(design, 'dark'),
  ]
}

/** Resumo claro/escuro para um fill + override de texto (marca ou ação). */
function dualThemeTextStatus(
  design: TenantDesign,
  fill: string,
  fgOverride: string | null,
): { mode: PreviewMode; softOk: boolean; btnOk: boolean; softRatio: number; btnRatio: number; text: ReturnType<typeof resolveActionTextColors>; fill: string; softBg: string; surface: string }[] {
  return (['light', 'dark'] as const).map((mode) => {
    const s = resolveSurfaces(design, mode)
    const text = resolveActionTextColors(fill, fgOverride, s.surface)
    const softBg = mixHex(s.surface, text.fill, WASH_ACAO)
    const softRatio = contrasteRatio(text.fg, softBg)
    const btnRatio = contrasteRatio(text.on, text.fill)
    return {
      mode,
      softOk: softRatio >= CONTRASTE_AA,
      btnOk: btnRatio >= CONTRASTE_AA,
      softRatio,
      btnRatio,
      text,
      fill: text.fill,
      softBg,
      surface: s.surface,
    }
  })
}

/** Pares de superfície por token — usado nas amostras dual-tema. */
function surfaceTokenPairs(
  design: TenantDesign,
  key: (typeof SURFACE_TOKEN_KEYS)[number],
  mode: PreviewMode,
): { label: string; fg: string; bg: string; min: number }[] {
  const s = resolveSurfaces(design, mode)
  switch (key) {
    case 'background':
      return [{ label: 'Texto', fg: s.foreground, bg: s.background, min: 4.5 }]
    case 'backgroundSubtle':
      return [{ label: 'Texto', fg: s.foreground, bg: s.backgroundSubtle, min: 4.5 }]
    case 'foreground':
      return [
        { label: 'Fundo', fg: s.foreground, bg: s.background, min: 4.5 },
        { label: 'Cartão', fg: s.foreground, bg: s.surface, min: 4.5 },
      ]
    case 'foregroundMuted':
      return [
        { label: 'Fundo', fg: s.foregroundMuted, bg: s.background, min: 4.5 },
        { label: 'Cartão', fg: s.foregroundMuted, bg: s.surface, min: 4.5 },
      ]
    case 'surface':
      return [{ label: 'Texto', fg: s.foreground, bg: s.surface, min: 4.5 }]
    case 'surfaceRaised':
      return [{ label: 'Texto', fg: s.foreground, bg: s.surfaceRaised, min: 4.5 }]
    case 'border':
      return [
        {
          label: 'Sobre fundo',
          fg: s.border,
          bg: s.background,
          min: 1.2,
        },
      ]
    case 'borderStrong':
      return [
        {
          label: 'Sobre fundo',
          fg: s.borderStrong,
          bg: s.background,
          min: 1.5,
        },
      ]
    default:
      return []
  }
}

function gridResolved(design: TenantDesign, mode: PreviewMode) {
  const s = resolveSurfaces(design, mode)
  return {
    line: design.grid.lineColor ?? s.foreground,
    base: design.grid.baseColor ?? s.backgroundSubtle,
    autoLine: !design.grid.lineColor,
    autoBase: !design.grid.baseColor,
  }
}

/** Color field: swatch abre o seletor nativo direto; hex editável ao lado. */
const HEX6 = /^#[0-9a-fA-F]{6}$/

/** Normaliza digitação/cola (#RGB, #RRGGBB, ou hex sem #) para #rrggbb. */
function normalizeHexInput(raw: string): string | null {
  const t = raw.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`
  if (/^[0-9a-f]{3}$/.test(t)) {
    return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`
  }
  return null
}

/** Aceita rascunho parcial enquanto digita (#, #f, #ff0, ff0000, …). */
function isHexDraft(raw: string): boolean {
  const t = raw.trim()
  if (t === '' || t === '#') return true
  return /^#?[0-9a-fA-F]{0,6}$/.test(t)
}

function ColorField({
  label,
  value,
  resolved,
  onChange,
  allowEmpty,
  emptyLabel = 'Usar padrão',
  token,
  onFocusToken,
  fieldId,
}: {
  label: string
  value: string | null
  /** Valor efetivo exibido no swatch (inclui default). */
  resolved: string
  onChange: (v: string | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
  token?: TokenFocus
  onFocusToken?: (t: TokenFocus) => void
  fieldId?: string
}) {
  const [draft, setDraft] = useState(value ?? resolved)

  // Ressincroniza com o valor de fora no render — em effect o campo hex
  // mostrava a cor anterior por um frame ao trocar de token.
  const efetivo = value ?? resolved
  const [efetivoSincronizado, setEfetivoSincronizado] = useState(efetivo)
  if (efetivo !== efetivoSincronizado) {
    setEfetivoSincronizado(efetivo)
    setDraft(efetivo)
  }

  const display =
    value && HEX6.test(value)
      ? value
      : HEX6.test(resolved)
        ? resolved
        : '#888888'

  function commitDraft(raw: string) {
    const normalized = normalizeHexInput(raw)
    if (normalized) {
      setDraft(normalized)
      onChange(normalized)
      return
    }
    if (raw.trim() === '' && allowEmpty) {
      setDraft('')
      onChange(null)
      return
    }
    setDraft(value ?? resolved)
  }

  return (
    <div
      id={fieldId}
      className="space-y-1.5"
      onMouseEnter={() => token && onFocusToken?.(token)}
      onFocusCapture={() => token && onFocusToken?.(token)}
    >
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-[rgb(var(--foreground))]">{label}</label>
        {allowEmpty && value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-[rgb(var(--foreground-muted))] underline-offset-2 hover:underline"
          >
            {emptyLabel}
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {/*
          type=color visível no swatch (opacity-0). Clique programático em
          input sr-only/clipado é bloqueado no Chrome/Edge — o picker não abre.
        */}
        <div
          className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[rgb(var(--border))] shadow-sm"
          style={{ backgroundColor: display }}
          title="Escolher cor"
        >
          <input
            type="color"
            value={display}
            onChange={(e) => {
              onChange(e.target.value)
              setDraft(e.target.value)
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${label}: escolher cor`}
          />
        </div>
        <input
          id={fieldId ? `${fieldId}-hex` : undefined}
          type="text"
          value={draft}
          placeholder={resolved}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          onChange={(e) => {
            const v = e.target.value
            if (!isHexDraft(v)) return
            setDraft(v)
            if (v.trim() === '' && allowEmpty) {
              onChange(null)
              return
            }
            const normalized = normalizeHexInput(v)
            if (normalized) onChange(normalized)
          }}
          onBlur={() => commitDraft(draft)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text')
            const normalized = normalizeHexInput(pasted)
            if (!normalized) return
            e.preventDefault()
            setDraft(normalized)
            onChange(normalized)
          }}
          className="w-full min-w-0 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 font-mono text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--border-strong))]"
          maxLength={7}
        />
      </div>
      {!value && allowEmpty ? (
        <p className="text-[10px] text-[rgb(var(--foreground-muted))]">Padrão · {resolved}</p>
      ) : null}
    </div>
  )
}

function SectionFrame({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">{title}</h2>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{description}</p>
      </div>
      {children}
    </section>
  )
}

function PaletaCard({
  paleta,
  badge,
  applyLabel = 'Aplicar',
  onApply,
  onRemove,
}: {
  paleta: {
    id: string
    nome: string
    descricao: string
    swatches: string[]
    primary?: string
    secondary?: string
    actions?: {
      success: string
      danger: string
      warning: string
      info: string
    }
  }
  badge?: string
  applyLabel?: string
  onApply: () => void
  onRemove?: () => void
}) {
  const contrasteOk =
    paleta.primary && paleta.secondary && paleta.actions
      ? paletaTemContrasteOk({
          id: paleta.id,
          nome: paleta.nome,
          descricao: paleta.descricao,
          primary: paleta.primary,
          secondary: paleta.secondary,
          actions: paleta.actions,
          swatches: paleta.swatches,
          fonte: 'atual',
        })
      : null
  return (
    <div className="group relative rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:border-[rgb(var(--border-strong))] hover:bg-[rgb(var(--background-subtle))]">
      <button type="button" onClick={onApply} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                {paleta.nome}
              </p>
              {badge ? (
                <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
                  {badge}
                </span>
              ) : null}
              {contrasteOk === true ? (
                <span className="rounded-md bg-[rgb(var(--color-info)_/_0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--color-info-fg))]">
                  Claro+escuro
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
              {paleta.descricao}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))] opacity-0 transition-opacity group-hover:opacity-100">
            {applyLabel}
          </span>
        </div>
        <div className="mt-2.5 space-y-1.5">
          <div className="flex overflow-hidden rounded-lg ring-1 ring-[rgb(var(--border))]">
            {paleta.swatches.map((hex, i) => (
              <span
                key={`${paleta.id}-${hex}-${i}`}
                className="h-9 flex-1 first:rounded-l-lg last:rounded-r-lg"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
          <div className="flex gap-1">
            {paleta.swatches.map((hex, i) => (
              <span
                key={`${paleta.id}-label-${hex}-${i}`}
                className="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-[rgb(var(--foreground-muted))]"
                title={hex}
              >
                {hex.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute right-2 top-2 rounded-md p-1 text-[rgb(var(--foreground-muted))] opacity-0 transition-opacity hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))] group-hover:opacity-100"
          title="Remover paleta salva"
          aria-label={`Remover ${paleta.nome}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function ContrastPanel({
  checks,
  onFix,
}: {
  checks: ContrastCheck[]
  onFix?: () => void
}) {
  const fails = checks.filter((c) => !c.ok)
  const lightFails = fails.filter((c) => c.mode === 'light').length
  const darkFails = fails.filter((c) => c.mode === 'dark').length
  const byMode = {
    light: checks.filter((c) => c.mode === 'light'),
    dark: checks.filter((c) => c.mode === 'dark'),
  }

  return (
    <div
      className={[
        'shrink-0 rounded-xl border px-3 py-2.5',
        fails.length > 0
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-[rgb(var(--color-info)_/_0.35)] bg-[rgb(var(--color-info)_/_0.1)]',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        {fails.length > 0 ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-info-fg))]" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p
            className={[
              'text-sm font-medium',
              fails.length > 0
                ? 'text-amber-900 dark:text-amber-100'
                : 'text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {fails.length > 0
              ? `${fails.length} contraste${fails.length > 1 ? 's' : ''} fraco${fails.length > 1 ? 's' : ''} — claro: ${lightFails}, escuro: ${darkFails}`
              : 'Contraste OK nos temas claro e escuro'}
          </p>
          {fails.length > 0 && onFix ? (
            <AppButton
              variant="none"
              icon={Wand2}
              type="button"
              onClick={onFix}
              className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-500/25 dark:text-amber-100"
            >
              Corrigir contraste nos dois temas
            </AppButton>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {(['light', 'dark'] as const).map((mode) => {
              const list = byMode[mode]
              const modeFails = list.filter((c) => !c.ok).length
              return (
                <div key={mode} className="min-w-0 space-y-1">
                  <p
                    className={[
                      'text-[11px] font-semibold uppercase tracking-wide',
                      modeFails > 0
                        ? 'text-amber-800 dark:text-amber-200'
                        : 'text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                  >
                    {mode === 'dark' ? 'Escuro' : 'Claro'}
                    {modeFails > 0 ? ` · ${modeFails} fraco${modeFails > 1 ? 's' : ''}` : ' · OK'}
                  </p>
                  <ul className="max-h-[9rem] space-y-1 overflow-y-auto">
                    {list.map((c) => (
                      <li key={c.id} className="flex items-start gap-1.5 text-[11px]">
                        <Contrast
                          className={[
                            'mt-0.5 h-3 w-3 shrink-0',
                            c.ok
                              ? 'text-[rgb(var(--color-info-fg))]'
                              : 'text-amber-600 dark:text-amber-300',
                          ].join(' ')}
                        />
                        <span
                          className={
                            c.ok
                              ? 'text-[rgb(var(--foreground-muted))]'
                              : 'text-amber-900 dark:text-amber-100'
                          }
                        >
                          <span className="font-medium">{c.label}</span>{' '}
                          {c.ratio.toFixed(1)}:1
                          {!c.ok ? ` — ${c.tip}` : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Amostras de texto (soft + sólido) nos dois temas — marca ou ação. */
function DualThemeTextSamples({
  design,
  fill,
  fgOverride,
  showLink = false,
}: {
  design: TenantDesign
  fill: string
  fgOverride: string | null
  showLink?: boolean
}) {
  const rows = dualThemeTextStatus(design, fill, fgOverride)
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((row) => {
        const ok = row.softOk && row.btnOk
        return (
          <div
            key={row.mode}
            className="space-y-1.5 rounded-lg border border-[rgb(var(--border))] p-2"
            style={{ backgroundColor: row.surface }}
          >
            <div className="flex items-center justify-between gap-1">
              <span
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  color:
                    contrasteTextoSobre(row.surface) === 'light'
                      ? 'rgba(255,255,255,0.65)'
                      : 'rgba(0,0,0,0.5)',
                }}
              >
                {row.mode === 'dark' ? 'Escuro' : 'Claro'}
              </span>
              <span
                className="text-[10px] font-medium"
                style={{
                  color: ok
                    ? contrasteTextoSobre(row.surface) === 'light'
                      ? '#7dd3fc'
                      : '#0369a1'
                    : contrasteTextoSobre(row.surface) === 'light'
                      ? '#fbbf24'
                      : '#b45309',
                }}
              >
                {ok
                  ? 'OK'
                  : `Fraco ${Math.min(row.softRatio, row.btnRatio).toFixed(1)}:1`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <span
                className="inline-flex items-center rounded-md px-2 py-1 font-medium"
                style={{ backgroundColor: row.softBg, color: row.text.fg }}
              >
                Soft
              </span>
              <span
                className="inline-flex items-center rounded-md px-2 py-1 font-semibold"
                style={{ backgroundColor: row.fill, color: row.text.on }}
              >
                Botão
              </span>
              {showLink ? (
                <span
                  className="inline-flex items-center px-1 py-1 font-semibold underline-offset-2"
                  style={{ color: row.text.fg }}
                >
                  Link
                </span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function statusColor(onBg: string, ok: boolean) {
  const light = contrasteTextoSobre(onBg) === 'light'
  if (ok) return light ? '#7dd3fc' : '#0369a1'
  return light ? '#fbbf24' : '#b45309'
}

function labelMuted(onBg: string) {
  return contrasteTextoSobre(onBg) === 'light'
    ? 'rgba(255,255,255,0.65)'
    : 'rgba(0,0,0,0.5)'
}

/** Amostra visual claro/escuro para um token de superfície. */
function DualThemeSurfaceSamples({
  design,
  tokenKey,
}: {
  design: TenantDesign
  tokenKey: (typeof SURFACE_TOKEN_KEYS)[number]
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(['light', 'dark'] as const).map((mode) => {
        const s = resolveSurfaces(design, mode)
        const pairs = surfaceTokenPairs(design, tokenKey, mode)
        const worst = pairs.reduce(
          (acc, p) => {
            const ratio = contrasteRatio(p.fg, p.bg)
            return ratio < acc.ratio ? { ratio, ok: ratio >= p.min } : acc
          },
          { ratio: 99, ok: true },
        )
        const canvas =
          tokenKey === 'background' || tokenKey === 'backgroundSubtle'
            ? s[tokenKey]
            : tokenKey === 'surfaceRaised'
              ? s.surfaceRaised
              : s.surface
        const sampleFg =
          tokenKey === 'foregroundMuted' ? s.foregroundMuted : s.foreground
        const sampleBorder =
          tokenKey === 'borderStrong' ? s.borderStrong : s.border

        return (
          <div
            key={mode}
            className="space-y-1.5 rounded-lg border p-2"
            style={{
              backgroundColor: canvas,
              borderColor: sampleBorder,
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: labelMuted(canvas) }}
              >
                {mode === 'dark' ? 'Escuro' : 'Claro'}
              </span>
              <span
                className="text-[10px] font-medium"
                style={{ color: statusColor(canvas, worst.ok) }}
              >
                {worst.ok ? 'OK' : `Fraco ${worst.ratio.toFixed(1)}:1`}
              </span>
            </div>
            {tokenKey === 'border' || tokenKey === 'borderStrong' ? (
              <div
                className="rounded-md px-2 py-2 text-[10px] font-medium"
                style={{
                  backgroundColor: s.surface,
                  border: `2px solid ${sampleBorder}`,
                  color: s.foreground,
                }}
              >
                Borda no cartão
              </div>
            ) : (
              <div className="space-y-1">
                <p
                  className="text-[11px] font-semibold leading-snug"
                  style={{ color: sampleFg }}
                >
                  Título de exemplo
                </p>
                {tokenKey === 'foregroundMuted' ||
                tokenKey === 'background' ||
                tokenKey === 'backgroundSubtle' ||
                tokenKey === 'surface' ||
                tokenKey === 'surfaceRaised' ? (
                  <p className="text-[10px]" style={{ color: s.foregroundMuted }}>
                    Texto secundário / legenda
                  </p>
                ) : null}
                {pairs.map((p) => {
                  const ratio = contrasteRatio(p.fg, p.bg)
                  const ok = ratio >= p.min
                  return (
                    <p
                      key={p.label}
                      className="text-[10px] tabular-nums"
                      style={{ color: statusColor(canvas, ok) }}
                    >
                      {p.label} {ratio.toFixed(1)}:1{ok ? '' : '!'}
                    </p>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Prévia da grade nos dois temas (linha/base compartilhada ou automática). */
function DualThemeGridSamples({ design }: { design: TenantDesign }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(['light', 'dark'] as const).map((mode) => {
        const s = resolveSurfaces(design, mode)
        const g = gridResolved(design, mode)
        const ratio = contrasteRatio(g.line, g.base)
        const ok = ratio >= 1.4
        const size = Math.max(16, Math.min(32, design.grid.sizePx / 2))
        const lr = parseInt(g.line.slice(1, 3), 16)
        const lg = parseInt(g.line.slice(3, 5), 16)
        const lb = parseInt(g.line.slice(5, 7), 16)
        const lineCss = `rgb(${lr} ${lg} ${lb} / ${design.grid.lineOpacity})`
        return (
          <div
            key={mode}
            className="space-y-1.5 overflow-hidden rounded-lg border border-[rgb(var(--border))] p-2"
            style={{
              backgroundColor: g.base,
              backgroundImage: design.grid.enabled
                ? `linear-gradient(${lineCss} 1px, transparent 1px), linear-gradient(90deg, ${lineCss} 1px, transparent 1px)`
                : 'none',
              backgroundSize: `${size}px ${size}px`,
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: labelMuted(g.base) }}
              >
                {mode === 'dark' ? 'Escuro' : 'Claro'}
              </span>
              <span
                className="text-[10px] font-medium"
                style={{ color: statusColor(g.base, ok) }}
              >
                {ok ? 'OK' : `Fraco ${ratio.toFixed(1)}:1`}
              </span>
            </div>
            <div
              className="rounded-md border px-2 py-1.5 text-[10px] font-medium shadow-sm"
              style={{
                backgroundColor: s.surface,
                borderColor: s.border,
                color: s.foreground,
              }}
            >
              Cartão sobre a grade
            </div>
            <p
              className="text-[10px] tabular-nums"
              style={{ color: s.foregroundMuted }}
            >
              Linha {g.autoLine ? 'auto' : g.line.toUpperCase()} · Base{' '}
              {g.autoBase ? 'auto' : g.base.toUpperCase()} · {ratio.toFixed(1)}:1
            </p>
          </div>
        )
      })}
    </div>
  )
}

function copyArquirrivalIdentidade(
  proposta: ReturnType<typeof proporCorArquirrival>,
  catalogo: string | null,
): string {
  const pulados = proposta.pulados
    .map((p) => p.rotulo)
    .filter(Boolean)
    .join(' e ')
  if (proposta.mesmoAlvinegro && catalogo && proposta.rivalRotulo) {
    return `O clássico com ${pulados} também é alvinegro — essa rivalidade não gera uma cor a isolar. O próximo arquirrival com cor distinta é o ${proposta.rivalRotulo}. Confirmam essa cor no painel, ou querem escolher outra?`
  }
  if (proposta.mesmoAlvinegro && !catalogo) {
    return pulados
      ? `O clássico com ${pulados} compartilha o preto e branco de vocês, então essa rivalidade não gera uma cor a isolar. Querem definir uma cor de arquirrival à mão?`
      : 'Não há um arquirrival com cor distinta no catálogo. Querem definir uma cor de arquirrival à mão?'
  }
  if (catalogo && proposta.rivalRotulo) {
    return `Sugerimos a cor do ${proposta.rivalRotulo} para não pintar o painel com o arquirrival. Confirmam, ou querem escolher outra?`
  }
  if (catalogo) {
    return 'Sugerimos esta cor de arquirrival para não pintá-la no painel. Confirmam, ou querem escolher outra?'
  }
  return 'Querem definir a cor de arquirrival desta unidade?'
}

export function DesignForm({
  initialDesign,
  corPrimaria,
  tenantNome,
  tenantSlug,
  clubeNome,
  clubeApelido,
  imagemUrls,
}: Props) {
  const baseline = useMemo(
    () =>
      resolveTenantDesign(initialDesign, corPrimaria, {
        slug: tenantSlug,
        clubeNome,
        clubeApelido,
        corArquirrival: initialDesign.brand.arquirrival,
      }) as TenantDesign,
    [initialDesign, corPrimaria, tenantSlug, clubeNome, clubeApelido],
  )
  const normalizedBaseline = useMemo(
    () => ({
      ...baseline,
      actions: { ...DEFAULT_ACTIONS, ...baseline.actions },
      actionsFg: { ...DEFAULT_ACTIONS_FG, ...(baseline.actionsFg ?? {}) },
    }),
    [baseline],
  )

  const [design, setDesign] = useState<TenantDesign>(normalizedBaseline)
  const [section, setSection] = useState<EditorSection>('identidade')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('dark')
  const [scene, setScene] = useState<PreviewScene>('portal')
  const [focus, setFocus] = useState<TokenFocus>(null)
  const [compareAtivo, setCompareAtivo] = useState(false)
  const [pending, startTransition] = useTransition()
  const [extracted, setExtracted] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const [nomeNovaPaleta, setNomeNovaPaleta] = useState('')
  const [mostrarSalvarPaleta, setMostrarSalvarPaleta] = useState(false)
  const [arquirrivalPerguntaDispensada, setArquirrivalPerguntaDispensada] =
    useState(false)
  const { resolvedTheme } = useTheme()

  const dirty = useMemo(
    () => JSON.stringify(design) !== JSON.stringify(normalizedBaseline),
    [design, normalizedBaseline],
  )

  useUnsavedChanges({
    id: 'admin-design',
    title: 'Design da plataforma',
    isDirty: dirty,
    changes: dirty ? ['Cores e tokens do tema'] : [],
  })

  useEffect(() => {
    const mode = (resolvedTheme === 'light' ? 'light' : 'dark') as PreviewMode
    applyTenantDesign(normalizedBaseline, mode)
  }, [normalizedBaseline, resolvedTheme])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (imagemUrls.length === 0) return
      setExtracting(true)
      const all: string[] = []
      for (const url of imagemUrls.slice(0, 3)) {
        const colors = await extrairPaletaDeImagem(url, 4)
        for (const c of colors) {
          if (!all.includes(c)) all.push(c)
        }
      }
      if (!cancelled) {
        setExtracted(all.slice(0, 6))
        setExtracting(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [imagemUrls])

  // Auto-scene ao trocar de seção — no render, para o preview não aparecer um
  // frame na cena anterior. O usuário ainda pode trocar a cena depois.
  const [sectionCena, setSectionCena] = useState(section)
  if (section !== sectionCena) {
    setSectionCena(section)
    if (section === 'acoes') setScene('admin')
    else if (section === 'identidade') setScene('portal')
    else if (section === 'fundo') setScene('portal')
  }

  const clubePaleta = useMemo(
    () => paletaDoClube(clubeNome, clubeApelido),
    [clubeNome, clubeApelido],
  )

  const propostaArquirrival = useMemo(
    () =>
      proporCorArquirrival({
        slug: tenantSlug,
        clubeNome,
        clubeApelido,
        corPrimaria: design.brand.primary,
      }),
    [tenantSlug, clubeNome, clubeApelido, design.brand.primary],
  )
  const catalogoArquirrival = useMemo(
    () =>
      corArquirrivalCatalogo({
        slug: tenantSlug,
        clubeNome,
        clubeApelido,
      }),
    [tenantSlug, clubeNome, clubeApelido],
  )
  const mostrarPerguntaArquirrival =
    section === 'identidade' &&
    !design.brand.arquirrival &&
    !arquirrivalPerguntaDispensada &&
    Boolean(propostaArquirrival.clubeChave) &&
    Boolean(catalogoArquirrival || propostaArquirrival.mesmoAlvinegro)

  function focarCampoArquirrival() {
    document
      .getElementById('design-cor-arquirrival')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    document.getElementById('design-cor-arquirrival-hex')?.focus()
  }

  // Semente estável (baseline) + catálogo por slug: se a cor salva ainda for o
  // roxo da plataforma, “Marca da torcida” usa preto/cores curadas (Gaviões etc.).
  const paletasSugeridas = useMemo(
    () =>
      gerarPaletasSugeridas(normalizedBaseline.brand.primary, {
        secondary: normalizedBaseline.brand.secondary,
        slug: tenantSlug,
        clubeNome,
        clubeApelido,
        corArquirrival: design.brand.arquirrival,
        clube: clubePaleta
          ? {
              primary: clubePaleta.primary,
              secondary: clubePaleta.secondary,
              accents: clubePaleta.accents,
            }
          : null,
        extraidas: extracted,
      }),
    [
      normalizedBaseline.brand.primary,
      normalizedBaseline.brand.secondary,
      tenantSlug,
      clubeNome,
      clubeApelido,
      design.brand.arquirrival,
      clubePaleta,
      extracted,
    ],
  )

  const paletasSalvas = useMemo(
    () => (design.customPalettes ?? []).map(customPaletteParaSugerida),
    [design.customPalettes],
  )

  const designUi = useMemo((): TenantDesign => {
    return {
      ...design,
      actions: sanearAcoesContraRivalidade(
        { ...DEFAULT_ACTIONS, ...design.actions },
        {
          slug: tenantSlug,
          clubeNome,
          clubeApelido,
          corPrimaria: design.brand.primary,
          corArquirrival: design.brand.arquirrival,
          design,
        },
      ),
    }
  }, [design, tenantSlug, clubeNome, clubeApelido])

  const contrastChecks = useMemo(() => buildContrastChecks(designUi), [designUi])

  const surfacesResolved = resolveSurfaces(designUi, previewMode)

  function patch(partial: Partial<TenantDesign>) {
    setDesign((d) => {
      const next = { ...d, ...partial } as TenantDesign
      return {
        ...next,
        actions: sanearAcoesContraRivalidade(
          { ...DEFAULT_ACTIONS, ...next.actions },
          {
            slug: tenantSlug,
            clubeNome,
            clubeApelido,
            corPrimaria: next.brand.primary,
            corArquirrival: next.brand.arquirrival,
            design: next,
          },
        ),
      }
    })
  }

  function applyPaletaCompleta(
    paleta: ReturnType<typeof gerarPaletasSugeridas>[number],
  ) {
    setDesign(aplicarPaletaAoDesign(design, paleta) as TenantDesign)
    setFocus(null)
    setCompareAtivo(false)
    setSection('identidade')
  }

  function aplicarMarca(
    opts: {
      primary?: string
      secondary?: string | null
      rederiveSurfaces?: boolean
    },
  ) {
    setDesign(
      (d) =>
        aplicarMarcaAoDesign(d, {
          primary: opts.primary ?? d.brand.primary,
          secondary:
            opts.secondary !== undefined ? opts.secondary : d.brand.secondary,
          accents: clubePaleta?.accents ?? [],
          rederiveSurfaces: opts.rederiveSurfaces,
          slug: tenantSlug,
          clubeNome,
          clubeApelido,
        }) as TenantDesign,
    )
  }

  function reequilibrarAcoesDaMarca() {
    aplicarMarca({ rederiveSurfaces: true })
  }

  function corrigirContraste() {
    setDesign((d) => sanearContrasteDoDesign(d) as TenantDesign)
  }

  function salvarPaletaAtual() {
    const lista = design.customPalettes ?? []
    if (lista.length >= 20) return
    const nova = capturarPaletaDoDesign(design, nomeNovaPaleta)
    patch({ customPalettes: [...lista, nova] })
    setNomeNovaPaleta('')
    setMostrarSalvarPaleta(false)
  }

  function removerPaletaSalva(customId: string) {
    patch({
      customPalettes: (design.customPalettes ?? []).filter((p) => p.id !== customId),
    })
  }

  function handleCancel() {
    setDesign(normalizedBaseline)
    setFocus(null)
  }

  function handleSave() {
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarDesignTenant(designUi), {
        success: 'Design salvo. A plataforma já reflete as cores.',
      })
      if (ok) window.location.reload()
    })
  }

  function handleRestore() {
    startTransition(async () => {
      const ok = await runPersistAction(() => restaurarDesignPadrao(), {
        success: 'Design restaurado para o padrão Torcida.',
      })
      if (ok) window.location.reload()
    })
  }

  const fieldProps = {
    onFocusToken: setFocus,
  }

  return (
    <div data-persist-bar-root className="flex min-h-0 flex-col xl:min-h-0 xl:flex-1">
      <div className="flex min-h-0 flex-col gap-6 xl:min-h-0 xl:flex-1 xl:flex-row xl:gap-6">
        {/* Inspector — no desktop, scroll interno; a página não estica */}
        <div className="flex min-h-0 w-full flex-col gap-4 xl:w-[min(460px,42%)] xl:shrink-0 xl:overflow-y-auto xl:overflow-x-hidden xl:pr-2">
          <div
            className="sticky top-0 z-10 flex shrink-0 gap-0.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-1 shadow-[0_8px_16px_-12px_rgba(0,0,0,0.45)]"
            role="tablist"
          >
            {SECTIONS.map((s) => {
              const Icon = s.icon
              const active = section === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSection(s.id)}
                  className={[
                    'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-xs transition-colors sm:gap-1.5 sm:px-2 sm:text-sm',
                    active
                      ? 'bg-[rgb(var(--surface))] font-semibold text-[rgb(var(--foreground))] shadow-sm'
                      : 'font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              )
            })}
          </div>

          <div className="space-y-5 px-0.5">
            {isCorPadraoPlataforma(design.brand.primary) ? (
              <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                A cor atual é o <strong>roxo padrão da plataforma</strong>, não a
                marca da torcida. Em Paletas sugeridas, use{' '}
                <strong>Marca da torcida</strong> (catálogo) e salve.
              </p>
            ) : null}
            {section === 'identidade' ? (
              <SectionFrame
                title="Identidade"
                description="Paleta e marca. Ao mudar a primária, superfícies e ações são recalculadas para o claro e o escuro fecharem contraste."
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--foreground))]">
                    <Sparkles className="h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]" />
                    Paletas sugeridas
                  </div>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    Três opções na ordem da torcida: marca → escudo → clube.
                    Aplicar atualiza marca, ações e superfícies (claro e escuro)
                    na prévia até salvar. Cada card já fecha contraste AA nos
                    dois temas.
                  </p>
                  {extracting ? (
                    <p className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Extraindo cores do escudo…
                    </p>
                  ) : null}

                  <div className="space-y-2">
                    {paletasSugeridas.map((p) => (
                      <PaletaCard
                        key={p.id}
                        paleta={p}
                        onApply={() => applyPaletaCompleta(p)}
                      />
                    ))}
                  </div>

                  {paletasSalvas.length > 0 ? (
                    <div className="space-y-2 border-t border-[rgb(var(--border))] pt-3">
                      <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
                        Salvas pela torcida
                      </p>
                      {paletasSalvas.map((p) => {
                        const customId = p.id.startsWith('custom:')
                          ? p.id.slice('custom:'.length)
                          : p.id
                        return (
                          <PaletaCard
                            key={p.id}
                            paleta={p}
                            badge="Salva"
                            onApply={() => applyPaletaCompleta(p)}
                            onRemove={() => removerPaletaSalva(customId)}
                          />
                        )
                      })}
                    </div>
                  ) : null}

                  {mostrarSalvarPaleta ? (
                    <div className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
                      <label className="block text-xs font-medium text-[rgb(var(--foreground))]">
                        Nome da paleta
                      </label>
                      <input
                        type="text"
                        value={nomeNovaPaleta}
                        onChange={(e) => setNomeNovaPaleta(e.target.value)}
                        placeholder="Ex.: Clássico P&B"
                        maxLength={60}
                        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--border-strong))]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <AppButton
                          variant="primary"
                          icon={BookmarkPlus}
                          type="button"
                          onClick={salvarPaletaAtual}
                          disabled={(design.customPalettes ?? []).length >= 20}
                          className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                        >
                          Salvar na lista
                        </AppButton>
                        <AppButton
                          variant="none"
                          icon={X}
                          type="button"
                          onClick={() => {
                            setMostrarSalvarPaleta(false)
                            setNomeNovaPaleta('')
                          }}
                          className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]"
                        >
                          Cancelar
                        </AppButton>
                      </div>
                      <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                        Fica no rascunho até você salvar o design da torcida.
                        Máximo 20 paletas.
                      </p>
                    </div>
                  ) : (
                    <AppButton
                      variant="none"
                      icon={BookmarkPlus}
                      type="button"
                      onClick={() => setMostrarSalvarPaleta(true)}
                      disabled={(design.customPalettes ?? []).length >= 20}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-2.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--border-strong))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                    >
                      Salvar paleta atual na lista
                    </AppButton>
                  )}
                </div>

                <div className="grid gap-4 border-t border-[rgb(var(--border))] pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    Ajuste fino
                  </p>
                  <ColorField
                    label="Cor primária"
                    value={design.brand.primary}
                    resolved={design.brand.primary}
                    token="brand.primary"
                    onChange={(v) => {
                      if (v) aplicarMarca({ primary: v, rederiveSurfaces: true })
                    }}
                    {...fieldProps}
                  />
                  {(() => {
                    const primaryFg =
                      design.brandFg?.primary ?? DEFAULT_BRAND_FG.primary ?? null
                    const autoPrimary = resolveActionTextColors(
                      design.brand.primary,
                      null,
                      surfacesResolved.surface,
                    )
                    return (
                      <>
                        <ColorField
                          label="Texto da primária (menus / tabs)"
                          value={primaryFg}
                          resolved={autoPrimary.fg}
                          token="brand.primary"
                          allowEmpty
                          emptyLabel="Automático"
                          onChange={(v) => {
                            patch({
                              brandFg: {
                                ...DEFAULT_BRAND_FG,
                                ...(design.brandFg ?? {}),
                                primary: v,
                              },
                            })
                          }}
                          {...fieldProps}
                        />
                        <DualThemeTextSamples
                          design={design}
                          fill={design.brand.primary}
                          fgOverride={primaryFg}
                        />
                        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                          Texto em abas (Membros, Sócios…), sidebar e badges soft.
                          Amostra nos dois temas — Automático clareia marca preta no
                          escuro.
                        </p>
                      </>
                    )
                  })()}
                  <ColorField
                    label="Cor secundária"
                    value={design.brand.secondary}
                    resolved={design.brand.secondary ?? '#888888'}
                    token="brand.secondary"
                    onChange={(v) =>
                      aplicarMarca({ secondary: v, rederiveSurfaces: false })
                    }
                    allowEmpty
                    emptyLabel="Remover"
                    {...fieldProps}
                  />
                  {(() => {
                    const secondaryHex = secondaryHexOf(design)
                    const secondaryFg =
                      design.brandFg?.secondary ?? DEFAULT_BRAND_FG.secondary ?? null
                    const autoSecondary = resolveActionTextColors(
                      secondaryHex,
                      null,
                      surfacesResolved.surface,
                    )
                    return (
                      <>
                        <ColorField
                          label="Texto da secundária (badges / botão)"
                          value={secondaryFg}
                          resolved={autoSecondary.fg}
                          token="brand.secondary"
                          allowEmpty
                          emptyLabel="Automático"
                          onChange={(v) => {
                            patch({
                              brandFg: {
                                ...DEFAULT_BRAND_FG,
                                ...(design.brandFg ?? {}),
                                secondary: v,
                              },
                            })
                          }}
                          {...fieldProps}
                        />
                        <DualThemeTextSamples
                          design={design}
                          fill={secondaryHex}
                          fgOverride={secondaryFg}
                          showLink
                        />
                        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                          Controla o texto sobre a secundária (badge soft, botão
                          sólido e links). Manual só vale onde o contraste fecha em
                          cada tema.
                        </p>
                      </>
                    )
                  })()}
                  <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                    Cor secundária: fill do botão Curtir, badge Destaque e faixa do
                    evento. O texto desses elementos é o campo acima.
                  </p>
                  {mostrarPerguntaArquirrival ? (
                    <div className="space-y-3 rounded-xl border border-[rgb(var(--color-warning)_/_0.4)] bg-[rgb(var(--color-warning)_/_0.08)] p-3">
                      <div className="flex items-start gap-3">
                        {catalogoArquirrival ? (
                          <span
                            className="mt-0.5 h-11 w-11 shrink-0 rounded-lg border border-[rgb(var(--border))] shadow-sm"
                            style={{ backgroundColor: catalogoArquirrival }}
                            title={catalogoArquirrival}
                            aria-hidden
                          />
                        ) : (
                          <Palette
                            className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--color-warning-fg))]"
                            aria-hidden
                          />
                        )}
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                            Cor do arquirrival
                          </p>
                          <p className="text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
                            {copyArquirrivalIdentidade(
                              propostaArquirrival,
                              catalogoArquirrival,
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {catalogoArquirrival ? (
                          <AppButton
                            variant="primary"
                            icon={CheckCircle2}
                            type="button"
                            className="gap-1.5 rounded-lg px-3 text-xs font-semibold"
                            onClick={() =>
                              patch({
                                brand: {
                                  ...design.brand,
                                  arquirrival: catalogoArquirrival,
                                },
                              })
                            }
                          >
                            Usar esta cor
                          </AppButton>
                        ) : null}
                        <button
                          type="button"
                          className="app-action inline-flex items-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-xs font-medium text-[rgb(var(--foreground))]"
                          onClick={focarCampoArquirrival}
                        >
                          {catalogoArquirrival ? 'Escolher outra' : 'Definir agora'}
                        </button>
                        <AppButton
                          variant="none"
                          icon={Clock}
                          type="button"
                          className="app-action inline-flex items-center rounded-lg px-3 text-xs font-medium text-[rgb(var(--foreground-muted))] underline-offset-2 hover:underline"
                          onClick={() => setArquirrivalPerguntaDispensada(true)}
                        >
                          Agora não
                        </AppButton>
                      </div>
                    </div>
                  ) : null}
                  <ColorField
                    label="Cor do arquirrival"
                    fieldId="design-cor-arquirrival"
                    value={design.brand.arquirrival ?? null}
                    resolved={
                      catalogoArquirrival ?? '#6b7280'
                    }
                    allowEmpty
                    emptyLabel="Padrão do catálogo"
                    onChange={(v) =>
                      patch({
                        brand: { ...design.brand, arquirrival: v },
                      })
                    }
                    {...fieldProps}
                  />
                  <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                    Dado da torcida, não palpite de UX: essa família de hue não
                    pinta departamentos, badges nem textos de status (aviso,
                    informativo, sucesso) nesta unidade. Vazio usa o padrão do
                    catálogo — clássico alvinegro (Santos × Corinthians) é
                    pulado; entra o próximo hue distinto (Palmeiras / Mancha).
                  </p>
                  <AppButton
                    variant="none"
                    icon={Wand2}
                    type="button"
                    onClick={reequilibrarAcoesDaMarca}
                    className="text-left text-xs font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
                  >
                    Reequilibrar claro, escuro e ações a partir da primária
                  </AppButton>
                </div>
              </SectionFrame>
            ) : null}

            {section === 'acoes' ? (
              <SectionFrame
                title="Ações e status"
                description="Portal e Admin. Cada cor é validada em claro e escuro (botão + badge)."
              >
                <div className="grid gap-3">
                  {ACTION_TOKEN_KEYS.map((key) => {
                    const fill = designUi.actions?.[key] ?? DEFAULT_ACTIONS[key]
                    const fgOverride =
                      design.actionsFg?.[key] ?? DEFAULT_ACTIONS_FG[key] ?? null
                    const autoText = resolveActionTextColors(
                      fill,
                      null,
                      surfacesResolved.surface,
                    )
                    return (
                      <div
                        key={key}
                        className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3"
                      >
                        <ColorField
                          label={ACTION_TOKEN_LABELS[key]}
                          value={fill}
                          resolved={fill}
                          token={`actions.${key}` as TokenFocus}
                          onChange={(v) => {
                            if (!v) return
                            patch({
                              actions: {
                                ...DEFAULT_ACTIONS,
                                ...design.actions,
                                [key]: v,
                              },
                            })
                          }}
                          {...fieldProps}
                        />
                        <ColorField
                          label="Cor do texto"
                          value={fgOverride}
                          resolved={autoText.on}
                          token={`actions.${key}` as TokenFocus}
                          allowEmpty
                          emptyLabel="Automático"
                          onChange={(v) => {
                            patch({
                              actionsFg: {
                                ...DEFAULT_ACTIONS_FG,
                                ...(design.actionsFg ?? {}),
                                [key]: v,
                              },
                            })
                          }}
                          {...fieldProps}
                        />
                        <DualThemeTextSamples
                          design={designUi}
                          fill={fill}
                          fgOverride={fgOverride}
                        />
                        <p className="text-xs text-[rgb(var(--foreground-muted))]">
                          {ACTION_TOKEN_HINTS[key]}. Avaliado em claro e escuro —
                          manual só vale onde o contraste fecha (botão vs badge).
                        </p>
                      </div>
                    )
                  })}
                </div>
              </SectionFrame>
            ) : null}

            {section === 'fundo' ? (
              <SectionFrame
                title="Fundo e grade"
                description="A grade é compartilhada; linha/base vazias herdam as superfícies de cada tema. Amostras mostram claro e escuro."
              >
                <label
                  className="flex items-center gap-2 text-sm text-[rgb(var(--foreground))]"
                  onMouseEnter={() => setFocus('grid')}
                >
                  <input
                    type="checkbox"
                    checked={design.grid.enabled}
                    onChange={(e) =>
                      patch({ grid: { ...design.grid, enabled: e.target.checked } })
                    }
                    className="rounded border-[rgb(var(--border))]"
                  />
                  Exibir grade quadriculada
                </label>
                <div
                  className="space-y-4"
                  onMouseEnter={() => setFocus('grid')}
                >
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[rgb(var(--foreground))]">
                      Célula ({design.grid.sizePx}px)
                    </label>
                    <input
                      type="range"
                      min={24}
                      max={96}
                      step={4}
                      value={design.grid.sizePx}
                      onChange={(e) =>
                        patch({ grid: { ...design.grid, sizePx: Number(e.target.value) } })
                      }
                      className="w-full accent-[rgb(var(--color-primary))]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[rgb(var(--foreground))]">
                      Opacidade ({Math.round(design.grid.lineOpacity * 1000) / 10}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={0.12}
                      step={0.005}
                      value={design.grid.lineOpacity}
                      onChange={(e) =>
                        patch({
                          grid: { ...design.grid, lineOpacity: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-[rgb(var(--color-primary))]"
                    />
                  </div>
                  <ColorField
                    label="Cor da linha"
                    value={design.grid.lineColor}
                    resolved={
                      design.grid.lineColor ??
                      resolveSurfaces(design, 'light').foreground
                    }
                    token="grid"
                    onChange={(v) => patch({ grid: { ...design.grid, lineColor: v } })}
                    allowEmpty
                    emptyLabel="Automático por tema"
                    {...fieldProps}
                  />
                  <ColorField
                    label="Cor de fundo da grade"
                    value={design.grid.baseColor}
                    resolved={
                      design.grid.baseColor ??
                      resolveSurfaces(design, 'light').backgroundSubtle
                    }
                    token="backgroundSubtle"
                    onChange={(v) => patch({ grid: { ...design.grid, baseColor: v } })}
                    allowEmpty
                    emptyLabel="Automático por tema"
                    {...fieldProps}
                  />
                  <DualThemeGridSamples design={design} />
                  <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                    Automático: linha = texto principal e base = fundo sutil de cada
                    tema. Cor fixa vale nos dois — confira as amostras acima.
                  </p>
                </div>
              </SectionFrame>
            ) : null}

            {section === 'superficies' ? (
              <SectionFrame
                title="Superfícies"
                description="Cada token tem cor no claro e no escuro. Edite os dois lados — a prévia segue o modo destacado."
              >
                <div
                  className="flex gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-0.5"
                  role="group"
                  aria-label="Tema das superfícies na prévia"
                >
                  {(['light', 'dark'] as const).map((mode) => {
                    const active = previewMode === mode
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPreviewMode(mode)}
                        className={[
                          'flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                          active
                            ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                            : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                        ].join(' ')}
                      >
                        {mode === 'dark' ? 'Prévia escura' : 'Prévia clara'}
                      </button>
                    )
                  })}
                </div>
                <div className="grid gap-5">
                  {SURFACE_TOKEN_KEYS.map((key) => {
                    const tokenMap: Partial<
                      Record<(typeof SURFACE_TOKEN_KEYS)[number], TokenFocus>
                    > = {
                      background: 'background',
                      backgroundSubtle: 'backgroundSubtle',
                      foreground: 'foreground',
                      foregroundMuted: 'foregroundMuted',
                      border: 'border',
                      surface: 'surface',
                      surfaceRaised: 'surfaceRaised',
                    }
                    const lightVal = design.light?.[key] ?? null
                    const darkVal = design.dark?.[key] ?? null
                    const lightResolved = resolveSurfaces(design, 'light')[key]
                    const darkResolved = resolveSurfaces(design, 'dark')[key]
                    return (
                      <div key={key} className="space-y-2">
                        <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                          {SURFACE_TOKEN_LABELS[key]}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ColorField
                            label="Claro"
                            value={lightVal}
                            resolved={lightResolved}
                            token={tokenMap[key] ?? null}
                            allowEmpty
                            emptyLabel="Usar padrão"
                            onChange={(v) => {
                              const next = { ...(design.light ?? {}) }
                              if (v == null) delete next[key]
                              else next[key] = v
                              patch({ light: next })
                              if (previewMode !== 'light') setPreviewMode('light')
                            }}
                            {...fieldProps}
                          />
                          <ColorField
                            label="Escuro"
                            value={darkVal}
                            resolved={darkResolved}
                            token={tokenMap[key] ?? null}
                            allowEmpty
                            emptyLabel="Usar padrão"
                            onChange={(v) => {
                              const next = { ...(design.dark ?? {}) }
                              if (v == null) delete next[key]
                              else next[key] = v
                              patch({ dark: next })
                              if (previewMode !== 'dark') setPreviewMode('dark')
                            }}
                            {...fieldProps}
                          />
                        </div>
                        <DualThemeSurfaceSamples design={design} tokenKey={key} />
                        {key === 'background' || key === 'surfaceRaised' ? (
                          <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                            {key === 'background'
                              ? 'Canvas atrás de tudo (shell). Ao aplicar uma paleta ou mudar a primária, recebe papel AA nos dois temas — pastel do hue, ou branco puro se a marca for P&B.'
                              : 'Menu/popover e painéis elevados. Texto acompanha o contraste de cada tema.'}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </SectionFrame>
            ) : null}

            <AppButton
              variant="none"
              icon={RotateCcw}
              type="button"
              onClick={handleRestore}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
            >
              Restaurar padrão
            </AppButton>
          </div>
        </div>

        {/* Prévia — scroll interno; pr alinha com o respiro da esquerda / barra */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 xl:overflow-y-auto xl:pr-3">
          <DesignStudioPreview
            design={designUi}
            baselineDesign={normalizedBaseline}
            compareAtivo={compareAtivo && dirty}
            mode={previewMode}
            scene={scene}
            tenantNome={tenantNome}
            focus={focus}
            onSceneChange={setScene}
            onModeChange={setPreviewMode}
            onCompareChange={setCompareAtivo}
          />
          <ContrastPanel checks={contrastChecks} onFix={corrigirContraste} />
        </div>
      </div>

      <StickyPersistBar
        locked={dirty || pending}
        dirtyLabel={dirty ? 'Prévia não salva — só você está vendo' : undefined}
      >
        <AppButton
          variant="none"
          icon={X}
          type="button"
          onClick={handleCancel}
          disabled={pending || !dirty}
          className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] disabled:opacity-40"
        >
          Descartar
        </AppButton>
        <AppButton
          variant="none"
          icon={Save}
          loading={pending}
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[rgb(var(--color-primary-on))] disabled:opacity-40"
          style={{ backgroundColor: design.brand.primary }}
        >
          Salvar e aplicar à torcida
        </AppButton>
      </StickyPersistBar>
    </div>
  )
}
