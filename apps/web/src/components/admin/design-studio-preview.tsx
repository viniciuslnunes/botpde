'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import {
  Bell,
  Calendar,
  Check,
  Home,
  MessageCircle,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react'
import { applyTenantDesign, type TenantDesign } from '@torcida/ui'
import {
  DEFAULT_ACTIONS,
  DEFAULT_ACTIONS_FG,
  DEFAULT_SURFACE_DARK,
  DEFAULT_SURFACE_LIGHT,
  contrasteTextoSobre,
  corMarcaLegivel,
  resolveActionTextColors,
} from '@torcida/types'

export type PreviewScene = 'portal' | 'admin' | 'entrar'
export type PreviewMode = 'light' | 'dark'

export type TokenFocus =
  | 'brand.primary'
  | 'brand.secondary'
  | 'actions.success'
  | 'actions.danger'
  | 'actions.warning'
  | 'actions.info'
  | 'grid'
  | 'background'
  | 'backgroundSubtle'
  | 'foreground'
  | 'foregroundMuted'
  | 'border'
  | 'surface'
  | 'surfaceRaised'
  | null

export type DesignStudioPreviewProps = {
  design: TenantDesign
  /** Se definido com compareAtivo, mostra o design salvo (antes). */
  baselineDesign?: TenantDesign
  compareAtivo?: boolean
  mode: PreviewMode
  scene: PreviewScene
  tenantNome: string
  focus: TokenFocus
  onSceneChange: (s: PreviewScene) => void
  onModeChange: (m: PreviewMode) => void
  onCompareChange?: (ativo: boolean) => void
}

function resolveSurfaces(design: TenantDesign, mode: PreviewMode) {
  const defaults = mode === 'dark' ? DEFAULT_SURFACE_DARK : DEFAULT_SURFACE_LIGHT
  const overrides = mode === 'dark' ? design.dark : design.light
  return { ...defaults, ...overrides }
}

function Hotspot({
  token,
  children,
  className = '',
}: {
  token: NonNullable<TokenFocus>
  /** Mantido por compatibilidade — a prévia não destaca mais o token (rodapé já mostra rascunho). */
  focus?: TokenFocus
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div data-token={token} className={className || undefined}>
      {children}
    </div>
  )
}

function gridStyle(design: TenantDesign, mode: PreviewMode): CSSProperties {
  const surfaces = resolveSurfaces(design, mode)
  const lineHex = design.grid.lineColor ?? surfaces.foreground
  const base = design.grid.baseColor ?? surfaces.backgroundSubtle
  const r = parseInt(lineHex.slice(1, 3), 16)
  const g = parseInt(lineHex.slice(3, 5), 16)
  const b = parseInt(lineHex.slice(5, 7), 16)
  const opacity = design.grid.lineOpacity
  return {
    backgroundColor: base,
    backgroundImage: design.grid.enabled
      ? `linear-gradient(rgb(${r} ${g} ${b} / ${opacity}) 1px, transparent 1px), linear-gradient(90deg, rgb(${r} ${g} ${b} / ${opacity}) 1px, transparent 1px)`
      : 'none',
    backgroundSize: `${design.grid.sizePx}px ${design.grid.sizePx}px`,
  }
}

