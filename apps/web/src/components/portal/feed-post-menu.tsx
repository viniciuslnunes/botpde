'use client'

import { useRef, useState, useTransition } from 'react'
import { m } from 'motion/react'
import { MoreHorizontal, Pencil, Trash2, Pin, PinOff } from 'lucide-react'
import { toast } from '@torcida/ui'
import { excluirPost, fixarPostPerfil, ocultarPostGrupo } from '@/app/portal/comunidade/actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { emitirPostExcluido } from '@/lib/feed-live-refresh'
import { usePostEditActions } from './post-edit-provider'
import { FloatingMenu } from './floating-menu'
import { menuItemStagger, springSnappy } from '@/lib/motion-presets'

interface FeedPostMenuProps {
  postId: string
  fixado?: boolean
  modo?: 'autor' | 'moderar-grupo'
}

export function FeedPostMenu({ postId, fixado = false, modo = 'autor' }: FeedPostMenuProps) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(fixado)
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()
  const triggerRef = useRef<HTMLButtonElement>(null)
  // A edição acontece no corpo do post (texto e anexos no lugar deles).
  const edicao = usePostEditActions()

  if (modo === 'moderar-grupo') {
    return (
      <div className="relative">
        <m.button
          ref={triggerRef}
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
        <FloatingMenu
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          minWidth={160}
        >
          <m.button
            type="button"
            role="menuitem"
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
        </FloatingMenu>
      </div>
    )
  }

  return (
    <div className="relative">
      <m.button
        ref={triggerRef}
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
      <FloatingMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        minWidth={144}
      >
        <m.button
          type="button"
          role="menuitem"
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
        {edicao && (
          <m.button
            type="button"
            role="menuitem"
            custom={1}
            variants={menuItemStagger}
            initial="hidden"
            animate="show"
            onClick={() => {
              setOpen(false)
              edicao.abrirEdicao()
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[rgb(var(--background-subtle))]"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </m.button>
        )}
        <m.button
          type="button"
          role="menuitem"
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
      </FloatingMenu>
    </div>
  )
}
