'use client'

import { useTransition } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { runPersistAction } from '@/lib/toast-action'
import {
  descartarDenunciaMensagemSuperAdminAction,
  descartarDenunciaSuperAdminAction,
  resolverDenunciaMensagemSuperAdminAction,
  resolverDenunciaSuperAdminAction,
} from './actions'

export function ModeracaoActionsButtons({
  denunciaId,
  tipo,
}: {
  denunciaId: string
  tipo: 'post' | 'mensagem'
}) {
  const [pending, startTransition] = useTransition()

  const resolverAction = tipo === 'post' ? resolverDenunciaSuperAdminAction : resolverDenunciaMensagemSuperAdminAction
  const descartarAction = tipo === 'post' ? descartarDenunciaSuperAdminAction : descartarDenunciaMensagemSuperAdminAction
  const rotuloConteudo = tipo === 'post' ? 'o post' : 'a mensagem'

  function resolver() {
    if (!window.confirm(`Resolver esta denúncia? ${rotuloConteudo === 'o post' ? 'O post' : 'A mensagem'} será removido(a) de imediato.`)) {
      return
    }
    startTransition(async () => {
      await runPersistAction(() => resolverAction(denunciaId), { success: 'Denúncia resolvida.' })
    })
  }

  function descartar() {
    if (!window.confirm('Descartar esta denúncia sem remover o conteúdo?')) return
    startTransition(async () => {
      await runPersistAction(() => descartarAction(denunciaId), { success: 'Denúncia descartada.' })
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={resolver}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Resolver e remover
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={descartar}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        Descartar
      </button>
    </div>
  )
}
