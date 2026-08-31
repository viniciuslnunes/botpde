'use client'

import { useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { AdminRowActions } from '@/components/admin/ui'
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
    <AdminRowActions
      ariaLabel={`Ações da denúncia de ${rotuloConteudo}`}
      items={[
        {
          id: 'resolver',
          label: pending ? 'Salvando…' : 'Resolver e remover',
          icon: Check,
          tone: 'danger',
          disabled: pending,
          onSelect: resolver,
        },
        {
          id: 'descartar',
          label: 'Descartar',
          icon: X,
          disabled: pending,
          onSelect: descartar,
        },
      ]}
    />
  )
}
