'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { MessageSquare, UserCheck, XCircle } from 'lucide-react'
import { Badge } from '@torcida/ui'
import { atenderTicketPedido, fecharTicketPedido } from '@/app/admin/loja/actions'
import { STATUS_PEDIDO_TICKET } from '@torcida/types'

export interface PedidoTicketUi {
  id: string
  status: 'ABERTO' | 'ATENDENDO' | 'FECHADO'
  conversaId: string
  atendenteNome: string | null
}

interface AdminPedidoTicketActionsProps {
  ticket: PedidoTicketUi | null
  podeGerir: boolean
}

const TOM_VARIANT = {
  warning: 'warning',
  info: 'info',
  neutral: 'neutral',
} as const

export function AdminPedidoTicketActions({ ticket, podeGerir }: AdminPedidoTicketActionsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  if (!ticket) {
    return <p className="text-xs text-[rgb(var(--foreground-muted))]">Sem ticket</p>
  }

  const info = STATUS_PEDIDO_TICKET[ticket.status]
  const variant = TOM_VARIANT[info.tom] ?? 'neutral'

  function irAoChat() {
    window.open(`/portal/mensagens?c=${ticket!.conversaId}`, '_blank', 'noopener,noreferrer')
  }

  function atender() {
    setErro(null)
    startTransition(async () => {
      const r = await atenderTicketPedido(ticket!.id)
      if (r.error) {
        setErro(r.error)
        return
      }
      router.refresh()
      if (r.conversaId) {
        window.open(`/portal/mensagens?c=${r.conversaId}`, '_blank', 'noopener,noreferrer')
      }
    })
  }

  function fechar() {
    setErro(null)
    startTransition(async () => {
      const r = await fecharTicketPedido(ticket!.id)
      if (r.error) {
        setErro(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Badge variant={variant}>{info.label}</Badge>
      {ticket.atendenteNome && ticket.status !== 'ABERTO' && (
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Atendente: {ticket.atendenteNome}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {ticket.status === 'ABERTO' && (
          <button
            type="button"
            disabled={pending}
            onClick={atender}
            className="inline-flex items-center gap-1 rounded-md bg-[rgb(var(--primary))] px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <UserCheck className="h-3 w-3" />
            Atender
          </button>
        )}
        {(ticket.status === 'ATENDENDO' || ticket.status === 'FECHADO') && (
          <button
            type="button"
            onClick={irAoChat}
            className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--border))] px-2 py-1 text-[11px] font-medium hover:bg-[rgb(var(--background-subtle))]"
          >
            <MessageSquare className="h-3 w-3" />
            Chat
          </button>
        )}
        {ticket.status !== 'FECHADO' && podeGerir && (
          <button
            type="button"
            disabled={pending}
            onClick={fechar}
            className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--border))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
          >
            <XCircle className="h-3 w-3" />
            Fechar ticket
          </button>
        )}
      </div>
      {erro && <p className="text-[11px] text-red-600">{erro}</p>}
    </div>
  )
}
