'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { m } from 'motion/react'
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
import { FloatingMenu, FLOATING_MENU_ITEM, FLOATING_MENU_ITEM_DANGER } from './floating-menu'
import { menuItemStagger, springGentle, springSnappy } from '@/lib/motion-presets'

interface ComentarioMenuProps {
  comentarioId: string
  conteudoInicial: string
  /** Cabeçalho da linha — texto simples ou "Nome · há 2 h". */
  autorLabel: ReactNode
  onEditado: (conteudo: string) => void
  onExcluido: () => void
  children: ReactNode
  /** Default: actions de comentário de post (com @menções). */
  editarAction?: (id: string, conteudo: string) => Promise<string>
  excluirAction?: (id: string) => Promise<void>
  maxLength?: number
  /** Quando false, edita texto puro (praça / fórum). Default true. */
  comMencoes?: boolean
  /** `bubble` = cartão arredondado (feed/post); `bare` = só o cabeçalho+conteúdo. */
  variant?: 'bubble' | 'bare'
}

async function editarPadrao(id: string, conteudo: string): Promise<string> {
  const salvo = await editarComentario(id, conteudo)
  return salvo.conteudo
}

export function ComentarioMenu({
  comentarioId,
  conteudoInicial,
  autorLabel,
  onEditado,
  onExcluido,
  children,
  editarAction = editarPadrao,
  excluirAction = excluirComentario,
  maxLength = 500,
  comMencoes = true,
  variant = 'bubble',
}: ComentarioMenuProps) {
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState(false)
  const inicial = comMencoes
    ? paraTextoLegivel(conteudoInicial)
    : { texto: conteudoInicial, mencoes: [] as MencaoParsed[] }
  const [texto, setTexto] = useState(inicial.texto)
  const [mencoes, setMencoes] = useState<MencaoParsed[]>(inicial.mencoes)
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()
  const triggerRef = useRef<HTMLButtonElement>(null)

  function resetTexto() {
    if (comMencoes) {
      const next = paraTextoLegivel(conteudoInicial)
      setTexto(next.texto)
      setMencoes(next.mencoes)
    } else {
      setTexto(conteudoInicial)
      setMencoes([])
    }
  }

  const shellClass =
    variant === 'bubble'
      ? 'min-w-0 flex-1 rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2'
      : 'min-w-0 flex-1'

  return (
    <div className={shellClass}>
      <div className="flex items-start gap-1">
        <p className="min-w-0 flex-1 text-xs font-semibold text-[rgb(var(--foreground))]">{autorLabel}</p>
        {!editando && (
          <div className="relative shrink-0">
            <m.button
              ref={triggerRef}
              type="button"
              aria-label="Opções do comentário"
              aria-expanded={open}
              whileTap={{ scale: 0.9 }}
              transition={springSnappy}
              onClick={() => setOpen((v) => !v)}
              className="app-touch-target rounded-lg p-1 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background))]"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </m.button>
            <FloatingMenu
              open={open}
              onClose={() => setOpen(false)}
              anchorRef={triggerRef}
              minWidth={128}
            >
              <m.button
                type="button"
                role="menuitem"
                custom={0}
                variants={menuItemStagger}
                initial="hidden"
                animate="show"
                onClick={() => {
                  setOpen(false)
                  resetTexto()
                  setEditando(true)
                }}
                className={FLOATING_MENU_ITEM}
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </m.button>
              <m.button
                type="button"
                role="menuitem"
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
                      run: () => excluirAction(comentarioId),
                      success: 'Comentário excluído.',
                    })
                    if (ok) onExcluido()
                  })()
                }}
                className={FLOATING_MENU_ITEM_DANGER}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </m.button>
            </FloatingMenu>
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
            const next = (comMencoes ? serializarMencoes(texto, mencoes) : texto).trim()
            if (!next) return
            startTransition(async () => {
              try {
                const salvo = await editarAction(comentarioId, next)
                onEditado(salvo)
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
              if (!comMencoes) {
                setTexto(e.target.value)
                return
              }
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
            maxLength={maxLength}
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
              className="rounded-lg bg-[rgb(var(--primary))] px-2.5 py-1 text-xs font-semibold text-primary-on disabled:opacity-60"
            >
              Salvar
            </m.button>
            <m.button
              type="button"
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              onClick={() => {
                setEditando(false)
                resetTexto()
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
