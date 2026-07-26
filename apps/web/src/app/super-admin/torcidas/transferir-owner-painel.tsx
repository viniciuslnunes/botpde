'use client'

import { useMemo, useState } from 'react'
import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Search, UserCheck, UserX } from 'lucide-react'
import { transferirOwnerAction, type TransferirOwnerState } from './actions'
import { labelClubeComUf, type TorcidaTransferencia } from '@/lib/torcida-labels'
import { normalizarTexto } from '@/lib/onboarding-unidade'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
      {pending ? 'Transferindo…' : 'Transferir propriedade'}
    </button>
  )
}

export function TransferirOwnerPainel({ torcidas }: { torcidas: TorcidaTransferencia[] }) {
  const [busca, setBusca] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [state, action] = useActionState<TransferirOwnerState, FormData>(transferirOwnerAction, {})

  const semOwner = useMemo(() => torcidas.filter((t) => !t.temOwner).length, [torcidas])

  const filtradas = useMemo(() => {
    const alvo = normalizarTexto(busca)
    if (!alvo) return torcidas
    return torcidas.filter((t) => {
      const haystack = normalizarTexto(
        [t.nome, t.clubeNome ?? '', t.clubeUf ?? '', t.slug].join(' '),
      )
      return haystack.includes(alvo)
    })
  }, [busca, torcidas])

  const selecionada = torcidas.find((t) => t.id === tenantId) ?? null
  const selecionadaClube = selecionada ? labelClubeComUf(selecionada) : null

  useEffect(() => {
    if (state.success) {
      window.location.reload()
    }
  }, [state.success])

  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        {semOwner} torcida(s) sem presidente — selecione abaixo e informe o e-mail (a pessoa precisa
        ter conta na plataforma).
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por torcida, clube, UF ou slug…"
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
          aria-label="Buscar torcida"
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
        {filtradas.length === 0 ? (
          <p className="p-4 text-center text-xs text-[rgb(var(--foreground-muted))]">
            Nenhuma torcida encontrada.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border))]">
            {filtradas.map((t) => {
              const ativa = t.id === tenantId
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTenantId(t.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[rgb(var(--surface-raised))] ${
                      ativa ? 'bg-[rgb(var(--color-primary)_/_0.14)]' : ''
                    }`}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: t.corPrimaria }}
                    >
                      {t.nome.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[rgb(var(--foreground))]">
                        {t.nome}
                      </span>
                      <span className="block truncate text-[11px] text-[rgb(var(--foreground-muted))]">
                        {labelClubeComUf(t) ?? t.slug}
                      </span>
                    </span>
                    {t.temOwner ? (
                      <span
                        className="shrink-0 truncate text-[11px] text-[rgb(var(--foreground-muted))]"
                        title={t.ownerEmail ?? ''}
                      >
                        {t.ownerEmail}
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        <UserX className="h-3 w-3" />
                        Sem presidente
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {selecionada && (
        <form
          action={action}
          className="space-y-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-4"
        >
          <input type="hidden" name="tenantId" value={selecionada.id} />
          <p className="text-sm text-[rgb(var(--foreground))]">
            Transferir{' '}
            <strong>
              {selecionada.nome}
              {selecionadaClube ? ` — ${selecionadaClube}` : ''}
            </strong>
            {selecionada.temOwner && selecionada.ownerEmail && (
              <span className="text-[rgb(var(--foreground-muted))]">
                {' '}
                (owner atual: {selecionada.ownerEmail})
              </span>
            )}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <input
                name="email"
                type="email"
                required
                placeholder="E-mail do presidente"
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
              />
              {state.errors?.email?.[0] && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.errors.email[0]}</p>
              )}
              {state.message && !state.success && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.message}</p>
              )}
            </div>
            <SubmitButton />
          </div>
        </form>
      )}
    </div>
  )
}
