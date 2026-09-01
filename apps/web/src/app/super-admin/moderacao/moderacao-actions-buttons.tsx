'use client'

import { useTransition } from 'react'
import { Check, X } from 'lucide-react'
import { AdminRowActions } from '@/components/admin/ui'
import { runPersistAction } from '@/lib/toast-action'
import {
  descartarDenunciaModeracaoSuperAdminAction,
  descartarDenunciaMensagemSuperAdminAction,
  descartarDenunciaSuperAdminAction,
  resolverDenunciaModeracaoSuperAdminAction,
  resolverDenunciaMensagemSuperAdminAction,
  resolverDenunciaSuperAdminAction,
} from './actions'

const RESOLVER_POR_TIPO = {
  post: resolverDenunciaSuperAdminAction,
  mensagem: resolverDenunciaMensagemSuperAdminAction,
  forum: resolverDenunciaModeracaoSuperAdminAction,
} as const

const DESCARTAR_POR_TIPO = {
  post: descartarDenunciaSuperAdminAction,
  mensagem: descartarDenunciaMensagemSuperAdminAction,
  forum: descartarDenunciaModeracaoSuperAdminAction,
} as const

const ROTULO_POR_TIPO = {
  post: 'o post',
  mensagem: 'a mensagem',
  forum: 'o conteúdo do fórum',
} as const

export function ModeracaoActionsButtons({
  denunciaId,
  tipo,
}: {
  denunciaId: string
  tipo: 'post' | 'mensagem' | 'forum'
}) {
  const [pending, startTransition] = useTransition()

  const resolverAction = RESOLVER_POR_TIPO[tipo]
  const descartarAction = DESCARTAR_POR_TIPO[tipo]
  const rotuloConteudo = ROTULO_POR_TIPO[tipo]

  function resolver() {
    if (!window.confirm(`Resolver esta denúncia? Removemos ${rotuloConteudo} de imediato.`)) {
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
