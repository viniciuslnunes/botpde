'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Contrast,
  Grid3x3,
  Layers,
  Loader2,
  MousePointerClick,
  Palette,
  RotateCcw,
  Sparkles,
  X,
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
  contrasteRatio,
  contrasteTextoSobre,
  derivarSuperficiesDaMarca,
  designFromPrimary,
  paletaDoClube,
  resolveTenantDesign,
} from '@torcida/types'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { useUnsavedChanges } from '@/lib/unsaved-changes'
import { runPersistAction } from '@/lib/toast-action'
import { extrairPaletaDeImagem } from '@/lib/extrair-paleta'
import { restaurarDesignPadrao, salvarDesignTenant } from '@/app/admin/design/actions'
import { useTheme } from 'next-themes'

type SurfaceMode = 'light' | 'dark'
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

function ColorField({
  label,
  value,
  onChange,
  allowEmpty,
  emptyLabel = 'Automático',
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const hex = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-[rgb(var(--foreground))]">{label}</label>
        {allowEmpty ? (
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
        <div
          className="h-9 w-9 shrink-0 rounded-lg border border-[rgb(var(--border))] shadow-sm"
          style={{ backgroundColor: value ?? 'transparent' }}
        />
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 cursor-pointer rounded-lg border border-[rgb(var(--border))] bg-transparent p-0.5"
        />
        <input
          type="text"
          value={draft}
          placeholder="#RRGGBB"
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
            else setDraft(value ?? '')
          }}
          className="w-28 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 font-mono text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          maxLength={7}
        />
      </div>
    </div>
  )
}

function resolveSurfaces(design: TenantDesign, mode: SurfaceMode) {
  const defaults = mode === 'dark' ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT
  const overrides = mode === 'dark' ? design.dark : design.light
  return {
    background: overrides.background ?? defaults.background,
    backgroundSubtle: overrides.backgroundSubtle ?? defaults.backgroundSubtle,
    foreground: overrides.foreground ?? defaults.foreground,
    foregroundMuted: overrides.foregroundMuted ?? defaults.foregroundMuted,
    border: overrides.border ?? defaults.border,
    borderStrong: overrides.borderStrong ?? defaults.borderStrong,
    surface: overrides.surface ?? defaults.surface,
    surfaceRaised: overrides.surfaceRaised ?? defaults.surfaceRaised,
  }
}

