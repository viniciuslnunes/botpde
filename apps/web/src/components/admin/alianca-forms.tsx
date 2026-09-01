'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import type { AliancaTabId } from '@/lib/alianca-tabs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Check,
  Handshake,
  History,
  Inbox,
  Loader2,
  Search,
  Send,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  aceitarAlianca,
  cancelarProposta,
  encerrarAlianca,
  proporAlianca,
  proporAliancaFromRecomendacao,
  rejeitarAlianca,
} from '@/app/admin/aliancas/actions'
import type { AliancaListItem, RecomendacaoAliancaListItem } from '@/lib/aliancas'

/** Props vindas do RSC — datas já em ISO string. */
type AliancaListItemProp = Omit<AliancaListItem, 'criadoEm' | 'confirmadaEm'> & {
  criadoEm: string
  confirmadaEm: string | null
}
type RecomendacaoAliancaListItemProp = Omit<RecomendacaoAliancaListItem, 'criadoEm'> & {
  criadoEm: string
}
import { linkTorcidaComunidadePublica } from '@/lib/canais-shared'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { LogoImage } from '@/components/media/logo-image'
import { toast } from '@torcida/ui'
import { useConfirmAction } from '@/lib/confirm-action'
import { lookupTabBadge } from '@/lib/notificacoes-menu-badges'
import { useAdminNavbarSnapshot } from '@/lib/use-admin-navbar-context'

interface TenantOption {
  id: string
  nome: string
  slug: string
  logoUrl: string | null
  afiliacaoId: string | null
  afiliacao: {
    nome: string
    apelido: string | null
    cidade: string | null
    estado: string | null
  } | null
}

interface AliancaFormsProps {
  tenantId: string
  afiliacaoId: string | null
  aliancas: AliancaListItemProp[]
  recomendacoes: RecomendacaoAliancaListItemProp[]
  tenants: TenantOption[]
  /** Subsede/PDE: só herda a visão das ATIVAs da sede — nunca gerencia. */
  readOnly?: boolean
  /** Tab vinda de `?tab=` (sino / deep-link). */
  initialTab?: AliancaTabId | null
}

// Definição movida para `@/lib/alianca-tabs` (módulo SEM `'use client'`):
// `page.tsx` é Server Component e chamava `parseAliancaTabId` daqui, o que
// devolve referência de client em vez da função e derrubava a rota inteira.
// Reexportado para não quebrar quem já importava deste módulo.
export { parseAliancaTabId, ALIANCA_TAB_IDS } from '@/lib/alianca-tabs'
export type { AliancaTabId } from '@/lib/alianca-tabs'

type TabId = AliancaTabId

type ThumbSize = 'sm' | 'md'

const THUMB_SIZES = {
  sm: { box: 'h-10 w-10', px: 40, text: 'text-sm' },
  md: { box: 'h-16 w-16', px: 64, text: 'text-lg' },
} as const

function TorcidaThumb({
  nome,
  logoUrl,
  size = 'md',
}: {
  nome: string
  logoUrl: string | null
  size?: ThumbSize
}) {
  const s = THUMB_SIZES[size]
  const imgClass = `${s.box} shrink-0 object-contain`

  if (logoUrl) {
    return <LogoImage src={logoUrl} alt="" size={s.px} className={imgClass} />
  }

  return (
    <div
      className={`flex ${s.box} shrink-0 items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] ${s.text} font-bold text-[rgb(var(--foreground-muted))]`}
      aria-hidden="true"
    >
      {(nome.charAt(0) || '?').toUpperCase()}
    </div>
  )
}

function TorcidaIdentityLink({
  tenantId,
  nome,
  children,
}: {
  tenantId: string | null
  nome: string
  children: ReactNode
}) {
  if (!tenantId) {
    return <div className="flex min-w-0 items-center gap-4">{children}</div>
  }

  return (
    <Link
      href={linkTorcidaComunidadePublica(tenantId)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 items-center gap-4 rounded-xl outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
      title={`Ver publicações públicas de ${nome}`}
    >
      {children}
    </Link>
  )
}

function statusLabel(status: AliancaListItem['status']): string {
  if (status === 'ATIVA') return 'Ativa'
  if (status === 'PENDENTE') return 'Pendente'
  if (status === 'ENCERRADA') return 'Encerrada'
  return 'Sugerida'
}

function statusClass(status: AliancaListItem['status']): string {
  if (status === 'ATIVA') return 'bg-[rgb(var(--color-success)_/_0.14)] text-[rgb(var(--color-success-fg))]'
  if (status === 'PENDENTE') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  if (status === 'ENCERRADA') return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  return 'bg-[rgb(var(--color-info)_/_0.14)] text-[rgb(var(--color-info-fg))]'
}

function CoIrmaBadge() {
  return (
    <span className="rounded-full bg-[rgb(var(--foreground)_/_0.08)] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--foreground-muted))]">
      Co-irmã
    </span>
  )
}

function afiliacaoLabel(tenant: TenantOption): string | null {
  const af = tenant.afiliacao
  if (!af) return null
  const clube = (af.apelido?.trim() || af.nome).toLocaleUpperCase('pt-BR')
  const local = [af.cidade, af.estado].filter(Boolean).join('/')
  return local ? `${clube} · ${local}` : clube
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
      {children}
    </p>
  )
}

