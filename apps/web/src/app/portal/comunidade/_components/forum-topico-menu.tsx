'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { m } from 'motion/react'
import { Flag, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { excluirTopico } from '../praca-actions'
import { useConfirmAction } from '@/lib/confirm-action'
import { usePostEditActions } from '@/components/portal/post-edit-provider'
import { FloatingMenu } from '@/components/portal/floating-menu'
import { PracaDenunciaModal } from './praca-denuncia-modal'
import { menuItemStagger, springSnappy } from '@/lib/motion-presets'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

/**
 * Menu do tópico. Autor edita e exclui; quem não é autor só denuncia — por isso
 * o menu passou a aparecer para os dois, e cada item é gateado aqui dentro.
 */
export function ForumTopicoMenu({
  topicoId,
  escopo,
  isAutor = true,
}: {
  topicoId: string
  escopo: EscopoComunidade
  isAutor?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [denunciando, setDenunciando] = useState(false)
  const router = useRouter()
  const confirmAction = useConfirmAction()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const edicao = usePostEditActions()

  return (
    <div className="relative">
      <m.button
        ref={triggerRef}
        type="button"
        aria-label="Opções do tópico"
        aria-expanded={open}
        whileTap={{ scale: 0.9 }}
        transition={springSnappy}
        onClick={() => setOpen((v) => !v)}
        className="app-touch-target rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </m.button>
      <FloatingMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        minWidth={144}
      >
        {isAutor && edicao && (
          <m.button
            type="button"
            role="menuitem"
            custom={0}
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
        {isAutor && (
          <m.button
            type="button"
            role="menuitem"
            custom={1}
            variants={menuItemStagger}
            initial="hidden"
            animate="show"
            onClick={() => {
              setOpen(false)
              void confirmAction({
                titulo: 'Excluir este tópico?',
                descricao: 'O tópico some do fórum. As respostas deixam de aparecer.',
                labelConfirmar: 'Excluir',
                variante: 'destructive',
                cancelled: false,
                run: async () => {
                  await excluirTopico(topicoId, escopo)
                  router.push(`/portal/comunidade/forum?escopo=${escopo}`)
                },
                success: 'Tópico excluído.',
              })
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-[rgb(var(--background-subtle))]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </m.button>
        )}
        {!isAutor && (
          <m.button
            type="button"
            role="menuitem"
            custom={0}
            variants={menuItemStagger}
            initial="hidden"
            animate="show"
            onClick={() => {
              setOpen(false)
              setDenunciando(true)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-[rgb(var(--background-subtle))]"
          >
            <Flag className="h-3.5 w-3.5" /> Denunciar
          </m.button>
        )}
      </FloatingMenu>
      {denunciando && (
        <PracaDenunciaModal
          aberto={denunciando}
          onFechar={() => setDenunciando(false)}
          escopo={escopo}
          alvoTipo="FORUM_TOPICO"
          alvoId={topicoId}
        />
      )}
    </div>
  )
}
