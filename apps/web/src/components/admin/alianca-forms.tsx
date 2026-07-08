'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, Handshake, Loader2, Search, XCircle } from 'lucide-react'
import {
  aceitarAlianca,
  encerrarAlianca,
  proporAlianca,
  rejeitarAlianca,
} from '@/app/admin/aliancas/actions'
import type { AliancaListItem, RecomendacaoAliancaListItem } from '@/lib/aliancas'

interface TenantOption {
  id: string
  nome: string
  slug: string
}

interface AliancaFormsProps {
  tenantId: string
  aliancas: AliancaListItem[]
  recomendacoes: RecomendacaoAliancaListItem[]
  tenants: TenantOption[]
}

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

export function AliancaForms({ tenantId, aliancas, recomendacoes, tenants }: AliancaFormsProps) {
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
    const filtered = tenants.filter((item: TenantOption) => {
      if (blockedTenantIds.has(item.id)) return false
      if (!searchNeedle) return true
      return item.slug.toLowerCase().includes(searchNeedle) || item.nome.toLowerCase().includes(searchNeedle)
    })
    return filtered.slice(0, 7)
  }, [blockedTenantIds, searchNeedle, tenants])

  const pendentesRecebidas = aliancas.filter(
    (item: AliancaListItem) => item.status === 'PENDENTE' && item.tenantAliadoId === tenantId,
  )
  const pendentesEnviadas = aliancas.filter(
    (item: AliancaListItem) => item.status === 'PENDENTE' && item.tenantOrigemId === tenantId,
  )

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
      } catch (error) {
        mostrarErro(error, 'Não foi possível concluir a ação')
      }
    })
  }

  function selectTenant(item: TenantOption): void {
    setSelectedTenantId(item.id)
    setSearch(`${item.slug} — ${item.nome}`)
  }

  function renderAliancaRow(item: AliancaListItem) {
    const counterpart = item.tenantOrigemId === tenantId ? item.tenantAliado : item.tenantOrigem
    const pendingForCurrent = item.status === 'PENDENTE' && item.tenantAliadoId === tenantId

    return (
      <div
        key={item.id}
        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-[rgb(var(--foreground))]">{counterpart.nome}</p>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">@{counterpart.slug}</p>
          </div>
          <span className={['rounded-full px-2 py-1 text-xs font-semibold', statusClass(item.status)].join(' ')}>
            {statusLabel(item.status)}
          </span>
        </div>

        {pendingForCurrent && (
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
              onClick={() => runAction(() => rejeitarAlianca(item.id), 'Proposta rejeitada')}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              <XCircle className="h-3.5 w-3.5" />
              Rejeitar
            </button>
          </div>
        )}

        {item.status === 'ATIVA' && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => runAction(() => encerrarAlianca(item.id), 'Aliança encerrada')}
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
    <div className="space-y-6">
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

      <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-[rgb(var(--foreground))]">
            <Handshake className="h-4 w-4" />
            Propor nova aliança
          </h2>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Busque por slug ou nome da torcida para enviar uma proposta.
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
              placeholder="Ex: gavioes-rj"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            />
          </div>

          {tenantSuggestions.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-1">
              {tenantSuggestions.map((item: TenantOption) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTenant(item)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  <span className="font-medium text-[rgb(var(--foreground))]">@{item.slug}</span>
                  <span className="ml-2 text-[rgb(var(--foreground-muted))]">{item.nome}</span>
                </button>
              ))}
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
              }, 'Proposta enviada com sucesso')
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
            Enviar proposta
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Pendentes recebidas ({pendentesRecebidas.length})
        </h2>
        {pendentesRecebidas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-5 text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma proposta pendente para aprovação.
          </p>
        ) : (
          <div className="space-y-2">{pendentesRecebidas.map(renderAliancaRow)}</div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Suas alianças
        </h2>
        {aliancas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-5 text-sm text-[rgb(var(--foreground-muted))]">
            Você ainda não possui alianças registradas.
          </p>
        ) : (
          <div className="space-y-2">{aliancas.map(renderAliancaRow)}</div>
        )}
        {pendentesEnviadas.length > 0 && (
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            {pendentesEnviadas.length} proposta{pendentesEnviadas.length === 1 ? '' : 's'} enviada
            {pendentesEnviadas.length === 1 ? '' : 's'} aguardando resposta.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Recomendações ({recomendacoes.length})
        </h2>
        {recomendacoes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-5 text-sm text-[rgb(var(--foreground-muted))]">
            Sem recomendações disponíveis no momento.
          </p>
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
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">{item.fonte}</p>
                  </div>
                  <span className={['rounded-full px-2 py-1 text-xs font-semibold', confiancaClass(item.confianca)].join(' ')}>
                    {item.confianca}
                  </span>
                </div>
                {item.observacao && (
                  <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">{item.observacao}</p>
                )}
                {item.tenantSugeridoId && !blockedTenantIds.has(item.tenantSugeridoId) && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const suggested = tenants.find((tenant: TenantOption) => tenant.id === item.tenantSugeridoId)
                        if (suggested) selectTenant(suggested)
                      }}
                      className="text-xs font-medium text-[rgb(var(--primary))] hover:underline"
                    >
                      Usar esta recomendação na proposta
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
