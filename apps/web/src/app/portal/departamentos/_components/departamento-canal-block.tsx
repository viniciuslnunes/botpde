'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MessageCircle, Loader2 } from 'lucide-react'
import { vincularCanalArea, type ActionState } from '../actions'

type CanalOpcao = { id: string; nome: string | null }

export function DepartamentoCanalBlock({
  departamentoId,
  slug,
  isGestor,
  canal,
  canaisDisponiveis,
}: {
  departamentoId: string
  slug: string
  isGestor: boolean
  canal: { id: string; nome: string | null } | null
  canaisDisponiveis: CanalOpcao[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canal && !isGestor) return null

  return (
    <section
      id="canal"
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[rgb(var(--primary))]" />
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Canal da área</h2>
          </div>
          {canal ? (
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              {canal.nome?.trim() || 'Canal vinculado'}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Nenhum canal vinculado. Gestores escolhem um canal existente da Comunidade.
            </p>
          )}
        </div>
        {canal && (
          <Link
            href={`/portal/mensagens?c=${canal.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Abrir canal
          </Link>
        )}
      </div>

      {isGestor && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2 border-t border-[rgb(var(--border))] pt-3"
          action={(fd) => {
            setError(null)
            startTransition(async () => {
              const res: ActionState = await vincularCanalArea({}, fd)
              if (res.error) setError(res.error)
            })
          }}
        >
          <input type="hidden" name="departamentoId" value={departamentoId} />
          <input type="hidden" name="slug" value={slug} />
          <div className="min-w-[12rem] flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
              Vincular canal
            </label>
            <select
              name="conversaId"
              defaultValue={canal?.id ?? '__none__'}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            >
              <option value="__none__">Sem canal</option>
              {canaisDisponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome?.trim() || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar
          </button>
          {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}
    </section>
  )
}
