'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toast } from '@torcida/ui'
import { editarComentario, excluirComentario } from '@/app/portal/comunidade/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import {
  paraTextoLegivel,
  podarMencoes,
  serializarMencoes,
  type MencaoParsed,
} from '@/lib/comunidade-social'
import { menuItemStagger, popoverPanel, springGentle, springSnappy } from '@/lib/motion-presets'

interface ComentarioMenuProps {
  comentarioId: string
  conteudoInicial: string
  autorLabel: string
  onEditado: (conteudo: string) => void
  onExcluido: () => void
  children: ReactNode
}

export function ComentarioMenu({
  comentarioId,
  conteudoInicial,
  autorLabel,
  onEditado,
  onExcluido,
  children,
}: ComentarioMenuProps) {
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState(false)
  const inicial = paraTextoLegivel(conteudoInicial)
  const [texto, setTexto] = useState(inicial.texto)
  const [mencoes, setMencoes] = useState<MencaoParsed[]>(inicial.mencoes)
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()

  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2">
      <div className="flex items-start gap-1">
        <p className="min-w-0 flex-1 text-xs font-semibold text-[rgb(var(--foreground))]">{autorLabel}</p>
        {!editando && (
          <div className="relative shrink-0">
            <m.button
              type="button"
              aria-label="Opções do comentário"
              aria-expanded={open}
              whileTap={{ scale: 0.9 }}
              transition={springSnappy}
              onClick={() => setOpen((v) => !v)}
              className="rounded-lg p-1 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background))]"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
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
                    className="card-soft absolute right-0 z-20 mt-1 min-w-[8rem] overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
                  >
                    <m.button
                      type="button"
                      custom={0}
                      variants={menuItemStagger}
                      initial="hidden"
                      animate="show"
                      onClick={() => {
                        setOpen(false)
                        const next = paraTextoLegivel(conteudoInicial)
                        setTexto(next.texto)
                        setMencoes(next.mencoes)
                        setEditando(true)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </m.button>
                    <m.button
                      type="button"
                      custom={1}
                      variants={menuItemStagger}
                      initial="hidden"
                      animate="show"
                      disabled={pending}
                      onClick={() => {
                        setOpen(false)
                        void (async () => {
                          const ok = await confirmAction({
                            titulo: 'Excluir este comentário?',
                            descricao: 'O comentário será removido permanentemente.',
                            labelConfirmar: 'Excluir',
                            variante: 'destructive',
                            cancelled: false,
                            run: () => excluirComentario(comentarioId),
                            success: 'Comentário excluído.',
                          })
                          if (ok) onExcluido()
                        })()
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
        )}
      </div>

      {editando ? (
        <m.form
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={springGentle}
          className="mt-1 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            const next = serializarMencoes(texto, mencoes).trim()
            if (!next) return
            startTransition(async () => {
              try {
                const salvo = await editarComentario(comentarioId, next)
                onEditado(salvo.conteudo)
                setEditando(false)
                toast.success('Comentário atualizado.')
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
            maxLength={500}
            rows={2}
            autoFocus
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          />
          <div className="flex gap-2">
            <m.button
              type="submit"
              disabled={pending || !texto.trim()}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              className="rounded-lg bg-[rgb(var(--primary))] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
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
              className="rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs"
            >
              Cancelar
            </m.button>
          </div>
        </m.form>
      ) : (
        children
      )}
    </div>
  )
}
