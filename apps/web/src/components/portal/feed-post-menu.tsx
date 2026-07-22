'use client'

import { useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { MoreHorizontal, Pencil, Trash2, Pin, PinOff } from 'lucide-react'
import { toast } from '@torcida/ui'
import { editarPost, excluirPost, fixarPostPerfil, ocultarPostGrupo } from '@/app/portal/comunidade/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { emitirPostExcluido } from '@/lib/feed-live-refresh'
import {
  paraTextoLegivel,
  podarMencoes,
  serializarMencoes,
  type MencaoParsed,
} from '@/lib/comunidade-social'
import { menuItemStagger, popoverPanel, springGentle, springSnappy } from '@/lib/motion-presets'

interface FeedPostMenuProps {
  postId: string
  conteudoInicial: string
  fixado?: boolean
  modo?: 'autor' | 'moderar-grupo'
}

export function FeedPostMenu({
  postId,
  conteudoInicial,
  fixado = false,
  modo = 'autor',
}: FeedPostMenuProps) {
  const inicial = paraTextoLegivel(conteudoInicial)
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(inicial.texto)
  const [mencoes, setMencoes] = useState<MencaoParsed[]>(inicial.mencoes)
  const [pinned, setPinned] = useState(fixado)
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()

  function abrirEdicao() {
    const next = paraTextoLegivel(conteudoInicial)
    setTexto(next.texto)
    setMencoes(next.mencoes)
    setEditando(true)
  }

  if (modo === 'moderar-grupo') {
    return (
      <div className="relative">
        <m.button
          type="button"
          aria-label="Moderar post"
          aria-expanded={open}
          whileTap={{ scale: 0.9 }}
          transition={springSnappy}
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </m.button>
        <AnimatePresence>
          {open && (
            <>
              <m.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-10"
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <m.div
                key="menu"
                variants={popoverPanel}
                initial="hidden"
                animate="show"
                exit="exit"
                transition={springSnappy}
                className="card-soft absolute right-0 z-20 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
              >
                <m.button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setOpen(false)
                    void confirmAction({
                      titulo: 'Remover do mural?',
                      descricao: 'O post deixa de aparecer no grupo e no feed.',
                      labelConfirmar: 'Remover',
                      variante: 'destructive',
                      cancelled: false,
                      run: async () => {
                        await ocultarPostGrupo(postId)
                        emitirPostExcluido({ postId })
                      },
                      success: 'Post removido do mural.',
                    })
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-[rgb(var(--background-subtle))]"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remover do mural
                </m.button>
              </m.div>
            </>
          )}
        </AnimatePresence>
      </div>
    )
  }

  if (editando) {
    return (
      <m.form
        layout
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={springGentle}
        className="mt-3 space-y-2 overflow-hidden"
        onSubmit={(e) => {
          e.preventDefault()
          startTransition(async () => {
            try {
              await editarPost(postId, serializarMencoes(texto, mencoes))
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
          onChange={(e) => {
            const { texto: legivel, mencoes: coladas } = paraTextoLegivel(e.target.value)
            setTexto(legivel)
            setMencoes((prev) => {
              const merged = [...prev]
              for (const m of coladas) {
                if (!merged.some((x) => x.userId === m.userId)) merged.push(m)
              }
              return podarMencoes(legivel, merged)
            })
          }}
          maxLength={3000}
          rows={3}
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <m.button
            type="submit"
            disabled={pending}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            Salvar
          </m.button>
          <m.button
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            onClick={() => {
              setEditando(false)
              const next = paraTextoLegivel(conteudoInicial)
              setTexto(next.texto)
              setMencoes(next.mencoes)
            }}
            className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs"
          >
            Cancelar
          </m.button>
        </div>
      </m.form>
    )
  }

  return (
    <div className="relative">
      <m.button
        type="button"
        aria-label="Opções do post"
        aria-expanded={open}
        whileTap={{ scale: 0.9 }}
        transition={springSnappy}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </m.button>
      <AnimatePresence>
        {open && (
          <>
            <m.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <m.div
              key="menu"
              variants={popoverPanel}
              initial="hidden"
              animate="show"
              exit="exit"
              transition={springSnappy}
              className="card-soft absolute right-0 z-20 mt-1 min-w-[9rem] overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
            >
              <m.button
                type="button"
                custom={0}
                variants={menuItemStagger}
                initial="hidden"
                animate="show"
                disabled={pending}
                onClick={() => {
                  setOpen(false)
                  startTransition(async () => {
                    try {
                      await fixarPostPerfil(postId)
                      setPinned((v) => !v)
                      toast.success(pinned ? 'Post desafixado.' : 'Post fixado no perfil.')
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Não foi possível fixar.')
                    }
                  })
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[rgb(var(--background-subtle))]"
              >
                {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                {pinned ? 'Desafixar do perfil' : 'Fixar no perfil'}
              </m.button>
              <m.button
                type="button"
                custom={1}
                variants={menuItemStagger}
                initial="hidden"
                animate="show"
                onClick={() => {
                  setOpen(false)
                  abrirEdicao()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[rgb(var(--background-subtle))]"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </m.button>
              <m.button
                type="button"
                custom={2}
                variants={menuItemStagger}
                initial="hidden"
                animate="show"
                disabled={pending}
                onClick={() => {
                  setOpen(false)
                  void confirmAction({
                    titulo: 'Excluir este post?',
                    descricao: 'O post será removido permanentemente.',
                    labelConfirmar: 'Excluir',
                    variante: 'destructive',
                    cancelled: false,
                    run: async () => {
                      await excluirPost(postId)
                      emitirPostExcluido({ postId })
                    },
                    success: 'Post excluído.',
                  })
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-[rgb(var(--background-subtle))]"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </m.button>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
