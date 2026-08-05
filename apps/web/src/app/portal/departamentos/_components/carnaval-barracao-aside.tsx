'use client'

import { useState, useTransition } from 'react'
import { PartyPopper, Loader2, Check, AlertTriangle } from 'lucide-react'
import {
  BARRACAO_CHECKLIST,
  BARRACAO_URGENCIA_DIAS,
  barracaoEmUrgencia,
  barracaoItemsFromMeta,
  barracaoProgress,
  desfileEmFromMeta,
  diasAteDesfile,
} from '@torcida/types'
import { DatePicker } from '@/components/ui/date-picker'
import { salvarDesfileEm, toggleBarracaoItem } from '../actions'

export function CarnavalBarracaoAside({
  departamentoId,
  slug,
  nome,
  isGestor,
  meta,
  proximosCount,
}: {
  departamentoId: string
  slug: string
  nome: string
  isGestor: boolean
  meta: unknown
  proximosCount: number
}) {
  const items = barracaoItemsFromMeta(meta)
  const progress = barracaoProgress(meta)
  const desfile = desfileEmFromMeta(meta)
  const dias = diasAteDesfile(meta)
  const urgente = barracaoEmUrgencia(meta)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [desfileLocal, setDesfileLocal] = useState(
    desfile ? desfile.toISOString().slice(0, 10) : '',
  )
  const [desfilePending, startDesfile] = useTransition()

  return (
    <div className="space-y-4">
      <div
        id="barracao"
        className="scroll-mt-20 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
      >
        <div className="flex items-center gap-2">
          <PartyPopper className="h-4 w-4 text-pink-600 dark:text-pink-400" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Barracão</h2>
        </div>
        <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
          Checklist operacional de {nome} — avisos e preparação, sem ERP de escola.
        </p>
        <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
          {progress.done}/{progress.total} itens · {proximosCount} evento
          {proximosCount === 1 ? '' : 's'} na agenda
        </p>

        {urgente && dias != null ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[rgb(var(--color-danger)_/_0.35)] bg-[rgb(var(--color-danger)_/_0.08)] px-3 py-2 text-xs text-[rgb(var(--color-danger-fg))]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Faltam {dias} dia{dias === 1 ? '' : 's'} para o desfile (≤{BARRACAO_URGENCIA_DIAS}
              d) — priorize os itens pendentes.
            </span>
          </div>
        ) : null}

        <div className="mt-4 border-t border-[rgb(var(--border))] pt-3">
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Data do desfile
          </label>
          {isGestor ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <DatePicker
                value={desfileLocal}
                onChange={setDesfileLocal}
                aria-label="Data do desfile"
                className="min-w-[11rem] flex-1"
              />
              <button
                type="button"
                disabled={desfilePending}
                onClick={() => {
                  const fd = new FormData()
                  fd.set('departamentoId', departamentoId)
                  fd.set('slug', slug)
                  fd.set('desfileEm', desfileLocal)
                  startDesfile(async () => {
                    await salvarDesfileEm({}, fd)
                  })
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 text-xs font-semibold text-[rgb(var(--foreground))] disabled:opacity-60"
              >
                {desfilePending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : null}
                Salvar
              </button>
            </div>
          ) : (
            <p className="mt-1 text-sm text-[rgb(var(--foreground))]">
              {desfile
                ? desfile.toLocaleDateString('pt-BR')
                : 'Não definida'}
            </p>
          )}
        </div>

        <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-3">
          {BARRACAO_CHECKLIST.map((def) => {
            const done = Boolean(items[def.id]?.done)
            const itemPending = pending && pendingId === def.id
            const critico = urgente && !done
            return (
              <li key={def.id} className="flex items-center justify-between gap-2 text-sm">
                <span
                  className={
                    done
                      ? 'text-[rgb(var(--foreground-muted))] line-through'
                      : critico
                        ? 'font-medium text-[rgb(var(--color-danger-fg))]'
                        : 'text-[rgb(var(--foreground))]'
                  }
                >
                  {def.label}
                  {critico ? (
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">
                      urgente
                    </span>
                  ) : null}
                </span>
                {isGestor ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const fd = new FormData()
                      fd.set('departamentoId', departamentoId)
                      fd.set('slug', slug)
                      fd.set('itemId', def.id)
                      fd.set('done', done ? 'false' : 'true')
                      setPendingId(def.id)
                      startTransition(async () => {
                        try {
                          await toggleBarracaoItem({}, fd)
                        } finally {
                          setPendingId(null)
                        }
                      })
                    }}
                    className={[
                      'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-xs',
                      done
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : critico
                          ? 'border-[rgb(var(--color-danger)_/_0.45)] text-[rgb(var(--color-danger-fg))]'
                          : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                    aria-label={done ? `Desmarcar ${def.label}` : `Marcar ${def.label}`}
                  >
                    {itemPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : done ? (
                      <Check className="h-4 w-4" />
                    ) : null}
                  </button>
                ) : done ? (
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">—</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function CarnavalBarracaoSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-48 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
    </div>
  )
}
