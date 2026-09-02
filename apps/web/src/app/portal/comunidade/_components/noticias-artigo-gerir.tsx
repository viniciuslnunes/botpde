'use client'

import { useTransition } from 'react'
import { Pin, PinOff, Trash2 } from 'lucide-react'
import { runPersistAction } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { alternarFixadoArtigo, excluirArtigo } from '../praca-actions'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { NoticiaPracaItem } from '@/lib/praca'

export function NoticiasArtigoGerir({
  item,
  escopo,
  podeGerir,
  userId,
  className = '',
  sobreEscuro = false,
}: {
  item: NoticiaPracaItem
  escopo: EscopoComunidade
  podeGerir: boolean
  userId: string
  className?: string
  /** Botões sobre foto escura (destaque bento). */
  sobreEscuro?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const confirmAction = useConfirmAction()
  const gerirArtigo = item.kind === 'artigo' && (podeGerir || item.autorId === userId)

  if (!gerirArtigo) return null

  const btnClass = sobreEscuro
    ? 'bg-black/40 text-white backdrop-blur-sm hover:bg-black/60'
    : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]'

  return (
    <div className={['flex items-center gap-1', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          startTransition(async () => {
            await runPersistAction(() => alternarFixadoArtigo(item.id, escopo), {
              success: item.fixado ? 'Notícia desafixada.' : 'Notícia fixada no topo.',
            })
          })
        }}
        disabled={pending}
        title={item.fixado ? 'Desafixar' : 'Fixar no topo'}
        className={[
          'app-touch-target flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          btnClass,
        ].join(' ')}
      >
        {item.fixado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void confirmAction({
            titulo: 'Ocultar esta notícia?',
            descricao: 'Ela sai da praça. Quem já abriu o link não a encontra mais na lista.',
            labelConfirmar: 'Ocultar',
            variante: 'destructive',
            cancelled: 'Cancelado.',
            run: () => excluirArtigo(item.id, escopo),
            success: 'Notícia ocultada.',
          })
        }}
        disabled={pending}
        className={[
          'app-touch-target flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          sobreEscuro
            ? 'bg-black/40 text-white backdrop-blur-sm hover:bg-red-600/80'
            : 'text-[rgb(var(--foreground-muted))] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400',
        ].join(' ')}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
