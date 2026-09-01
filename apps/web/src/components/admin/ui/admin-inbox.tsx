'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import type { AdminInboxItem } from '@/lib/admin-inbox'
import {
  inboxAprovarMembro,
  inboxBaixarCobranca,
  inboxCheckInRsvp,
  inboxConfirmarPedido,
} from '@/app/admin/inbox-actions'

function labelAcao(item: AdminInboxItem): string {
  const a = item.acao
  if (!a) return ''
  if (a.label) return a.label
  switch (a.tipo) {
    case 'baixar_cobranca':
      return 'Dar baixa'
    case 'confirmar_pedido':
      return 'Confirmar'
    case 'aprovar_membro':
      return 'Aprovar'
    case 'checkin_rsvp':
      return a.override ? 'Embarcar (override)' : 'Embarcar'
    default:
      return 'Executar'
  }
}

async function runAcao(item: AdminInboxItem): Promise<string | null> {
  const a = item.acao
  if (!a) return null
  if (a.tipo === 'baixar_cobranca') {
    const r = await inboxBaixarCobranca(a.cobrancaId)
    return r.error ?? null
  }
  if (a.tipo === 'confirmar_pedido') {
    const r = await inboxConfirmarPedido(a.pedidoId)
    return r.error ?? null
  }
  if (a.tipo === 'aprovar_membro') {
    const r = await inboxAprovarMembro(a.membroId)
    return r.error ?? null
  }
  if (a.tipo === 'checkin_rsvp') {
    const r = await inboxCheckInRsvp(a.eventoId, a.userId, Boolean(a.override))
    return r.error ?? null
  }
  return null
}

function InboxRow({
  item,
  podeAgir,
}: {
  item: AdminInboxItem
  podeAgir: boolean
}) {
  const [pending, start] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)
  const temAcao = Boolean(item.acao) && podeAgir && !feito

  return (
    <li className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle
          className={
            item.tom === 'danger'
              ? 'mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-danger-fg))]'
              : 'mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-warning-fg))]'
          }
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <Link
            href={item.href}
            className="app-touch-line block text-sm font-medium text-[rgb(var(--foreground))] hover:underline"
          >
            {item.titulo}
          </Link>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">{item.detalhe}</p>
          {item.sla ? (
            <p className="mt-1 text-[11px] font-medium tabular-nums text-[rgb(var(--color-warning-fg))]">
              {item.sla}
            </p>
          ) : null}
          {erro ? (
            <p className="mt-1 text-xs text-[rgb(var(--color-danger-fg))]" role="alert">
              {erro}
            </p>
          ) : null}
          {feito ? (
            <p className="mt-1 text-xs text-[rgb(var(--color-success-fg))]">Feito.</p>
          ) : null}
        </div>
        {temAcao ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setErro(null)
              start(async () => {
                const msg = await runAcao(item)
                if (msg) setErro(msg)
                else setFeito(true)
              })
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--primary-foreground))] disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {labelAcao(item)}
          </button>
        ) : null}
      </div>
    </li>
  )
}

export function AdminInboxList({
  itens,
  podeAgir = true,
  emptyTitle = 'Nada urgente.',
  emptyDescription,
}: {
  itens: AdminInboxItem[]
  podeAgir?: boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  if (itens.length === 0) {
    return (
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--color-success))] text-[rgb(var(--color-success-on))]">
          <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </span>
        <p className="mt-2 text-sm font-medium text-[rgb(var(--foreground))]">{emptyTitle}</p>
        {emptyDescription ? (
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">{emptyDescription}</p>
        ) : null}
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {itens.map((item) => (
        <InboxRow key={item.id} item={item} podeAgir={podeAgir} />
      ))}
    </ul>
  )
}
