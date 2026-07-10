'use client'

import { useState, useTransition } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { editarPost, excluirPost } from '@/app/portal/comunidade/actions'

interface FeedPostMenuProps {
  postId: string
  conteudoInicial: string
}

export function FeedPostMenu({ postId, conteudoInicial }: FeedPostMenuProps) {
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(conteudoInicial)
  const [pending, startTransition] = useTransition()

  if (editando) {
    return (
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          startTransition(async () => {
            try {
              await editarPost(postId, texto)
              setEditando(false)
              toast.success('Post atualizado.')
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Não foi possível editar.')
            }
          })
        }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={3000}
          rows={3}
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => {
              setEditando(false)
              setTexto(conteudoInicial)
            }}
            className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs"
          >
            Cancelar
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Opções do post"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-20 mt-1 min-w-[8rem] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setEditando(true)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[rgb(var(--background-subtle))]"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false)
                if (!confirm('Excluir este post?')) return
                startTransition(async () => {
                  try {
                    await excluirPost(postId)
                    toast.success('Post excluído.')
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Não foi possível excluir.')
                  }
                })
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-[rgb(var(--background-subtle))]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          </div>
        </>
      )}
    </div>
  )
}