export function AliancaForms({
  tenantId,
  afiliacaoId,
  aliancas,
  recomendacoes,
  tenants,
  readOnly = false,
  initialTab = null,
}: AliancaFormsProps) {
  const router = useRouter()
  const { tabBadges } = useAdminNavbarSnapshot()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const confirmAction = useConfirmAction()

  const blockedTenantIds = useMemo(() => {
    const ids = new Set<string>()
    for (const alianca of aliancas) {
      if (alianca.status === 'ENCERRADA') continue
      const otherTenantId = alianca.tenantOrigemId === tenantId ? alianca.tenantAliadoId : alianca.tenantOrigemId
      ids.add(otherTenantId)
    }
    return ids
  }, [aliancas, tenantId])

  const searchNeedle = search.trim().toLowerCase()
  const tenantSuggestions = useMemo(() => {
    if (!searchNeedle) return []
    const filtered = tenants.filter((item: TenantOption) => {
      if (blockedTenantIds.has(item.id)) return false
      if (afiliacaoId && item.afiliacaoId === afiliacaoId) return false
      const af = item.afiliacao
      const haystack = [item.slug, item.nome, af?.nome, af?.apelido, af?.cidade, af?.estado]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(searchNeedle)
    })
    return filtered.slice(0, 7)
  }, [afiliacaoId, blockedTenantIds, searchNeedle, tenants])

  const pendentesRecebidas = aliancas.filter(
    (item: AliancaListItemProp) => item.status === 'PENDENTE' && item.tenantAliadoId === tenantId,
  )
  const pendentesEnviadas = aliancas.filter(
    (item: AliancaListItemProp) => item.status === 'PENDENTE' && item.tenantOrigemId === tenantId,
  )
  const ativas = aliancas.filter((item: AliancaListItemProp) => item.status === 'ATIVA')
  const encerradas = aliancas.filter((item: AliancaListItemProp) => item.status === 'ENCERRADA')
  const recomendacoesAlta = recomendacoes.filter(
    (r: RecomendacaoAliancaListItemProp) => r.confianca === 'ALTA' && r.tipo === 'ALIADA',
  )
  // Co-irmã é informativa (mesmo clube) e nunca vira Alianca — segue visível
  // em modo leitura; só a proposta formal (ALIADA) é exclusiva da sede.
  const recomendacoesVisiveis = readOnly
    ? recomendacoes.filter((r: RecomendacaoAliancaListItemProp) => r.tipo === 'CO_IRMA')
    : recomendacoes

  const defaultTab: TabId = (() => {
    if (readOnly) return 'ativas'
    if (pendentesRecebidas.length > 0) return 'recebidas'
    if (recomendacoes.length > 0) return 'recomendacoes'
    if (ativas.length > 0) return 'ativas'
    if (pendentesEnviadas.length > 0) return 'enviadas'
    return 'propor'
  })()

  const [tab, setTab] = useState<TabId>(initialTab ?? defaultTab)

  function irParaTab(next: TabId): void {
    setTab(next)
    router.replace(`/admin/aliancas?tab=${next}`, { scroll: false })
  }

  const tabs: Array<{ id: TabId; label: string; count: number; icon: LucideIcon; highlight?: boolean }> = readOnly
    ? [
        {
          id: 'recomendacoes',
          label: 'Co-irmãs',
          count: recomendacoesVisiveis.length,
          icon: Sparkles,
        },
        { id: 'ativas', label: 'Ativas', count: ativas.length, icon: Users },
      ]
    : [
        {
          id: 'recomendacoes',
          label: 'Recomendações',
          count: recomendacoes.length,
          icon: Sparkles,
          highlight: recomendacoesAlta.length > 0 && ativas.length === 0,
        },
        {
          id: 'recebidas',
          label: 'Recebidas',
          count: pendentesRecebidas.length,
          icon: Inbox,
          highlight: pendentesRecebidas.length > 0,
        },
        { id: 'enviadas', label: 'Enviadas', count: pendentesEnviadas.length, icon: Send },
        { id: 'ativas', label: 'Ativas', count: ativas.length, icon: Users },
        { id: 'propor', label: 'Propor', count: 0, icon: Handshake },
      ]
  if (!readOnly && encerradas.length > 0) {
    tabs.push({ id: 'historico', label: 'Histórico', count: encerradas.length, icon: History })
  }

  function mostrarErro(error: unknown, fallback: string): void {
    setSucesso(null)
    setErro(error instanceof Error ? error.message : fallback)
  }

  function runAction(action: () => Promise<void>, successMessage: string): void {
    setErro(null)
    startTransition(async () => {
      try {
        await action()
        setSucesso(successMessage)
        toast.success(successMessage)
      } catch (error) {
        mostrarErro(error, 'Não foi possível concluir a ação')
        toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a ação')
      }
    })
  }

  function confirmAndRun(
    message: string,
    description: string,
    confirmLabel: string,
    action: () => Promise<void>,
    successMessage: string,
    variante: 'default' | 'destructive' | 'success' = 'default',
  ): void {
    void confirmAction({
      titulo: message,
      descricao: description,
      labelConfirmar: confirmLabel,
      labelCancelar: 'Voltar',
      variante,
      cancelled: 'Ação cancelada.',
      run: async () => {
        setErro(null)
        await action()
        setSucesso(successMessage)
      },
      success: successMessage,
    })
  }

  function selectTenant(item: TenantOption): void {
    setSelectedTenantId(item.id)
    setSearch(`${item.slug} — ${item.nome}`)
  }

  function proporManualFromRec(item: RecomendacaoAliancaListItemProp): void {
    if (!item.tenantSugeridoId) return
    const aviso =
      item.confianca === 'BAIXA'
        ? 'Esta recomendação tem baixa confiança na base de conhecimento. Confirme com a liderança antes de enviar.'
        : 'Esta recomendação não tem alta confiança. Você pode propor mesmo assim.'
    confirmAndRun(
      `Propor aliança a ${item.tenantSugeridoNome}?`,
      aviso,
      'Propor mesmo assim',
      () => proporAlianca(item.tenantSugeridoId as string),
      `Proposta enviada para ${item.tenantSugeridoNome}`,
    )
  }

  function renderAliancaRow(
    item: AliancaListItemProp,
    options?: { showAcceptReject?: boolean; showCancel?: boolean },
  ) {
    const counterpart = item.tenantOrigemId === tenantId ? item.tenantAliado : item.tenantOrigem
    const proponente = item.propostaPor.nome ?? item.propostaPor.email ?? 'alguém'

    return (
      <div
        key={item.id}
        className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-5 py-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TorcidaIdentityLink tenantId={counterpart.id} nome={counterpart.nome}>
            <TorcidaThumb nome={counterpart.nome} logoUrl={counterpart.logoUrl} />
            <div className="min-w-0">
              <p className="text-base font-semibold text-[rgb(var(--foreground))]">{counterpart.nome}</p>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">@{counterpart.slug}</p>
              <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
                {item.status === 'ATIVA' && item.confirmadaEm
                  ? `Ativa desde ${formatDateTimeShort(item.confirmadaEm)}`
                  : `Proposta por ${proponente} · ${formatDateTimeShort(item.criadoEm)}`}
              </p>
            </div>
          </TorcidaIdentityLink>
          <span className={['rounded-full px-2.5 py-1 text-xs font-semibold', statusClass(item.status)].join(' ')}>
            {statusLabel(item.status)}
          </span>
        </div>

        {options?.showAcceptReject && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                confirmAndRun(
                  `Aceitar aliança com ${counterpart.nome}?`,
                  'A relação allied passa a valer para visibilidade entre as torcidas.',
                  'Aceitar',
                  () => aceitarAlianca(item.id),
                  'Aliança aceita com sucesso',
                  'success',
                )
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 btn-success rounded-lg px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Aceitar
            </button>
            <button
              type="button"
              onClick={() =>
                confirmAndRun(
                  `Rejeitar proposta de ${counterpart.nome}?`,
                  'A proposta será encerrada. Vocês poderão propor de novo depois.',
                  'Rejeitar',
                  () => rejeitarAlianca(item.id),
                  'Proposta rejeitada',
                  'destructive',
                )
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              <XCircle className="h-3.5 w-3.5" />
              Rejeitar
            </button>
          </div>
        )}

        {options?.showCancel && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                confirmAndRun(
                  `Cancelar proposta para ${counterpart.nome}?`,
                  'A outra torcida deixará de ver esta proposta pendente.',
                  'Cancelar proposta',
                  () => cancelarProposta(item.id),
                  'Proposta cancelada',
                  'destructive',
                )
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3.5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] disabled:opacity-60"
            >
              Cancelar proposta
            </button>
          </div>
        )}

        {!readOnly && item.status === 'ATIVA' && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                confirmAndRun(
                  `Encerrar aliança com ${counterpart.nome}?`,
                  'A relação allied deixa de valer para visibilidade entre as torcidas.',
                  'Encerrar',
                  () => encerrarAlianca(item.id),
                  'Aliança encerrada',
                  'destructive',
                )
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3.5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] disabled:opacity-60"
            >
              Encerrar aliança
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {(erro || sucesso) && (
        <div
          className={[
            'rounded-xl border px-4 py-3 text-sm',
            erro
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
              : 'border-[rgb(var(--color-success)_/_0.32)] bg-[rgb(var(--color-success)_/_0.12)] text-[rgb(var(--color-success-fg))]',
          ].join(' ')}
        >
          {erro ?? sucesso}
        </div>
      )}

      <nav aria-label="Seções de alianças">
        <div
          role="tablist"
          className="app-scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        >
          {tabs.map((item) => {
            const active = tab === item.id
            const Icon = item.icon
            const live = lookupTabBadge(tabBadges, `/admin/aliancas?tab=${item.id}`)
            const count = Math.max(item.count, live)
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => irParaTab(item.id)}
                className={[
                  'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                    : item.highlight || live > 0
                      ? 'font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]'
                      : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {item.id !== 'propor' ? (
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                      live > 0
                        ? 'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]'
                        : active
                          ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                          : item.highlight
                            ? 'bg-[rgb(var(--color-primary)_/_0.18)] text-[rgb(var(--color-primary-fg))]'
                            : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>

      <div role="tabpanel" className="min-h-[12rem]">
        {tab === 'recomendacoes' && (
          <div className="space-y-3">
            {readOnly && (
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Outras organizadas do mesmo clube. Relação informativa — não é uma aliança formal.
              </p>
            )}
            {recomendacoesVisiveis.length === 0 ? (
              <EmptyState>
                {readOnly
                  ? 'Nenhuma co-irmã encontrada.'
                  : 'Ainda não há recomendações. Use a aba Propor para buscar manualmente.'}
              </EmptyState>
            ) : (
              <div className="space-y-3">
                {recomendacoesVisiveis.map((item: RecomendacaoAliancaListItemProp) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-5 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <TorcidaIdentityLink
                        tenantId={item.tenantSugeridoId}
                        nome={item.tenantSugeridoNome}
                      >
                        <TorcidaThumb
                          nome={item.tenantSugeridoNome}
                          logoUrl={item.tenantSugeridoLogoUrl}
                        />
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-[rgb(var(--foreground))]">
                            {item.tenantSugeridoNome}
                            {item.tenantSugeridoSlug ? (
                              <span className="ml-2 text-sm font-normal text-[rgb(var(--foreground-muted))]">
                                @{item.tenantSugeridoSlug}
                              </span>
                            ) : null}
                          </p>
                          {item.fonte ? (
                            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{item.fonte}</p>
                          ) : null}
                        </div>
                      </TorcidaIdentityLink>
                      {item.tipo === 'CO_IRMA' ? <CoIrmaBadge /> : null}
                    </div>
                    {item.observacao && item.tipo !== 'CO_IRMA' ? (
                      <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">{item.observacao}</p>
                    ) : null}
                    {item.tipo === 'CO_IRMA' ? null : item.podePropor ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          disabled={
                            pending ||
                            (item.tenantSugeridoId != null && blockedTenantIds.has(item.tenantSugeridoId))
                          }
                          onClick={() =>
                            runAction(
                              () => proporAliancaFromRecomendacao(item.id),
                              `Proposta enviada para ${item.tenantSugeridoNome}`,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-3.5 py-2 text-sm font-medium text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          {pending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Handshake className="h-3.5 w-3.5" />
                          )}
                          Propor aliança
                        </button>
                      </div>
                    ) : item.confianca === 'ALTA' && !item.tenantSugeridoId ? (
                      <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
                        Esta torcida ainda não está na plataforma — a recomendação fica só
                        informativa.
                      </p>
                    ) : item.tenantSugeridoId && !blockedTenantIds.has(item.tenantSugeridoId) ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => proporManualFromRec(item)}
                          className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline disabled:opacity-60"
                        >
                          Propor mesmo assim
                        </button>
                      </div>
                    ) : item.confianca !== 'ALTA' ? (
                      <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
                        Confiança insuficiente e torcida ainda fora da plataforma.
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'recebidas' && (
          <div className="space-y-3">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Propostas enviadas por outras torcidas aguardando sua aprovação.
            </p>
            {pendentesRecebidas.length === 0 ? (
              <EmptyState>Nenhuma proposta pendente para aprovação.</EmptyState>
            ) : (
              <div className="space-y-3">
                {pendentesRecebidas.map((item: AliancaListItemProp) =>
                  renderAliancaRow(item, { showAcceptReject: true }),
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'enviadas' && (
          <div className="space-y-3">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Propostas que você enviou e ainda aguardam resposta.
            </p>
            {pendentesEnviadas.length === 0 ? (
              <EmptyState>Nenhuma proposta enviada aguardando resposta.</EmptyState>
            ) : (
              <div className="space-y-3">
                {pendentesEnviadas.map((item: AliancaListItemProp) =>
                  renderAliancaRow(item, { showCancel: true }),
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'ativas' && (
          <div className="space-y-3">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              {readOnly
                ? 'Parcerias confirmadas pela sede. Somente administradores da sede podem propor ou encerrar alianças.'
                : 'Parcerias confirmadas. PDEs e subsedes herdam este vínculo.'}
            </p>
            {ativas.length === 0 ? (
              <EmptyState>
                {readOnly
                  ? 'A sede ainda não possui alianças ativas.'
                  : (
                    <>
                      Você ainda não possui alianças ativas.
                      {recomendacoesAlta.length > 0
                        ? ' Comece pelas recomendações de alta confiança.'
                        : ''}
                    </>
                  )}
              </EmptyState>
            ) : (
              <div className="space-y-3">
                {ativas.map((item: AliancaListItemProp) => renderAliancaRow(item))}
              </div>
            )}
          </div>
        )}

        {tab === 'historico' && (
          <div className="space-y-3">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Alianças encerradas, rejeitadas ou canceladas.
            </p>
            {encerradas.length === 0 ? (
              <EmptyState>Nenhum histórico ainda.</EmptyState>
            ) : (
              <div className="space-y-3">
                {encerradas.map((item: AliancaListItemProp) => renderAliancaRow(item))}
              </div>
            )}
          </div>
        )}

        {tab === 'propor' && (
          <div className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
                <Handshake className="h-4 w-4" />
                Propor manualmente
              </h2>
              <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                Busque por nome, slug, clube ou cidade. Co-irmãs (mesmo time) não entram na busca.
              </p>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setSelectedTenantId(null)
                  }}
                  placeholder="Ex: Remo, Belém, remocada…"
                  className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
                />
              </div>

              {searchNeedle && tenantSuggestions.length === 0 && (
                <p className="text-xs text-[rgb(var(--foreground-muted))]">Nenhuma torcida encontrada.</p>
              )}

              {tenantSuggestions.length > 0 && (
                <div className="max-h-56 space-y-1 overflow-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-1">
                  {tenantSuggestions.map((item: TenantOption) => {
                    const afLabel = afiliacaoLabel(item)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectTenant(item)}
                        className={[
                          'flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[rgb(var(--background-subtle))]',
                          selectedTenantId === item.id ? 'bg-[rgb(var(--background-subtle))]' : '',
                        ].join(' ')}
                      >
                        <TorcidaThumb nome={item.nome} logoUrl={item.logoUrl} size="sm" />
                        <span className="min-w-0">
                          <span className="font-medium text-[rgb(var(--foreground))]">{item.nome}</span>
                          <span className="ml-2 text-[rgb(var(--foreground-muted))]">@{item.slug}</span>
                          {afLabel ? (
                            <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                              {afLabel}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              <button
                type="button"
                disabled={pending || !selectedTenantId}
                onClick={() => {
                  if (!selectedTenantId) return
                  runAction(async () => {
                    await proporAlianca(selectedTenantId)
                    setSelectedTenantId(null)
                    setSearch('')
                    irParaTab('enviadas')
                  }, 'Proposta enviada com sucesso')
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-medium text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
                Enviar proposta
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
