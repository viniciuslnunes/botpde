'use client'

import { useActionState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import {
  CARAVANA_PROCEDIMENTO_CATALOGO,
  caravanaProcedimentoFromMeta,
  caravanaProcedimentoProgress,
} from '@torcida/types'
import { toggleProcedimentoCaravana } from '@/app/admin/eventos/procedimento-actions'
import { useActionStateToast } from '@/lib/toast-action'
import { BarraSaude } from '@/components/departamentos/barra-saude'

type Props = {
  eventoId: string
  meta: unknown
  podeGerir: boolean
}

export function ProcedimentoCaravanaPainel({ eventoId, meta, podeGerir }: Props) {
  const items = caravanaProcedimentoFromMeta(meta)
  const progress = caravanaProcedimentoProgress(meta)
  const [state, action, pending] = useActionState(toggleProcedimentoCaravana, {})
  useActionStateToast(state, pending, 'Checklist atualizada')

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
            <ClipboardCheck className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" aria-hidden />
            Procedimento pré-embarque
          </h3>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            Documentos, contato do motorista e materiais — o que a empresa de fretamento pede antes
            da porta.
          </p>
        </div>
        {progress.total > 0 ? (
          <BarraSaude
            label={`Checklist ${progress.done}/${progress.total}`}
            percentual={Math.round((progress.done / progress.total) * 100)}
          />
        ) : null}
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            {podeGerir ? (
              <form action={action} className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2.5">
                <input type="hidden" name="eventoId" value={eventoId} />
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="done" value={item.done ? 'false' : 'true'} />
                <button
                  type="submit"
                  disabled={pending}
                  className="app-touch-target mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] disabled:opacity-60"
                  aria-pressed={item.done}
                  aria-label={item.done ? `Desmarcar ${item.label}` : `Marcar ${item.label}`}
                >
                  {item.done ? (
                    <span className="text-xs font-bold text-[rgb(var(--color-primary-fg))]">✓</span>
                  ) : null}
                </button>
                <span className={`text-sm ${item.done ? 'text-[rgb(var(--foreground-muted))] line-through' : 'text-[rgb(var(--foreground))]'}`}>
                  {item.label}
                </span>
              </form>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                    item.done
                      ? 'border-[rgb(var(--color-primary)_/_0.4)] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                      : 'border-[rgb(var(--border))]'
                  }`}
                  aria-hidden
                >
                  {item.done ? '✓' : ''}
                </span>
                <span className="text-sm text-[rgb(var(--foreground))]">{item.label}</span>
              </div>
            )}
          </li>
        ))}
      </ul>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
          {CARAVANA_PROCEDIMENTO_CATALOGO.length} itens padrão — marque conforme for fechando a
          viagem.
        </p>
      ) : null}
    </section>
  )
}
