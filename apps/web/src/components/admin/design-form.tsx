'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Contrast,
  Grid3x3,
  Layers,
  Loader2,
  MousePointerClick,
  Palette,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { applyTenantDesign, type TenantDesign } from '@torcida/ui'
import {
  ACTION_TOKEN_HINTS,
  ACTION_TOKEN_KEYS,
  ACTION_TOKEN_LABELS,
  DEFAULT_ACTIONS,
  DEFAULT_SURFACE_DARK,
  DEFAULT_SURFACE_LIGHT,
  DEFAULT_TENANT_DESIGN,
  SURFACE_TOKEN_KEYS,
  SURFACE_TOKEN_LABELS,
  aplicarPaletaAoDesign,
  contrasteRatio,
  contrasteTextoSobre,
  gerarPaletasSugeridas,
  paletaDoClube,
  resolveTenantDesign,
} from '@torcida/types'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { useUnsavedChanges } from '@/lib/unsaved-changes'
import { runPersistAction } from '@/lib/toast-action'
import { extrairPaletaDeImagem } from '@/lib/extrair-paleta'
import { restaurarDesignPadrao, salvarDesignTenant } from '@/app/admin/design/actions'
import { useTheme } from 'next-themes'
import {
  DesignStudioPreview,
  type PreviewMode,
  type PreviewScene,
  type TokenFocus,
} from '@/components/admin/design-studio-preview'

type EditorSection = 'identidade' | 'acoes' | 'fundo' | 'superficies'

type Props = {
  initialDesign: TenantDesign
  corPrimaria: string
  tenantNome: string
  clubeNome: string | null
  clubeApelido: string | null
  imagemUrls: string[]
}

type ContrastCheck = {
  id: string
  label: string
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
  const defaults = mode === 'dark' ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT
  const overrides = mode === 'dark' ? design.dark : design.light
  return { ...defaults, ...overrides }
}

function buildContrastChecks(design: TenantDesign, mode: PreviewMode): ContrastCheck[] {
  const s = resolveSurfaces(design, mode)
  const actions = { ...DEFAULT_ACTIONS, ...design.actions }
  const primaryOnBtn = contrasteTextoSobre(design.brand.primary) === 'light' ? '#ffffff' : '#0a0a0a'
  const successOnBtn = contrasteTextoSobre(actions.success) === 'light' ? '#ffffff' : '#0a0a0a'

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
      tip: 'Aumente o contraste do texto principal ou ajuste o fundo.',
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
      label: 'Texto secundário',
      fg: s.foregroundMuted,
      bg: s.background,
      min: 4.5,
      tip: 'Descrições ilegíveis. Escureça o texto secundário.',
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
      id: 'primary-btn',
      label: 'Botão primário',
      fg: primaryOnBtn,
      bg: design.brand.primary,
      min: 4.5,
      tip: 'Cor primária fraca para texto do botão.',
    },
    {
      id: 'success-btn',
      label: 'Botão aprovar',
      fg: successOnBtn,
      bg: actions.success,
      min: 3,
      tip: 'Ajuste a cor de sucesso.',
    },
  ]

  return pairs.map((p) => {
    const ratio = contrasteRatio(p.fg, p.bg)
    return {
      id: p.id,
      label: p.label,
      ratio,
      min: p.min,
      ok: ratio >= p.min,
      tip: p.tip,
    }
  })
}

