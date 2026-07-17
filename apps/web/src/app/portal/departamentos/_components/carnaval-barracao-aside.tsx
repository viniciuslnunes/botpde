'use client'

import { useTransition } from 'react'
import { PartyPopper, Loader2, Check } from 'lucide-react'
import { BARRACAO_CHECKLIST, barracaoItemsFromMeta, barracaoProgress } from '@torcida/types'
import { toggleBarracaoItem } from '../actions'

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
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
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

        <ul id="barracao" className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-3">
          {BARRACAO_CHECKLIST.map((def) => {
            const done = Boolean(items[def.id]?.done)
            return (
              <li key={def.id} className="flex items-center justify-between gap-2 text-sm">
                <span
                  className={
                    done
                      ? 'text-[rgb(var(--foreground-muted))] line-through'
                      : 'text-[rgb(var(--foreground))]'
                  }
                >
                  {def.label}
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
                      startTransition(async () => {
                        await toggleBarracaoItem({}, fd)
                      })
                    }}
                    className={[
                      'inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs',
                      done
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                    aria-label={done ? `Desmarcar ${def.label}` : `Marcar ${def.label}`}
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : done ? (
                      <Check className="h-3.5 w-3.5" />
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
