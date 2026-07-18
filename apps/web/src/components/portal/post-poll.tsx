'use client'

import { useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Loader2, Square } from 'lucide-react'
import { toast } from '@torcida/ui'
import { votarEnquetePost, encerrarEnquetePost } from '@/app/portal/comunidade/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import type { EnquetePostItem } from '@/lib/feed'
import { springGentle, springSnappy } from '@/lib/motion-presets'

interface PostPollProps {
  enquete: EnquetePostItem
  isAuthor?: boolean
}

export function PostPoll({ enquete: enqueteInicial, isAuthor = false }: PostPollProps) {
  const [enquete, setEnquete] = useState(enqueteInicial)
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()

  const mostrarResultados = enquete.encerrada || enquete.meuVotoOpcaoId !== null

  function votar(opcaoId: string) {
    if (enquete.encerrada || pending || enquete.meuVotoOpcaoId !== null) return

    const jaVotou = enquete.meuVotoOpcaoId
    setEnquete((prev) => ({
      ...prev,
      meuVotoOpcaoId: opcaoId,
      totalVotos: jaVotou ? prev.totalVotos : prev.totalVotos + 1,
      opcoes: prev.opcoes.map((op) =>
        op.id === opcaoId ? { ...op, votos: op.votos + 1 } : op,
      ),
    }))

    startTransition(async () => {
      try {
        await votarEnquetePost(enquete.id, opcaoId)
      } catch (e) {
        setEnquete(enqueteInicial)
        toast.error(e instanceof Error ? e.message : 'Não foi possível votar.')
      }
    })
  }

  function encerrar() {
    void confirmAction({
      titulo: 'Encerrar esta enquete?',
      descricao: 'Ninguém mais poderá votar.',
      labelConfirmar: 'Encerrar',
      variante: 'destructive',
      cancelled: false,
      run: async () => {
        await encerrarEnquetePost(enquete.id)
        setEnquete((prev) => ({ ...prev, encerrada: true }))
      },
      success: 'Enquete encerrada.',
    })
  }

  return (
    <m.div
      layout
      className="mt-3 space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3"
    >
      {enquete.opcoes.map((op) => {
        const pct =
          enquete.totalVotos > 0 ? Math.round((op.votos / enquete.totalVotos) * 100) : 0
        const selecionada = enquete.meuVotoOpcaoId === op.id
        return (
          <m.button
            key={op.id}
            type="button"
            layout
            disabled={enquete.encerrada || pending || enquete.meuVotoOpcaoId !== null}
            onClick={() => votar(op.id)}
            whileTap={enquete.meuVotoOpcaoId === null && !enquete.encerrada ? { scale: 0.98 } : undefined}
            transition={springSnappy}
            className={[
              'relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              selecionada
                ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.08)]'
                : 'border-[rgb(var(--border))] hover:border-[rgb(var(--primary)_/_0.4)]',
            ].join(' ')}
          >
            <AnimatePresence>
              {mostrarResultados && (
                <m.span
                  layout
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={springGentle}
                  className="absolute inset-y-0 left-0 bg-[rgb(var(--primary)_/_0.12)]"
                />
              )}
            </AnimatePresence>
            <span className="relative flex items-center justify-between gap-2">
              <span>{op.texto}</span>
              <AnimatePresence>
                {mostrarResultados && (
                  <m.span
                    key={`pct-${op.id}-${pct}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={springSnappy}
                    className="text-xs text-[rgb(var(--foreground-muted))]"
                  >
                    {pct}%
                  </m.span>
                )}
              </AnimatePresence>
            </span>
          </m.button>
        )
      })}
      <div className="flex items-center justify-between gap-2">
        <m.p layout className="text-center text-[11px] text-[rgb(var(--foreground-muted))]">
          {pending && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
          {enquete.totalVotos} voto{enquete.totalVotos === 1 ? '' : 's'}
          <AnimatePresence>
            {enquete.encerrada && (
              <m.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={springSnappy}
              >
                {' '}
                · Encerrada
              </m.span>
            )}
          </AnimatePresence>
        </m.p>
        {isAuthor && !enquete.encerrada && (
          <m.button
            type="button"
            disabled={pending}
            onClick={encerrar}
            whileTap={{ scale: 0.95 }}
            transition={springSnappy}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--color-primary-fg))]"
          >
            <Square className="h-3 w-3" />
            Encerrar
          </m.button>
        )}
      </div>
    </m.div>
  )
}
