'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { MessageSquare, UserCheck, XCircle } from 'lucide-react'
import { Badge } from '@torcida/ui'
import { atenderTicketPedido, fecharTicketPedido } from '@/app/admin/loja/actions'
import { STATUS_PEDIDO_TICKET } from '@torcida/types'
import { AdminRowActions, type AdminRowActionItem } from '@/components/admin/ui'

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

  const items: AdminRowActionItem[] = []
  if (ticket.status === 'ABERTO') {
    items.push({
      id: 'atender',
      label: pending ? 'Abrindo…' : 'Atender',
      icon: UserCheck,
      disabled: pending,
      onSelect: atender,
    })
  }
  if (ticket.status === 'ATENDENDO' || ticket.status === 'FECHADO') {
    items.push({
      id: 'chat',
      label: 'Chat',
      icon: MessageSquare,
      onSelect: irAoChat,
    })
  }
  if (ticket.status !== 'FECHADO' && podeGerir) {
    items.push({
      id: 'fechar',
      label: 'Fechar ticket',
      icon: XCircle,
      tone: 'muted',
      disabled: pending,
      onSelect: fechar,
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Badge variant={variant}>{info.label}</Badge>
        <AdminRowActions ariaLabel={`Ações do ticket (${info.label})`} items={items} />
      </div>
      {ticket.atendenteNome && ticket.status !== 'ABERTO' && (
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Atendente: {ticket.atendenteNome}
        </p>
      )}
      {erro && <p className="text-[11px] text-red-600">{erro}</p>}
    </div>
  )
}
