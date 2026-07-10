'use client'

import { useTransition } from 'react'
import { Loader2, Square } from 'lucide-react'
import { toast } from '@torcida/ui'
import { votarEnquetePost, encerrarEnquetePost } from '@/app/portal/comunidade/actions'
import type { EnquetePostItem } from '@/lib/feed'

interface PostPollProps {
  enquete: EnquetePostItem
  isAuthor?: boolean
}

export function PostPoll({ enquete, isAuthor = false }: PostPollProps) {
  const [pending, startTransition] = useTransition()

  function votar(opcaoId: string) {
    if (enquete.encerrada || pending) return
    startTransition(async () => {
      try {
        await votarEnquetePost(enquete.id, opcaoId)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível votar.')
      }
    })
  }

  function encerrar() {
    if (!confirm('Encerrar esta enquete? Ninguém mais poderá votar.')) return
    startTransition(async () => {
      try {
        await encerrarEnquetePost(enquete.id)
        toast.success('Enquete encerrada.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível encerrar.')
      }
    })
  }

  const mostrarResultados = enquete.encerrada || enquete.meuVotoOpcaoId !== null

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
      {enquete.opcoes.map((op) => {
        const pct =
          enquete.totalVotos > 0 ? Math.round((op.votos / enquete.totalVotos) * 100) : 0
        const selecionada = enquete.meuVotoOpcaoId === op.id
        return (
          <button
            key={op.id}
            type="button"
            disabled={enquete.encerrada || pending || enquete.meuVotoOpcaoId !== null}
            onClick={() => votar(op.id)}
            className={[
              'relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              selecionada
                ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.08)]'
                : 'border-[rgb(var(--border))] hover:border-[rgb(var(--primary)_/_0.4)]',
            ].join(' ')}
          >
            {mostrarResultados && (
              <span
                className="absolute inset-y-0 left-0 bg-[rgb(var(--primary)_/_0.12)]"
                style={{ width: `${pct}%` }}
              />
            )}
            <span className="relative flex items-center justify-between gap-2">
              <span>{op.texto}</span>
              {mostrarResultados && (
                <span className="text-xs text-[rgb(var(--foreground-muted))]">{pct}%</span>
              )}
            </span>
          </button>
        )
      })}
      <div className="flex items-center justify-between gap-2">
        <p className="text-center text-[11px] text-[rgb(var(--foreground-muted))]">
          {pending && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
          {enquete.totalVotos} voto{enquete.totalVotos === 1 ? '' : 's'}
          {enquete.encerrada && ' · Encerrada'}
        </p>
        {isAuthor && !enquete.encerrada && (
          <button
            type="button"
            disabled={pending}
            onClick={encerrar}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--primary))]"
          >
            <Square className="h-3 w-3" />
            Encerrar
          </button>
        )}
      </div>
    </div>
  )
}
