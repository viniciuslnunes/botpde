'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
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
import { formatDateTimeShort } from '@/lib/format-datetime'
import { toast } from '@torcida/ui'

interface TenantOption {
  id: string
  nome: string
  slug: string
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
  aliancas: AliancaListItem[]
  recomendacoes: RecomendacaoAliancaListItem[]
  tenants: TenantOption[]
}

type TabId = 'recomendacoes' | 'recebidas' | 'enviadas' | 'ativas' | 'propor' | 'historico'

function statusLabel(status: AliancaListItem['status']): string {
  if (status === 'ATIVA') return 'Ativa'
  if (status === 'PENDENTE') return 'Pendente'
  if (status === 'ENCERRADA') return 'Encerrada'
  return 'Sugerida'
}

function statusClass(status: AliancaListItem['status']): string {
  if (status === 'ATIVA') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  if (status === 'PENDENTE') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  if (status === 'ENCERRADA') return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
}

function confiancaClass(confianca: RecomendacaoAliancaListItem['confianca']): string {
  if (confianca === 'ALTA') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  if (confianca === 'MEDIA') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
}

function confiancaLabel(confianca: RecomendacaoAliancaListItem['confianca']): string {
  if (confianca === 'ALTA') return 'Alta confiança'
  if (confianca === 'MEDIA') return 'Média confiança'
  return 'Baixa confiança'
}

function tipoBadge(item: RecomendacaoAliancaListItem): { label: string; className: string } {
  if (item.tipo === 'CO_IRMA') {
    return {
      label: 'Co-irmã',
      className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    }
  }
  return { label: confiancaLabel(item.confianca), className: confiancaClass(item.confianca) }
}