function buildContrastChecks(design: TenantDesign, mode: SurfaceMode): ContrastCheck[] {
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
      tip: 'Aumente o contraste do texto principal ou escureça/clareie o fundo da página.',
    },
    {
      id: 'title-subtle',
      label: 'Título no fundo sutil',
      fg: s.foreground,
      bg: s.backgroundSubtle,
      min: 4.5,
      tip: 'Títulos em áreas com grade usam o fundo sutil — ajuste texto ou fundo sutil.',
    },
    {
      id: 'muted',
      label: 'Texto secundário no fundo',
      fg: s.foregroundMuted,
      bg: s.background,
      min: 4.5,
      tip: 'Descrições e labels ficam ilegíveis. Escureça o texto secundário.',
    },
    {
      id: 'card',
      label: 'Texto em cartão',
      fg: s.foreground,
      bg: s.surface,
      min: 4.5,
      tip: 'Cartões e painéis precisam de texto legível sobre a superfície.',
    },
    {
      id: 'primary-btn',
      label: 'Texto no botão primário',
      fg: primaryOnBtn,
      bg: design.brand.primary,
      min: 4.5,
      tip: 'A cor primária está muito clara ou escura demais para texto branco/preto.',
    },
    {
      id: 'success-btn',
      label: 'Texto no botão aprovar',
      fg: successOnBtn,
      bg: actions.success,
      min: 3,
      tip: 'Ajuste a cor de sucesso para o texto do botão continuar legível.',
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

function DesignLivePreview({
  design,
  mode,
  tenantNome,
  onModeChange,
}: {
  design: TenantDesign
  mode: SurfaceMode
  tenantNome: string
  onModeChange: (m: SurfaceMode) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!rootRef.current) return
    applyTenantDesign(design, mode, rootRef.current)
  }, [design, mode])

  const checks = useMemo(() => buildContrastChecks(design, mode), [design, mode])
  const fails = checks.filter((c) => !c.ok)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Prévia ao vivo</p>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Só aqui — a plataforma só muda ao salvar
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-0.5">
          {(['dark', 'light'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                mode === m
                  ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                  : 'text-[rgb(var(--foreground-muted))]',
              ].join(' ')}
            >
              {m === 'dark' ? 'Escuro' : 'Claro'}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={rootRef}
        className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] shadow-lg"
        data-design-preview
      >
        {/* Mini shell — herda CSS vars do rootRef */}
        <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold text-white"
              style={{ backgroundColor: 'rgb(var(--color-primary))' }}
            >
              {tenantNome.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[rgb(var(--foreground))]">
                {tenantNome}
              </p>
              <p className="text-[10px] text-[rgb(var(--foreground-muted))]">Administração</p>
            </div>
          </div>
        </div>

        <div
          className="space-y-3 p-3"
          style={{
            ...gridPreviewStyle(design, mode),
            minHeight: 280,
          }}
        >
          <div>
            <h3 className="text-base font-bold text-[rgb(var(--foreground))]">Título da página</h3>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Texto secundário — descrições e labels
            </p>
          </div>

          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Cartão de conteúdo</p>
                <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
                  Superfície elevada sobre o fundo com grade. Assim fica o portal e o admin.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[rgb(var(--color-primary)_/_0.14)] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-primary))]">
                Badge
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: 'rgb(var(--color-primary))' }}
              >
                Primário
              </button>
              <button
                type="button"
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))] px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--foreground))]"
              >
                Cancelar
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Fluxo de aprovação
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--color-success))] px-2.5 py-1.5 text-[11px] font-semibold text-white">
                <Check className="h-3 w-3" />
                Aprovar
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-danger)_/_0.28)] bg-[rgb(var(--color-danger)_/_0.1)] px-2.5 py-1.5 text-[11px] font-semibold text-[rgb(var(--color-danger))]">
                <X className="h-3 w-3" />
                Reprovar
              </span>
              <span className="rounded-lg bg-[rgb(var(--color-warning))] px-2.5 py-1.5 text-[11px] font-semibold text-white">
                Pendente
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[rgb(var(--color-success)_/_0.14)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-success))]">
                Aprovado
              </span>
              <span className="rounded-full bg-[rgb(var(--color-danger)_/_0.14)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-danger))]">
                Reprovado
              </span>
              <span className="rounded-full bg-[rgb(var(--color-warning)_/_0.14)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-warning))]">
                Na fila
              </span>
              <span className="rounded-full bg-[rgb(var(--color-info)_/_0.14)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-info))]">
                Info
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contraste */}
      <div
        className={[
          'rounded-xl border px-3 py-2.5',
          fails.length > 0
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-emerald-500/30 bg-emerald-500/10',
        ].join(' ')}
      >
        <div className="flex items-start gap-2">
          {fails.length > 0 ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p
              className={[
                'text-sm font-medium',
                fails.length > 0
                  ? 'text-amber-900 dark:text-amber-100'
                  : 'text-emerald-900 dark:text-emerald-100',
              ].join(' ')}
            >
              {fails.length > 0
                ? `${fails.length} problema${fails.length > 1 ? 's' : ''} de contraste`
                : 'Contraste OK neste modo'}
            </p>
            <ul className="space-y-1">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs">
                  <Contrast
                    className={[
                      'mt-0.5 h-3 w-3 shrink-0',
                      c.ok
                        ? 'text-emerald-600 dark:text-emerald-400'
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
                    <span className="font-medium">{c.label}</span>
                    {' · '}
                    {c.ratio.toFixed(1)}:1
                    {!c.ok ? ` (mín. ${c.min}:1) — ${c.tip}` : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
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
  const [design, setDesign] = useState<TenantDesign>(() => ({
    ...baseline,
    actions: { ...DEFAULT_ACTIONS, ...baseline.actions },
  }))
  const [section, setSection] = useState<EditorSection>('identidade')
  const [previewMode, setPreviewMode] = useState<SurfaceMode>('dark')
  const [pending, startTransition] = useTransition()
  const [extracted, setExtracted] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const { resolvedTheme } = useTheme()

  const dirty = useMemo(
    () => JSON.stringify(design) !== JSON.stringify({ ...baseline, actions: { ...DEFAULT_ACTIONS, ...baseline.actions } }),
    [design, baseline],
  )

  useUnsavedChanges({
    id: 'admin-design',
    title: 'Design da plataforma',
    isDirty: dirty,
    changes: dirty ? ['Cores e tokens do tema'] : [],
  })

  // Mantém o documento no design SALVO — draft só na prévia.
  useEffect(() => {
    const mode = (resolvedTheme === 'light' ? 'light' : 'dark') as SurfaceMode
    applyTenantDesign(baseline, mode)
  }, [baseline, resolvedTheme])

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

  const clubePaleta = useMemo(
    () => paletaDoClube(clubeNome, clubeApelido),
    [clubeNome, clubeApelido],
  )

  function patch(partial: Partial<TenantDesign>) {
    setDesign((d) => ({ ...d, ...partial }))
  }

  function applySuggestion(primary: string, secondary?: string | null) {
    const derived = derivarSuperficiesDaMarca(primary)
    const next = designFromPrimary(primary, secondary ?? derived.secondary) as TenantDesign
    next.light = { ...next.light, ...derived.light }
    next.dark = { ...next.dark, ...derived.dark }
    next.grid = { ...design.grid }
    next.actions = { ...DEFAULT_ACTIONS, ...design.actions }
    setDesign(next)
  }

  function handleCancel() {
    setDesign({ ...baseline, actions: { ...DEFAULT_ACTIONS, ...baseline.actions } })
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

  const surfaces = previewMode === 'dark' ? design.dark : design.light
  const surfaceDefaults = previewMode === 'dark' ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT

  return (
    <div data-persist-bar-root className="pb-24">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start lg:gap-8">
        {/* Controles */}
        <div className="min-w-0 space-y-6">
          <div
            className="flex gap-1 overflow-x-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-1"
            role="tablist"
            aria-label="Seções do design"
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
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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

          {/* Preview no mobile (acima dos controles) */}
          <div className="lg:hidden">
            <DesignLivePreview
              design={design}
              mode={previewMode}
              tenantNome={tenantNome}
              onModeChange={setPreviewMode}
            />
          </div>

          {section === 'identidade' ? (
            <SectionFrame
              title="Identidade"
              description="Cores da marca em botões, badges e destaques."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <ColorField
                  label="Cor primária"
                  value={design.brand.primary}
                  onChange={(v) => {
                    if (v) patch({ brand: { ...design.brand, primary: v } })
                  }}
                />
                <ColorField
                  label="Cor secundária"
                  value={design.brand.secondary}
                  onChange={(v) => patch({ brand: { ...design.brand, secondary: v } })}
                  allowEmpty
                  emptyLabel="Remover"
                />
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--foreground))]">
                  <Sparkles className="h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]" />
                  Sugestões
                </div>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  Clique para aplicar na prévia (ainda não salva).
                </p>
                <div className="flex flex-wrap gap-2">
                  {clubePaleta ? (
                    <button
                      type="button"
                      onClick={() => applySuggestion(clubePaleta.primary, clubePaleta.secondary)}
                      className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-left transition-colors hover:border-[rgb(var(--primary))]"
                    >
                      <span className="flex -space-x-1">
                        <span
                          className="h-6 w-6 rounded-full border-2 border-[rgb(var(--surface))]"
                          style={{ backgroundColor: clubePaleta.primary }}
                        />
                        <span
                          className="h-6 w-6 rounded-full border-2 border-[rgb(var(--surface))]"
                          style={{ backgroundColor: clubePaleta.secondary }}
                        />
                      </span>
                      <span className="text-xs font-medium text-[rgb(var(--foreground))]">
                        Paleta do clube
                        {clubeNome ? ` · ${clubeApelido ?? clubeNome}` : ''}
                      </span>
                    </button>
                  ) : null}
                  {extracting ? (
                    <span className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Lendo escudo…
                    </span>
                  ) : null}
                  {extracted.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => applySuggestion(hex)}
                      className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 transition-colors hover:border-[rgb(var(--primary))]"
                    >
                      <span
                        className="h-6 w-6 rounded-full border border-[rgb(var(--border))]"
                        style={{ backgroundColor: hex }}
                      />
                      <span className="font-mono text-xs text-[rgb(var(--foreground-muted))]">
                        {hex}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </SectionFrame>
          ) : null}

          {section === 'acoes' ? (
            <SectionFrame
              title="Ações e status"
              description="Botões e badges de aprovar, reprovar, cancelar e avisos."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                {ACTION_TOKEN_KEYS.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <ColorField
                      label={ACTION_TOKEN_LABELS[key]}
                      value={design.actions?.[key] ?? DEFAULT_ACTIONS[key]}
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
              description="Padrão quadriculado do shell. Veja o resultado na prévia."
            >
              <label className="flex items-center gap-2 text-sm text-[rgb(var(--foreground))]">
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
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[rgb(var(--foreground))]">
                    Tamanho da célula ({design.grid.sizePx}px)
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
                  onChange={(v) => patch({ grid: { ...design.grid, lineColor: v } })}
                  allowEmpty
                  emptyLabel="Usar texto"
                />
                <ColorField
                  label="Cor de fundo da grade"
                  value={design.grid.baseColor}
                  onChange={(v) => patch({ grid: { ...design.grid, baseColor: v } })}
                  allowEmpty
                  emptyLabel="Usar fundo sutil"
                />
              </div>
            </SectionFrame>
          ) : null}

          {section === 'superficies' ? (
            <SectionFrame
              title="Superfícies"
              description="Fundos, textos e bordas. Alterne Escuro/Claro na prévia para auditar cada modo."
            >
              <p className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]">
                Editando tokens do modo{' '}
                <strong className="text-[rgb(var(--foreground))]">
                  {previewMode === 'dark' ? 'escuro' : 'claro'}
                </strong>
                . Use o seletor da prévia para trocar.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                {SURFACE_TOKEN_KEYS.map((key) => (
                  <ColorField
                    key={key}
                    label={SURFACE_TOKEN_LABELS[key]}
                    value={surfaces[key] ?? null}
                    allowEmpty
                    emptyLabel={`Padrão (${surfaceDefaults[key]})`}
                    onChange={(v) => {
                      const next = { ...surfaces }
                      if (v == null) delete next[key]
                      else next[key] = v
                      if (previewMode === 'dark') patch({ dark: next })
                      else patch({ light: next })
                    }}
                  />
                ))}
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

        {/* Prévia sticky (desktop) */}
        <aside className="sticky top-4 hidden lg:block">
          <DesignLivePreview
            design={design}
            mode={previewMode}
            tenantNome={tenantNome}
            onModeChange={setPreviewMode}
          />
        </aside>
      </div>

      <StickyPersistBar
        locked={dirty || pending}
        dirtyLabel={dirty ? 'Alterações no design (não salvas)' : undefined}
      >
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending || !dirty}
          className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-opacity disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: design.brand.primary }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar design
        </button>
      </StickyPersistBar>
    </div>
  )
}

function hexToRgbInline(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

function gridPreviewStyle(design: TenantDesign, mode: SurfaceMode): CSSProperties {
  const surfaces = resolveSurfaces(design, mode)
  const lineHex = design.grid.lineColor ?? surfaces.foreground
  const base = design.grid.baseColor ?? surfaces.backgroundSubtle
  const line = hexToRgbInline(lineHex)
  const opacity = design.grid.lineOpacity
  return {
    backgroundColor: base,
    backgroundImage: design.grid.enabled
      ? `linear-gradient(rgb(${line} / ${opacity}) 1px, transparent 1px), linear-gradient(90deg, rgb(${line} / ${opacity}) 1px, transparent 1px)`
      : 'none',
    backgroundSize: `${design.grid.sizePx}px ${design.grid.sizePx}px`,
  }
}