/** Color field: swatch abre o seletor nativo direto; hex editável ao lado. */
function ColorField({
  label,
  value,
  resolved,
  onChange,
  allowEmpty,
  emptyLabel = 'Usar padrão',
  token,
  onFocusToken,
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
}) {
  const [draft, setDraft] = useState(value ?? resolved)
  const colorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value ?? resolved)
  }, [value, resolved])

  const display = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : resolved

  return (
    <div
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
        <button
          type="button"
          onClick={() => colorInputRef.current?.click()}
          className="h-9 w-9 shrink-0 rounded-lg border border-[rgb(var(--border))] shadow-sm ring-offset-2 transition hover:ring-2 hover:ring-sky-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          style={{ backgroundColor: display }}
          title="Escolher cor"
          aria-label={`${label}: escolher cor`}
        />
        <input
          ref={colorInputRef}
          type="color"
          value={display}
          onChange={(e) => {
            onChange(e.target.value)
            setDraft(e.target.value)
          }}
          className="sr-only"
          tabIndex={-1}
        />
        <input
          type="text"
          value={draft}
          placeholder={resolved}
          onChange={(e) => {
            const v = e.target.value
            if (v === '' || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
              setDraft(v)
              if (v === '' && allowEmpty) onChange(null)
              else if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
            }
          }}
          onBlur={() => {
            const v = draft.trim()
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
            else setDraft(value ?? resolved)
          }}
          className="w-full min-w-0 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 font-mono text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
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

function ContrastPanel({ checks }: { checks: ContrastCheck[] }) {
  const fails = checks.filter((c) => !c.ok)
  return (
    <div
      className={[
        'rounded-xl border px-3 py-2.5',
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
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={[
              'text-sm font-medium',
              fails.length > 0
                ? 'text-amber-900 dark:text-amber-100'
                : 'text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {fails.length > 0
              ? `${fails.length} contraste${fails.length > 1 ? 's' : ''} fraco${fails.length > 1 ? 's' : ''} — títulos/textos podem sumir`
              : 'Contraste OK neste modo'}
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {checks.map((c) => (
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
                  <span className="font-medium">{c.label}</span> {c.ratio.toFixed(1)}:1
                  {!c.ok ? ` — ${c.tip}` : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function DesignForm({
  initialDesign,
  corPrimaria,
  tenantNome,
  clubeNome,
  clubeApelido,
  imagemUrls,
}: Props) {
  const baseline = useMemo(
    () => resolveTenantDesign(initialDesign, corPrimaria) as TenantDesign,
    [initialDesign, corPrimaria],
  )
  const normalizedBaseline = useMemo(
    () => ({
      ...baseline,
      actions: { ...DEFAULT_ACTIONS, ...baseline.actions },
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

  // Auto-scene when switching section
  useEffect(() => {
    if (section === 'acoes') setScene('admin')
    else if (section === 'identidade') setScene('portal')
    else if (section === 'fundo') setScene('portal')
  }, [section])

  const clubePaleta = useMemo(
    () => paletaDoClube(clubeNome, clubeApelido),
    [clubeNome, clubeApelido],
  )

  const paletasSugeridas = useMemo(
    () =>
      gerarPaletasSugeridas(design.brand.primary, {
        secondary: design.brand.secondary,
        clube: clubePaleta
          ? {
              primary: clubePaleta.primary,
              secondary: clubePaleta.secondary,
              accents: clubePaleta.accents,
            }
          : null,
        extraidas: extracted,
      }),
    [design.brand.primary, design.brand.secondary, clubePaleta, extracted],
  )

  const contrastChecks = useMemo(
    () => buildContrastChecks(design, previewMode),
    [design, previewMode],
  )

  const surfacesResolved = resolveSurfaces(design, previewMode)
  const surfacesOverrides = previewMode === 'dark' ? design.dark : design.light

  function patch(partial: Partial<TenantDesign>) {
    setDesign((d) => ({ ...d, ...partial }))
  }

  function applyPaletaCompleta(
    paleta: ReturnType<typeof gerarPaletasSugeridas>[number],
  ) {
    setDesign(aplicarPaletaAoDesign(design, paleta) as TenantDesign)
    setFocus('brand.primary')
    setCompareAtivo(false)
    setSection('identidade')
  }

  function handleCancel() {
    setDesign(normalizedBaseline)
    setFocus(null)
  }

  function handleSave() {
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarDesignTenant(design), {
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
    <div data-persist-bar-root className="pb-24">
      <div className="flex flex-col gap-6 xl:grid xl:h-[calc(100vh-11rem)] xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] xl:items-stretch xl:gap-6">
        {/* Inspector */}
        <div className="flex min-h-0 flex-col gap-4 xl:overflow-hidden">
          <div
            className="flex shrink-0 gap-1 overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-1"
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
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors sm:text-sm',
                    active
                      ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                      : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {s.label}
                </button>
              )
            })}
          </div>

          <div className="min-h-0 flex-1 space-y-5 xl:overflow-y-auto xl:pr-1">
            {section === 'identidade' ? (
              <SectionFrame
                title="Identidade"
                description="Escolha uma paleta pronta ou ajuste a marca. A prévia mostra o resultado na hora."
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--foreground))]">
                    <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                    Paletas sugeridas
                  </div>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    Prioridade: marca da torcida, escudo e clube afiliado. Sem
                    cores de rivalidade inventadas por harmonia genérica.
                  </p>
                  {extracting ? (
                    <p className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Extraindo cores do escudo…
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {paletasSugeridas.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPaletaCompleta(p)}
                        className="group w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-left transition-colors hover:border-sky-400 hover:bg-[rgb(var(--background-subtle))]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                              {p.nome}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
                              {p.descricao}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 opacity-0 transition-opacity group-hover:opacity-100 dark:text-sky-300">
                            Aplicar
                          </span>
                        </div>
                        <div className="mt-2.5 flex overflow-hidden rounded-lg">
                          {p.swatches.map((hex, i) => (
                            <span
                              key={`${p.id}-${hex}-${i}`}
                              className="h-8 flex-1 first:rounded-l-lg last:rounded-r-lg"
                              style={{ backgroundColor: hex }}
                              title={hex}
                            />
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
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
                      if (v) patch({ brand: { ...design.brand, primary: v } })
                    }}
                    {...fieldProps}
                  />
                  <ColorField
                    label="Cor secundária"
                    value={design.brand.secondary}
                    resolved={design.brand.secondary ?? '#888888'}
                    token="brand.secondary"
                    onChange={(v) => patch({ brand: { ...design.brand, secondary: v } })}
                    allowEmpty
                    emptyLabel="Remover"
                    {...fieldProps}
                  />
                  <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                    Aparece no botão Curtir, badge Destaque, faixa do evento e link “Criar conta”
                    (cena Login). Passe o mouse neste campo para destacar na prévia.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const pack = paletasSugeridas.find((p) => p.id === 'marca-torcida')
                      if (pack) applyPaletaCompleta(pack)
                    }}
                    className="text-left text-xs font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
                  >
                    Reequilibrar ações a partir da primária atual
                  </button>
                </div>
              </SectionFrame>
            ) : null}

            {section === 'acoes' ? (
              <SectionFrame
                title="Ações e status"
                description="Olhe a cena Admin na prévia: aprovar, reprovar e pendente."
              >
                <div className="grid gap-4">
                  {ACTION_TOKEN_KEYS.map((key) => (
                    <div key={key} className="space-y-1">
                      <ColorField
                        label={ACTION_TOKEN_LABELS[key]}
                        value={design.actions?.[key] ?? DEFAULT_ACTIONS[key]}
                        resolved={design.actions?.[key] ?? DEFAULT_ACTIONS[key]}
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
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        {ACTION_TOKEN_HINTS[key]}
                      </p>
                    </div>
                  ))}
                </div>
              </SectionFrame>
            ) : null}

            {section === 'fundo' ? (
              <SectionFrame
                title="Fundo e grade"
                description="A área quadriculada atrás dos cartões na prévia."
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
                      className="w-full accent-[rgb(var(--primary))]"
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
                      className="w-full accent-[rgb(var(--primary))]"
                    />
                  </div>
                  <ColorField
                    label="Cor da linha"
                    value={design.grid.lineColor}
                    resolved={design.grid.lineColor ?? surfacesResolved.foreground}
                    token="grid"
                    onChange={(v) => patch({ grid: { ...design.grid, lineColor: v } })}
                    allowEmpty
                    emptyLabel="Usar texto"
                    {...fieldProps}
                  />
                  <ColorField
                    label="Cor de fundo da grade"
                    value={design.grid.baseColor}
                    resolved={design.grid.baseColor ?? surfacesResolved.backgroundSubtle}
                    token="backgroundSubtle"
                    onChange={(v) => patch({ grid: { ...design.grid, baseColor: v } })}
                    allowEmpty
                    emptyLabel="Usar fundo sutil"
                    {...fieldProps}
                  />
                </div>
              </SectionFrame>
            ) : null}

            {section === 'superficies' ? (
              <SectionFrame
                title="Superfícies"
                description={`Editando modo ${previewMode === 'dark' ? 'escuro' : 'claro'} — troque na prévia.`}
              >
                <div className="grid gap-4">
                  {SURFACE_TOKEN_KEYS.map((key) => {
                    const tokenMap: Partial<Record<(typeof SURFACE_TOKEN_KEYS)[number], TokenFocus>> =
                      {
                        background: 'background',
                        backgroundSubtle: 'backgroundSubtle',
                        foreground: 'foreground',
                        foregroundMuted: 'foregroundMuted',
                        border: 'border',
                        surface: 'surface',
                        surfaceRaised: 'surfaceRaised',
                      }
                    return (
                      <div key={key} className="grid gap-1.5">
                        <ColorField
                          label={SURFACE_TOKEN_LABELS[key]}
                          value={surfacesOverrides[key] ?? null}
                          resolved={surfacesResolved[key]}
                          token={tokenMap[key] ?? null}
                          allowEmpty
                          emptyLabel="Usar padrão"
                          onChange={(v) => {
                            const next = { ...surfacesOverrides }
                            if (v == null) delete next[key]
                            else next[key] = v
                            if (previewMode === 'dark') patch({ dark: next })
                            else patch({ light: next })
                          }}
                          {...fieldProps}
                        />
                        {key === 'background' || key === 'surfaceRaised' ? (
                          <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                            {key === 'background'
                              ? 'Canvas atrás de tudo (shell). Ao aplicar uma paleta, recebe tint leve da marca.'
                              : 'Cartões elevados, popovers e menus. Ao aplicar uma paleta, fica um pouco mais clara/tintada que a superfície.'}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </SectionFrame>
            ) : null}

            <button
              type="button"
              onClick={handleRestore}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar padrão
            </button>
          </div>
        </div>

        {/* Studio preview — dominant */}
        <div className="flex min-h-[520px] flex-col gap-3 xl:min-h-0">
          <DesignStudioPreview
            design={design}
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
          <ContrastPanel checks={contrastChecks} />
        </div>
      </div>

      <StickyPersistBar
        locked={dirty || pending}
        dirtyLabel={dirty ? 'Prévia não salva — só você está vendo' : undefined}
      >
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending || !dirty}
          className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] disabled:opacity-40"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: design.brand.primary }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar e aplicar à torcida
        </button>
      </StickyPersistBar>
    </div>
  )
}