function afiliacaoLabel(tenant: TenantOption): string | null {
  const af = tenant.afiliacao
  if (!af) return null
  const clube = af.apelido?.trim() || af.nome
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
}: AliancaFormsProps) {
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)

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
    (item: AliancaListItem) => item.status === 'PENDENTE' && item.tenantAliadoId === tenantId,
  )
  const pendentesEnviadas = aliancas.filter(
    (item: AliancaListItem) => item.status === 'PENDENTE' && item.tenantOrigemId === tenantId,
  )
  const ativas = aliancas.filter((item: AliancaListItem) => item.status === 'ATIVA')
  const encerradas = aliancas.filter((item: AliancaListItem) => item.status === 'ENCERRADA')
  const recomendacoesAlta = recomendacoes.filter(
    (r: RecomendacaoAliancaListItem) => r.confianca === 'ALTA' && r.tipo === 'ALIADA',
  )

  const defaultTab: TabId = (() => {
    if (pendentesRecebidas.length > 0) return 'recebidas'
    if (recomendacoes.length > 0) return 'recomendacoes'
    if (ativas.length > 0) return 'ativas'
    if (pendentesEnviadas.length > 0) return 'enviadas'
    return 'propor'
  })()

  const [tab, setTab] = useState<TabId>(defaultTab)

  const tabs: Array<{ id: TabId; label: string; count: number; icon: LucideIcon; highlight?: boolean }> = [
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
  if (encerradas.length > 0) {
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
  ): void {
    toast.confirm(message, {
      description,
      confirmLabel,
      cancelLabel: 'Voltar',
      onConfirm: () => runAction(action, successMessage),
    })
  }

  function selectTenant(item: TenantOption): void {
    setSelectedTenantId(item.id)
    setSearch(`${item.slug} — ${item.nome}`)
  }

  function proporManualFromRec(item: RecomendacaoAliancaListItem): void {
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
    item: AliancaListItem,
    options?: { showAcceptReject?: boolean; showCancel?: boolean },
  ) {
    const counterpart = item.tenantOrigemId === tenantId ? item.tenantAliado : item.tenantOrigem
    const proponente = item.propostaPor.nome ?? item.propostaPor.email ?? 'alguém'

    return (
      <div
        key={item.id}
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-[rgb(var(--foreground))]">{counterpart.nome}</p>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">@{counterpart.slug}</p>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              {item.status === 'ATIVA' && item.confirmadaEm
                ? `Ativa desde ${formatDateTimeShort(item.confirmadaEm)}`
                : `Proposta por ${proponente} · ${formatDateTimeShort(item.criadoEm)}`}
            </p>
          </div>
          <span className={['rounded-full px-2 py-1 text-xs font-semibold', statusClass(item.status)].join(' ')}>
            {statusLabel(item.status)}
          </span>
        </div>

        {options?.showAcceptReject && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runAction(() => aceitarAlianca(item.id), 'Aliança aceita com sucesso')}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
                )
              }
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
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
                )
              }
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] disabled:opacity-60"
            >
              Cancelar proposta
            </button>
          </div>
        )}

        {item.status === 'ATIVA' && (
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
                )
              }
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] disabled:opacity-60"
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
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
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
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={[
                  'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                    : item.highlight
                      ? 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]'
                      : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {item.id !== 'propor' ? (
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                      active
                        ? 'bg-[rgb(var(--primary))] text-white'
                        : item.highlight
                          ? 'bg-[rgb(var(--primary)_/_0.15)] text-[rgb(var(--primary))]'
                          : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                  >
                    {item.count}
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
            {recomendacoes.length === 0 ? (
              <EmptyState>
                Ainda não há recomendações. Use a aba Propor para buscar manualmente.
              </EmptyState>
            ) : (
              <div className="space-y-2">
                {recomendacoes.map((item: RecomendacaoAliancaListItem) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-[rgb(var(--foreground))]">
                          {item.tenantSugeridoNome}
                          {item.tenantSugeridoSlug ? (
                            <span className="ml-2 text-xs font-normal text-[rgb(var(--foreground-muted))]">
                              @{item.tenantSugeridoSlug}
                            </span>
                          ) : null}
                        </p>
                        {item.fonte ? (
                          <p className="text-xs text-[rgb(var(--foreground-muted))]">{item.fonte}</p>
                        ) : null}
                      </div>
                      <span
                        className={[
                          'rounded-full px-2 py-1 text-xs font-semibold',
                          tipoBadge(item).className,
                        ].join(' ')}
                      >
                        {tipoBadge(item).label}
                      </span>
                    </div>
                    {item.observacao && item.tipo !== 'CO_IRMA' ? (
                      <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">{item.observacao}</p>
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
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
                      <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
                        Esta torcida ainda não está na plataforma — a recomendação fica só
                        informativa.
                      </p>
                    ) : item.tenantSugeridoId && !blockedTenantIds.has(item.tenantSugeridoId) ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => proporManualFromRec(item)}
                          className="text-xs font-medium text-[rgb(var(--primary))] hover:underline disabled:opacity-60"
                        >
                          Propor mesmo assim
                        </button>
                      </div>
                    ) : item.confianca !== 'ALTA' ? (
                      <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
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
              <div className="space-y-2">
                {pendentesRecebidas.map((item: AliancaListItem) =>
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
              <div className="space-y-2">
                {pendentesEnviadas.map((item: AliancaListItem) =>
                  renderAliancaRow(item, { showCancel: true }),
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'ativas' && (
          <div className="space-y-3">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Parcerias confirmadas. PDEs e subsedes herdam este vínculo.
            </p>
            {ativas.length === 0 ? (
              <EmptyState>
                Você ainda não possui alianças ativas.
                {recomendacoesAlta.length > 0
                  ? ' Comece pelas recomendações de alta confiança.'
                  : ''}
              </EmptyState>
            ) : (
              <div className="space-y-2">
                {ativas.map((item: AliancaListItem) => renderAliancaRow(item))}
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
              <div className="space-y-2">
                {encerradas.map((item: AliancaListItem) => renderAliancaRow(item))}
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
                          'w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[rgb(var(--background-subtle))]',
                          selectedTenantId === item.id ? 'bg-[rgb(var(--background-subtle))]' : '',
                        ].join(' ')}
                      >
                        <span className="font-medium text-[rgb(var(--foreground))]">{item.nome}</span>
                        <span className="ml-2 text-[rgb(var(--foreground-muted))]">@{item.slug}</span>
                        {afLabel ? (
                          <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                            {afLabel}
                          </span>
                        ) : null}
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
                    setTab('enviadas')
                  }, 'Proposta enviada com sucesso')
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