function PortalScene({
  design,
  mode,
  tenantNome,
  focus,
}: {
  design: TenantDesign
  mode: PreviewMode
  tenantNome: string
  focus: TokenFocus
}) {
  const actions = { ...DEFAULT_ACTIONS, ...design.actions }
  const surfaces = resolveSurfaces(design, mode)
  const primaryOnBtn =
    contrasteTextoSobre(design.brand.primary) === 'light' ? '#ffffff' : '#0a0a0a'
  const primaryFg = corMarcaLegivel(design.brand.primary, surfaces.surface)
  const secondaryHex =
    design.brand.secondary ??
    (contrasteTextoSobre(design.brand.primary) === 'light' ? '#f4f4f5' : '#27272a')
  const secondaryFg = corMarcaLegivel(secondaryHex, surfaces.surface)
  const raisedOn =
    contrasteTextoSobre(surfaces.surfaceRaised) === 'light' ? '#ffffff' : '#0a0a0a'
  const raisedMuted =
    contrasteTextoSobre(surfaces.surfaceRaised) === 'light'
      ? 'rgba(255,255,255,0.72)'
      : 'rgba(10,10,10,0.58)'
  const actionText = (key: keyof typeof DEFAULT_ACTIONS) =>
    resolveActionTextColors(
      actions[key],
      design.actionsFg?.[key] ?? DEFAULT_ACTIONS_FG[key],
      surfaces.surface,
    )
  const nav = [
    { icon: Home, label: 'Início' },
    { icon: Users, label: 'Comunidade', active: true },
    { icon: Calendar, label: 'Agenda' },
    { icon: ShoppingBag, label: 'Loja' },
  ]

  return (
    <div className="flex flex-col">
      <Hotspot token="surface" focus={focus} label="Superfície (navbar)" className="shrink-0">
        <header className="flex items-center gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 backdrop-blur-sm">
          <Hotspot token="brand.primary" focus={focus} label="Cor primária">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: design.brand.primary }}
            >
              {tenantNome.slice(0, 1)}
            </div>
          </Hotspot>
          <Hotspot token="foreground" focus={focus} label="Texto principal" className="min-w-0">
            <span className="truncate text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground))]">
              {tenantNome}
            </span>
          </Hotspot>
          <nav className="ml-2 hidden items-center gap-0.5 sm:flex">
            {nav.map((item) => (
              <span
                key={item.label}
                className={[
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
                  item.active
                    ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                    : 'text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Hotspot token="border" focus={focus} label="Borda">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]">
                <Bell className="h-3.5 w-3.5" />
              </span>
            </Hotspot>
            <span className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]">
              <MessageCircle className="h-3.5 w-3.5" />
              <span
                className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white"
                style={{ backgroundColor: design.brand.primary }}
              >
                2
              </span>
            </span>
          </div>
        </header>
      </Hotspot>

      <Hotspot
        token="grid"
        focus={focus}
        label="Fundo e grade"
      >
        <div className="space-y-3 p-4" style={gridStyle(design, mode)}>
          <Hotspot token="backgroundSubtle" focus={focus} label="Fundo sutil (área sob a grade)">
            <div className="mb-1">
              <Hotspot token="foreground" focus={focus} label="Título">
                <h2 className="text-lg font-bold text-[rgb(var(--foreground))]">Comunidade</h2>
              </Hotspot>
              <Hotspot token="foregroundMuted" focus={focus} label="Texto secundário">
                <p className="text-sm text-[rgb(var(--foreground-muted))]">
                  Feed da torcida — posts, reações e avisos
                </p>
              </Hotspot>
            </div>
          </Hotspot>

          <Hotspot token="surface" focus={focus} label="Superfície (cartão)">
            <article className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: design.brand.primary }}
                >
                  V
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[rgb(var(--foreground))]">
                      Vinicius
                    </span>
                    <Hotspot token="brand.primary" focus={focus} label="Badge primária">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${design.brand.primary}24`,
                          color: primaryFg,
                        }}
                      >
                        Sócio
                      </span>
                    </Hotspot>
                    <Hotspot token="brand.secondary" focus={focus} label="Badge secundária">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${secondaryHex}24`,
                          color: secondaryFg,
                        }}
                      >
                        Destaque
                      </span>
                    </Hotspot>
                    <Hotspot token="actions.info" focus={focus} label="Informativo">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${actions.info}24`,
                          color: actionText('info').fg,
                        }}
                      >
                        Aviso
                      </span>
                    </Hotspot>
                    <span className="text-[10px] text-[rgb(var(--foreground-muted))]">agora</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-[rgb(var(--foreground))]">
                    Quem vai no ensaio de sexta? Bateria precisa de mais gente no fundo.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Hotspot token="brand.primary" focus={focus} label="Botão primário">
                      <button
                        type="button"
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{
                          backgroundColor: design.brand.primary,
                          color: primaryOnBtn,
                        }}
                      >
                        Comentar
                      </button>
                    </Hotspot>
                    <Hotspot token="brand.secondary" focus={focus} label="Botão secundário">
                      <button
                        type="button"
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{
                          backgroundColor: `${secondaryHex}22`,
                          color: secondaryFg,
                          border: `1px solid ${secondaryHex}55`,
                        }}
                      >
                        Curtir
                      </button>
                    </Hotspot>
                    <Hotspot token="surfaceRaised" focus={focus} label="Superfície elevada">
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                        style={{
                          backgroundColor: surfaces.surfaceRaised,
                          color: raisedOn,
                          borderColor: surfaces.border,
                        }}
                      >
                        Compartilhar
                      </button>
                    </Hotspot>
                  </div>
                </div>
              </div>
            </article>
          </Hotspot>

          <Hotspot token="surfaceRaised" focus={focus} label="Menu elevado (popover)">
            <div
              className="overflow-hidden rounded-2xl border shadow-lg"
              style={{
                backgroundColor: surfaces.surfaceRaised,
                borderColor: surfaces.border,
                color: raisedOn,
              }}
            >
              <div className="border-b px-4 py-2.5" style={{ borderColor: `${surfaces.border}` }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: raisedMuted }}>
                  Superfície elevada
                </p>
                <p className="mt-0.5 text-sm font-semibold">Menu / popover</p>
              </div>
              <ul className="p-1.5 text-xs">
                {['Copiar link do post', 'Compartilhar no WhatsApp', 'Silenciar autor'].map(
                  (item, i) => (
                    <li
                      key={item}
                      className="rounded-lg px-3 py-2 font-medium"
                      style={
                        i === 0
                          ? {
                              backgroundColor:
                                contrasteTextoSobre(surfaces.surfaceRaised) === 'light'
                                  ? 'rgba(255,255,255,0.12)'
                                  : 'rgba(0,0,0,0.06)',
                            }
                          : undefined
                      }
                    >
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>
          </Hotspot>

          <Hotspot token="surface" focus={focus} label="Cartão de evento / RSVP">
            <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              <Hotspot token="brand.secondary" focus={focus} label="Faixa secundária">
                <div
                  className="h-1 w-full"
                  style={{ backgroundColor: 'rgb(var(--color-secondary))' }}
                />
              </Hotspot>
              <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Próximo evento
              </p>
              <p className="mt-1 text-sm font-semibold text-[rgb(var(--foreground))]">
                Ensaio da bateria · Sexta 20h
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Hotspot token="actions.success" focus={focus} label="Aprovar / positivo">
                  <span
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: actions.success,
                      color: actionText('success').on,
                    }}
                  >
                    <Check className="h-3 w-3" />
                    Vou comparecer
                  </span>
                </Hotspot>
                <Hotspot token="actions.warning" focus={focus} label="Atenção / pendente">
                  <span
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: actions.warning,
                      color: actionText('warning').on,
                    }}
                  >
                    Lista de espera
                  </span>
                </Hotspot>
                <Hotspot token="actions.danger" focus={focus} label="Reprovar / cancelar">
                  <span
                    className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                    style={{
                      color: actionText('danger').fg,
                      borderColor: `${actions.danger}44`,
                      backgroundColor: `${actions.danger}1a`,
                    }}
                  >
                    <X className="h-3 w-3" />
                    Não vou
                  </span>
                </Hotspot>
              </div>
              <Hotspot token="actions.info" focus={focus} label="Informativo">
                <p
                  className="mt-3 rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: `${actions.info}1a`,
                    color: actionText('info').fg,
                    border: `1px solid ${actions.info}44`,
                  }}
                >
                  Informativo: caravana sai às 14h na sede.
                </p>
              </Hotspot>
              </div>
            </div>
          </Hotspot>
        </div>
      </Hotspot>
    </div>
  )
}

function AdminScene({
  design,
  mode,
  tenantNome,
  focus,
}: {
  design: TenantDesign
  mode: PreviewMode
  tenantNome: string
  focus: TokenFocus
}) {
  const actions = { ...DEFAULT_ACTIONS, ...design.actions }
  const surfaces = resolveSurfaces(design, mode)
  const raisedOn =
    contrasteTextoSobre(surfaces.surfaceRaised) === 'light' ? '#ffffff' : '#0a0a0a'
  const raisedMuted =
    contrasteTextoSobre(surfaces.surfaceRaised) === 'light'
      ? 'rgba(255,255,255,0.72)'
      : 'rgba(10,10,10,0.58)'
  const actionText = (key: keyof typeof DEFAULT_ACTIONS) =>
    resolveActionTextColors(
      actions[key],
      design.actionsFg?.[key] ?? DEFAULT_ACTIONS_FG[key],
      surfaces.surface,
    )

  return (
    <div className="flex flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
          style={{ backgroundColor: design.brand.primary }}
        >
          {tenantNome.slice(0, 1)}
        </div>
        <div>
          <p className="text-xs font-semibold text-[rgb(var(--foreground))]">{tenantNome}</p>
          <p className="text-[10px] text-[rgb(var(--foreground-muted))]">Administração</p>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-40 shrink-0 border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 sm:block">
          {['Dashboard', 'Membros', 'Agenda', 'Design'].map((label, i) => (
            <div
              key={label}
              className={[
                'rounded-lg px-2.5 py-1.5 text-xs font-medium',
                i === 1
                  ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                  : 'text-[rgb(var(--foreground-muted))]',
              ].join(' ')}
            >
              {label}
            </div>
          ))}
        </aside>
        <Hotspot token="grid" focus={focus} label="Fundo e grade" className="min-w-0 flex-1">
          <div className="space-y-3 p-4" style={gridStyle(design, mode)}>
            <Hotspot token="foreground" focus={focus} label="Título da página">
              <h2 className="text-lg font-bold text-[rgb(var(--foreground))]">Membros pendentes</h2>
            </Hotspot>
            <Hotspot token="foregroundMuted" focus={focus} label="Descrição">
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Aprove ou reprove solicitações de sócio
              </p>
            </Hotspot>

            <Hotspot token="surface" focus={focus} label="Superfície (linha)">
              <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                {[
                  { nome: 'Ana Silva', depto: 'Bateria' },
                  { nome: 'Carlos Mendes', depto: 'Comunicação' },
                ].map((row, idx) => (
                  <div
                    key={row.nome}
                    className={[
                      'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
                      idx > 0 ? 'border-t border-[rgb(var(--border))]' : '',
                    ].join(' ')}
                  >
                    <div>
                      <p className="text-sm font-medium text-[rgb(var(--foreground))]">{row.nome}</p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">{row.depto}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Hotspot token="actions.success" focus={focus} label="Botão aprovar">
                        <span
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: actions.success,
                            color: actionText('success').on,
                          }}
                        >
                          <Check className="h-3 w-3" />
                          Aprovar
                        </span>
                      </Hotspot>
                      <Hotspot token="actions.danger" focus={focus} label="Botão reprovar">
                        <span
                          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
                          style={{
                            color: actionText('danger').fg,
                            borderColor: `${actions.danger}44`,
                            backgroundColor: `${actions.danger}1a`,
                          }}
                        >
                          <X className="h-3 w-3" />
                          Reprovar
                        </span>
                      </Hotspot>
                      <Hotspot token="actions.warning" focus={focus} label="Badge pendente">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            color: actionText('warning').fg,
                            backgroundColor: `${actions.warning}24`,
                          }}
                        >
                          Pendente
                        </span>
                      </Hotspot>
                      <Hotspot token="actions.info" focus={focus} label="Badge informativo">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            color: actionText('info').fg,
                            backgroundColor: `${actions.info}24`,
                          }}
                        >
                          Informativo
                        </span>
                      </Hotspot>
                    </div>
                  </div>
                ))}
              </div>
            </Hotspot>

            <Hotspot token="surfaceRaised" focus={focus} label="Painel elevado">
              <div
                className="overflow-hidden rounded-xl border shadow-md"
                style={{
                  backgroundColor: surfaces.surfaceRaised,
                  borderColor: surfaces.border,
                  color: raisedOn,
                }}
              >
                <div className="px-4 py-2.5">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: raisedMuted }}
                  >
                    Superfície elevada
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">Ações rápidas</p>
                  <p className="mt-1 text-xs" style={{ color: raisedMuted }}>
                    Exportar lista · Filtrar por departamento
                  </p>
                </div>
              </div>
            </Hotspot>
          </div>
        </Hotspot>
      </div>
    </div>
  )
}

function EntrarScene({
  design,
  mode,
  tenantNome,
  focus,
}: {
  design: TenantDesign
  mode: PreviewMode
  tenantNome: string
  focus: TokenFocus
}) {
  return (
    <Hotspot token="grid" focus={focus} label="Fundo e grade">
      <div
        className="flex flex-col items-center justify-center p-8"
        style={gridStyle(design, mode)}
      >
        <Hotspot token="surface" focus={focus} label="Superfície (cartão de login)" className="w-full max-w-xs">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-lg">
            <div className="mb-5 text-center">
              <Hotspot token="brand.primary" focus={focus} label="Cor primária" className="inline-flex">
                <div
                  className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md"
                  style={{ backgroundColor: design.brand.primary }}
                >
                  {tenantNome.slice(0, 1)}
                </div>
              </Hotspot>
              <Hotspot token="foreground" focus={focus} label="Título">
                <p className="text-base font-bold text-[rgb(var(--foreground))]">{tenantNome}</p>
              </Hotspot>
              <Hotspot token="foregroundMuted" focus={focus} label="Texto secundário">
                <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                  Portal do associado
                </p>
              </Hotspot>
            </div>
            <Hotspot token="border" focus={focus} label="Borda / campos">
              <div className="space-y-2">
                <div className="h-9 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 text-xs leading-9 text-[rgb(var(--foreground-muted))]">
                  E-mail
                </div>
                <div className="h-9 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 text-xs leading-9 text-[rgb(var(--foreground-muted))]">
                  Senha
                </div>
              </div>
            </Hotspot>
            <Hotspot token="brand.primary" focus={focus} label="Botão entrar" className="mt-4">
              <button
                type="button"
                className="w-full rounded-lg py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: design.brand.primary }}
              >
                Entrar
              </button>
            </Hotspot>
            <Hotspot token="brand.secondary" focus={focus} label="Link secundário" className="mt-3">
              <p className="text-center text-xs">
                <span className="text-[rgb(var(--foreground-muted))]">Não tem conta? </span>
                <span className="font-semibold text-[rgb(var(--color-secondary))] underline-offset-2">
                  Criar conta
                </span>
              </p>
            </Hotspot>
          </div>
        </Hotspot>
      </div>
    </Hotspot>
  )
}

const SCENES: { id: PreviewScene; label: string; hint: string }[] = [
  { id: 'portal', label: 'Portal', hint: 'O que o associado vê' },
  { id: 'admin', label: 'Admin', hint: 'Aprovar membros e painéis' },
  { id: 'entrar', label: 'Login', hint: 'Tela de entrada' },
]

/**
 * Prévia de estúdio: cenas fiéis à app + hotspots ligados aos tokens do editor.
 */
export function DesignStudioPreview({
  design,
  baselineDesign,
  compareAtivo = false,
  mode,
  scene,
  tenantNome,
  focus,
  onSceneChange,
  onModeChange,
  onCompareChange,
}: DesignStudioPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const activeDesign =
    compareAtivo && baselineDesign ? baselineDesign : design
  const showingBefore = Boolean(compareAtivo && baselineDesign)

  useEffect(() => {
    if (!rootRef.current) return
    applyTenantDesign(activeDesign, mode, rootRef.current)
  }, [activeDesign, mode])

  useEffect(() => {
    if (!focus || !rootRef.current || showingBefore) return
    const el = rootRef.current.querySelector(`[data-token="${focus}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focus, scene, showingBefore])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Prévia da aplicação
            {showingBefore ? (
              <span className="ml-2 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                Antes (salvo)
              </span>
            ) : (
              <span className="ml-2 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                Depois (rascunho)
              </span>
            )}
          </p>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            {showingBefore
              ? 'Visualização do que está publicado hoje. Desative “Antes/depois” para editar.'
              : 'Ajuste as cores à esquerda — a prévia atualiza na hora. Só aplica na torcida ao salvar.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {baselineDesign && onCompareChange ? (
            <button
              type="button"
              onClick={() => onCompareChange(!compareAtivo)}
              className={[
                'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                compareAtivo
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-100'
                  : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              Antes / depois
            </button>
          ) : null}
          <div className="flex gap-0.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-0.5">
            {SCENES.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                onClick={() => onSceneChange(s.id)}
                className={[
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  scene === s.id
                    ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                    : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-0.5">
            {(['dark', 'light'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                className={[
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
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
      </div>

      <div
        ref={rootRef}
        className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] shadow-[0_20px_50px_-24px_rgba(0,0,0,0.55)] ring-1 ring-black/5 dark:ring-white/5"
      >
        {scene === 'portal' ? (
          <PortalScene
            design={activeDesign}
            mode={mode}
            tenantNome={tenantNome}
            focus={showingBefore ? null : focus}
          />
        ) : null}
        {scene === 'admin' ? (
          <AdminScene
            design={activeDesign}
            mode={mode}
            tenantNome={tenantNome}
            focus={showingBefore ? null : focus}
          />
        ) : null}
        {scene === 'entrar' ? (
          <EntrarScene
            design={activeDesign}
            mode={mode}
            tenantNome={tenantNome}
            focus={showingBefore ? null : focus}
          />
        ) : null}
      </div>
    </div>
  )
}
