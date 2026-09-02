'use client'

import { useTransition } from 'react'
import { Landmark, Pencil, Trash2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import type { MemoriaMarcoDia } from '@/lib/memoria-dia'
import { removerMemoriaMarco } from '../actions'

type Props = {
  marco: MemoriaMarcoDia | null
  podeGerir: boolean
  onEditar?: () => void
}

/** Exibição do marco — criação/edição só pelo composer unificado. */
export function MemoriaMarcoBloco({ marco, podeGerir, onEditar }: Props) {
  const [pending, start] = useTransition()

  if (!marco) return null

  function remover() {
    start(async () => {
      const res = await removerMemoriaMarco({ id: marco!.id })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Marco removido.')
    })
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/12 to-transparent px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-800 dark:text-amber-200">
          <Landmark className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="portal-kicker text-amber-800 dark:text-amber-200">Marco da torcida</p>
          <p className="portal-display mt-1 text-lg text-[rgb(var(--foreground))]">{marco.titulo}</p>
          {marco.descricao && (
            <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
              {marco.descricao}
            </p>
          )}
        </div>
        {podeGerir && (
          <div className="flex shrink-0 gap-1">
            {onEditar && (
              <button
                type="button"
                onClick={onEditar}
                className="app-touch-target rounded-lg text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
                aria-label="Editar marco"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={remover}
              className="app-touch-target rounded-lg text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--color-danger-fg))]"
              aria-label="Remover marco"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
