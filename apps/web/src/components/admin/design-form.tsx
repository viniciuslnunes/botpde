'use client'

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react'
import {
  Loader2,
  Palette,
  RotateCcw,
  Sparkles,
  Grid3x3,
  Layers,
  Contrast,
  MousePointerClick,
} from 'lucide-react'
import { applyTenantDesign, type TenantDesign } from '@torcida/ui'
import {
  DEFAULT_ACTIONS,
  DEFAULT_SURFACE_DARK,
  DEFAULT_SURFACE_LIGHT,
  DEFAULT_TENANT_DESIGN,
  ACTION_TOKEN_HINTS,
  ACTION_TOKEN_KEYS,
  ACTION_TOKEN_LABELS,
  SURFACE_TOKEN_KEYS,
  SURFACE_TOKEN_LABELS,
  contrasteRatio,
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

type Props = {
  initialDesign: TenantDesign
  corPrimaria: string
  clubeNome: string | null
  clubeApelido: string | null
  imagemUrls: string[]
}

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

export function DesignForm({
  initialDesign,
  corPrimaria,
  clubeNome,
  clubeApelido,
  imagemUrls,
}: Props) {
  const baseline = useMemo(
    () => resolveTenantDesign(initialDesign, corPrimaria) as TenantDesign,
    [initialDesign, corPrimaria],
  )
  const [design, setDesign] = useState<TenantDesign>(baseline)
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('dark')
  const [pending, startTransition] = useTransition()
  const [extracted, setExtracted] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  const dirty = useMemo(() => JSON.stringify(design) !== JSON.stringify(baseline), [design, baseline])

  useUnsavedChanges({
    id: 'admin-design',
    title: 'Design da plataforma',
    isDirty: dirty,
    changes: dirty ? ['Cores e tokens do tema'] : [],
  })

  // Preview ao vivo no documento
  useEffect(() => {
    const mode =
      (resolvedTheme === 'light' ? 'light' : 'dark') as SurfaceMode
    applyTenantDesign(design, mode)
  }, [design, resolvedTheme])

  // Extração de paleta das imagens
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

  const contrastWarn = useMemo(() => {
    const defaults = surfaceMode === 'dark' ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT
    const overrides = surfaceMode === 'dark' ? design.dark : design.light
    const fg = overrides.foreground ?? defaults.foreground
    const bg = overrides.background ?? defaults.background
    const ratio = contrasteRatio(fg, bg)
    return ratio < 4.5 ? ratio : null
  }, [design, surfaceMode])

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
    setDesign(baseline)
    applyTenantDesign(baseline, resolvedTheme === 'light' ? 'light' : 'dark')
  }

  function handleSave() {
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarDesignTenant(design), {
        success: 'Design salvo. A plataforma já reflete as cores.',
      })
      if (ok) {
        // Recarrega baseline via refresh do servidor — o form fica pristine após revalidate
        window.location.reload()
      }
    })
  }

  function handleRestore() {
    startTransition(async () => {
      const ok = await runPersistAction(() => restaurarDesignPadrao(), {
        success: 'Design restaurado para o padrão Torcida.',
      })
      if (ok) {
        setDesign(DEFAULT_TENANT_DESIGN as TenantDesign)
        window.location.reload()
      }
    })
  }

  const surfaces = surfaceMode === 'dark' ? design.dark : design.light
  const surfaceDefaults = surfaceMode === 'dark' ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT

  return (
    <div data-persist-bar-root className="space-y-10 pb-24">
      {/* Identidade */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Identidade</h2>
        </div>
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Cores da marca usadas em botões, badges e destaques da plataforma.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
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
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span className="text-xs text-[rgb(var(--foreground-muted))]">Preview:</span>
          <span
            className="rounded-full px-3 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: design.brand.primary }}
          >
            Membro ativo
          </span>
          <span
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: design.brand.primary }}
          >
            Botão
          </span>
          {design.brand.secondary ? (
            <span
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
              style={{
                borderColor: design.brand.secondary,
                color: design.brand.secondary,
              }}
            >
              Secundária
            </span>
          ) : null}
        </div>
      </section>

      {/* Sugestões */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Sugestões</h2>
        </div>
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Baseadas no time afiliado e nas cores do escudo/logo da torcida. Clique para aplicar.
        </p>
        <div className="flex flex-wrap gap-2">
          {clubePaleta ? (
            <button
              type="button"
              onClick={() => applySuggestion(clubePaleta.primary, clubePaleta.secondary)}
              className="group flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-left transition-colors hover:border-[rgb(var(--primary))]"
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
              title={`Usar ${hex}`}
              className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 transition-colors hover:border-[rgb(var(--primary))]"
            >
              <span
                className="h-6 w-6 rounded-full border border-[rgb(var(--border))]"
                style={{ backgroundColor: hex }}
              />
              <span className="font-mono text-xs text-[rgb(var(--foreground-muted))]">{hex}</span>
            </button>
          ))}

          {!clubePaleta && extracted.length === 0 && !extracting ? (
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Sem sugestões automáticas — defina a afiliação ou envie um logo para extrair cores.
            </p>
          ) : null}
        </div>
      </section>

      {/* Ações e status */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Ações e status</h2>
        </div>
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Cores de botões e badges em fluxos como aprovar, reprovar, cancelar e avisos.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {ACTION_TOKEN_KEYS.map((key) => (
            <div key={key} className="space-y-2">
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
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-[rgb(var(--foreground-muted))]">Preview:</span>
          <button
            type="button"
            className="btn-success rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Aprovar
          </button>
          <button
            type="button"
            className="btn-danger-soft rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Reprovar
          </button>
          <button
            type="button"
            className="btn-warning rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Atenção
          </button>
          <span className="rounded-full bg-[rgb(var(--color-success)_/_0.14)] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--color-success))]">
            Ativo
          </span>
          <span className="rounded-full bg-[rgb(var(--color-danger)_/_0.14)] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--color-danger))]">
            Reprovado
          </span>
          <span className="rounded-full bg-[rgb(var(--color-warning)_/_0.14)] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--color-warning))]">
            Pendente
          </span>
        </div>
      </section>

      {/* Fundo e grade */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Grid3x3 className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Fundo e grade</h2>
        </div>
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          O padrão quadriculado do shell (admin e portal). Ajuste tamanho, opacidade e cores.
        </p>

        <div
          className="h-36 overflow-hidden rounded-2xl border border-[rgb(var(--border))]"
          style={gridPreviewStyle(design)}
        />

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

        <div className="grid gap-6 sm:grid-cols-2">
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
              Opacidade das linhas ({Math.round(design.grid.lineOpacity * 1000) / 10}%)
            </label>
            <input
              type="range"
              min={0}
              max={0.12}
              step={0.005}
              value={design.grid.lineOpacity}
              onChange={(e) =>
                patch({ grid: { ...design.grid, lineOpacity: Number(e.target.value) } })
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
      </section>

      {/* Superfícies */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Superfícies</h2>
        </div>
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Tokens de fundo, texto e bordas por modo. O visitante escolhe claro/escuro no toggle;
          aqui você define cada um.
        </p>

        <div className="flex gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-1 w-fit">
          {(['dark', 'light'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setSurfaceMode(mode)
                setTheme(mode)
              }}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                surfaceMode === mode
                  ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                  : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {mode === 'dark' ? 'Escuro' : 'Claro'}
            </button>
          ))}
        </div>

        {contrastWarn != null ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <Contrast className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Contraste texto/fundo baixo ({contrastWarn.toFixed(1)}:1). Recomendado ≥ 4.5:1 para
              leitura confortável.
            </span>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SURFACE_TOKEN_KEYS.map((key) => {
            const current = surfaces[key] ?? null
            const label = SURFACE_TOKEN_LABELS[key]
            return (
              <ColorField
                key={key}
                label={label}
                value={current}
                allowEmpty
                emptyLabel={`Padrão (${surfaceDefaults[key]})`}
                onChange={(v) => {
                  const next = { ...surfaces }
                  if (v == null) delete next[key]
                  else next[key] = v
                  if (surfaceMode === 'dark') patch({ dark: next })
                  else patch({ light: next })
                }}
              />
            )
          })}
        </div>
      </section>

      <div className="flex items-center gap-3">
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

      <StickyPersistBar locked={dirty || pending} dirtyLabel={dirty ? 'Alterações no design' : undefined}>
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
          className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: design.brand.primary }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar design
        </button>
      </StickyPersistBar>
    </div>
  )
}

/** Converte hex → canais RGB. */
function hexToRgbInline(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

function gridPreviewStyle(design: TenantDesign): CSSProperties {
  const lineHex = design.grid.lineColor ?? '#a1a1aa'
  const base = design.grid.baseColor ?? undefined
  const line = hexToRgbInline(lineHex)
  const opacity = design.grid.lineOpacity
  return {
    backgroundColor: base ?? 'rgb(var(--grid-base))',
    backgroundImage: design.grid.enabled
      ? `linear-gradient(rgb(${line} / ${opacity}) 1px, transparent 1px), linear-gradient(90deg, rgb(${line} / ${opacity}) 1px, transparent 1px)`
      : 'none',
    backgroundSize: `${design.grid.sizePx}px ${design.grid.sizePx}px`,
  }
}
