'use client'

import { useEffect, useState } from 'react'
import { STATUS_PEDIDO_TICKET } from '@torcida/types'

export type PedidoTicketMeta = {
  ticketId: string
  status: 'ABERTO' | 'ATENDENDO' | 'FECHADO'
  modalidadeEntrega: string
  pedidoIdCurto: string
  pedidoStatus: string
  motivoFecho: string | null
}

export function PedidoTicketBanner({
  conversaId,
  onStatus,
}: {
  conversaId: string
  onStatus?: (status: PedidoTicketMeta['status'] | null) => void
}) {
  const [meta, setMeta] = useState<PedidoTicketMeta | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/conversas/${conversaId}/pedido-ticket`)
        if (!res.ok) {
          if (!cancelled) {
            setMeta(null)
            onStatus?.(null)
          }
          return
        }
        const data = (await res.json()) as { ticket: PedidoTicketMeta | null }
        if (cancelled) return
        setMeta(data.ticket)
        onStatus?.(data.ticket?.status ?? null)
      } catch {
        if (!cancelled) {
          setMeta(null)
          onStatus?.(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [conversaId, onStatus])

  if (!meta) return null

  const statusInfo = STATUS_PEDIDO_TICKET[meta.status]
  const modalidade = meta.modalidadeEntrega === 'ENVIO' ? 'Envio' : 'Retirada'

  return (
    <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-2 text-xs text-[rgb(var(--foreground-muted))]">
      <p className="font-medium text-[rgb(var(--foreground))]">
        Pedido {meta.pedidoIdCurto} · {modalidade} · {statusInfo?.label ?? meta.status}
      </p>
      {meta.status === 'FECHADO' && (
        <p className="mt-0.5">Ticket fechado — conversa só para consulta.</p>
      )}
      {meta.status === 'ABERTO' && (
        <p className="mt-0.5">Aguardando a loja assumir o atendimento na fila.</p>
      )}
    </div>
  )
}
