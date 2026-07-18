'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MessageCircle, Loader2, ChevronDown } from 'lucide-react'
import { toast } from '@torcida/ui/services/toast'
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

  // Canal já vinculado: linha compacta.
  if (canal) {
    return (
      <section
        id="canal"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
      >
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle className="h-4 w-4 shrink-0 text-[rgb(var(--primary))]" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
              {canal.nome?.trim() || 'Canal do departamento'}
            </p>
            {isGestor && (
              <details className="group mt-0.5">
                <summary className="cursor-pointer list-none text-xs text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] [&::-webkit-details-marker]:hidden">
                  Alterar vínculo
                  <ChevronDown className="ml-0.5 inline h-3 w-3 transition-transform group-open:rotate-180" />
                </summary>
                <CanalVincularForm
                  departamentoId={departamentoId}
                  slug={slug}
                  canal={canal}
                  canaisDisponiveis={canaisDisponiveis}
                  pending={pending}
                  error={error}
                  onSubmit={(fd) => {
                    setError(null)
                    startTransition(async () => {
                      const res: ActionState = await vincularCanalArea({}, fd)
                      if (res.error) {
                        setError(res.error)
                        return
                      }
                      toast.success('Canal do departamento atualizado')
                    })
                  }}
                />
              </details>
            )}
          </div>
        </div>
        <Link
          href={`/portal/mensagens?c=${canal.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          Abrir canal
        </Link>
      </section>
    )
  }

  // Sem canal + gestor: bloco colapsável de setup.
  return (
    <details
      id="canal"
      className="group rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-[rgb(var(--foreground-muted))] [&::-webkit-details-marker]:hidden">
        <MessageCircle className="h-4 w-4 text-[rgb(var(--primary))]" />
        Vincular canal do departamento
        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
        Escolha um canal existente da Comunidade para a equipe deste departamento.
      </p>
      <CanalVincularForm
        departamentoId={departamentoId}
        slug={slug}
        canal={null}
        canaisDisponiveis={canaisDisponiveis}
        pending={pending}
        error={error}
        onSubmit={(fd) => {
          setError(null)
          startTransition(async () => {
            const res: ActionState = await vincularCanalArea({}, fd)
            if (res.error) {
              setError(res.error)
              return
            }
            toast.success('Canal do departamento vinculado')
          })
        }}
      />
    </details>
  )
}

function CanalVincularForm({
  departamentoId,
  slug,
  canal,
  canaisDisponiveis,
  pending,
  error,
  onSubmit,
}: {
  departamentoId: string
  slug: string
  canal: { id: string } | null
  canaisDisponiveis: CanalOpcao[]
  pending: boolean
  error: string | null
  onSubmit: (fd: FormData) => void
}) {
  return (
    <form className="mt-3 flex flex-wrap items-end gap-2" action={onSubmit}>
      <input type="hidden" name="departamentoId" value={departamentoId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="min-w-[12rem] flex-1">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
          Canal
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
  )
}
