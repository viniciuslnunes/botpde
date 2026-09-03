'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Clock,
  Inbox,
  MessageSquare,
  Package,
  Tag,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { Badge } from '@torcida/ui'
import { STATUS_PEDIDO_TICKET } from '@torcida/types'
import { atenderTicketPedido, fecharTicketPedido } from '@/app/admin/loja/actions'
import { AdminRowActions, type AdminRowActionItem } from '@/components/admin/ui'
import type { TicketKanbanBoardUi, TicketKanbanCardUi } from '@/lib/loja-ticket-kanban'

type ColunaId = 'abertos' | 'atendendo' | 'fechados'

const COLUNAS: Array<{
  id: ColunaId
  chave: keyof TicketKanbanBoardUi
  status: 'ABERTO' | 'ATENDENDO' | 'FECHADO'
  titulo: string
  descricaoVazia: string
  icone: typeof Inbox
}> = [
  {
    id: 'abertos',
    chave: 'abertos',
    status: 'ABERTO',
    titulo: 'Na fila',
    descricaoVazia: 'Nenhum ticket aguardando atendimento.',
    icone: Inbox,
  },
  {
    id: 'atendendo',
    chave: 'atendendo',
    status: 'ATENDENDO',
    titulo: 'Em atendimento',
    descricaoVazia: 'Nenhum ticket assumido no momento.',
    icone: UserCheck,
  },
  {
    id: 'fechados',
    chave: 'fechados',
    status: 'FECHADO',
    titulo: 'Concluídos',
    descricaoVazia: 'Tickets fechados aparecem aqui.',
    icone: Package,
  },
]

const TOM_VARIANT = {
  warning: 'warning',
  info: 'info',
  neutral: 'neutral',
} as const

export function LojaTicketKanban({
  board,
  podeGerir,
  compacto = false,
  somenteAtivos = false,
  modoResumo = false,
  sectionId,
  arquivoHref,
  arquivoRotulo = 'Ver arquivo completo',
  mostrarCabecalho = true,
}: {
  board: TicketKanbanBoardUi
  podeGerir: boolean
  compacto?: boolean
  /** Oculta coluna Concluídos — preview no painel do departamento. */
  somenteAtivos?: boolean
  /** Grade compacta de tickets ativos — topo do painel do departamento. */
  modoResumo?: boolean
  /** Âncora de scroll (`#atendimento` no painel do departamento). */
  sectionId?: string
  arquivoHref?: string
  arquivoRotulo?: string
  /** Oculta título quando a aba do módulo já nomeia a tela. */
  mostrarCabecalho?: boolean
}) {
  const totalAbertos = board.abertos.length + board.atendendo.length
  const ticketsAtivos = [...board.abertos, ...board.atendendo]
  const colunas = somenteAtivos ? COLUNAS.filter((c) => c.id !== 'fechados') : COLUNAS
  const gradeColunas =
    colunas.length === 2
      ? compacto
        ? 'min-[520px]:grid-cols-2'
        : 'md:grid-cols-2'
      : compacto
        ? 'min-[520px]:grid-cols-3'
        : 'md:grid-cols-3'

  if (modoResumo) {
    return (
      <section
        id={sectionId}
        className={[
          sectionId ? 'scroll-mt-28' : '',
          'rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4',
        ].join(' ')}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Fila de atendimento
            </h2>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              {totalAbertos === 0
                ? 'Nenhum ticket aberto no momento.'
                : `${totalAbertos} ticket${totalAbertos === 1 ? '' : 's'} em aberto ou em atendimento.`}
            </p>
          </div>
          {arquivoHref ? (
            <Link
              href={arquivoHref}
              prefetch={false}
              className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              {arquivoRotulo}
            </Link>
          ) : null}
        </div>

        {ticketsAtivos.length === 0 ? (
          <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
            Quando um sócio abrir um ticket na loja, ele aparece aqui para a equipe assumir.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {ticketsAtivos.map((ticket) => (
              <li key={ticket.id}>
                <LojaTicketKanbanCard ticket={ticket} podeGerir={podeGerir} compacto />
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <section
      id={sectionId}
      className={[
        sectionId ? 'scroll-mt-28' : '',
        mostrarCabecalho
          ? 'rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]'
          : '',
        mostrarCabecalho ? (compacto ? 'p-4' : 'p-5') : '',
      ].join(' ')}
    >
      {mostrarCabecalho ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Fila de atendimento
            </h2>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              {totalAbertos === 0
                ? 'Nenhum ticket aberto no momento.'
                : `${totalAbertos} ticket${totalAbertos === 1 ? '' : 's'} em aberto ou em atendimento.`}
            </p>
          </div>
          {arquivoHref ? (
            <Link
              href={arquivoHref}
              prefetch={false}
              className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              {arquivoRotulo}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div
        className={[
          'grid grid-cols-1 gap-3',
          gradeColunas,
          mostrarCabecalho ? 'mt-4' : '',
        ].join(' ')}
      >
        {colunas.map((coluna) => {
          const tickets = board[coluna.chave]
          const info = STATUS_PEDIDO_TICKET[coluna.status]
          const Icone = coluna.icone
          return (
            <div
              key={coluna.id}
              className={[
                'flex min-w-0 flex-col rounded-xl border border-[rgb(var(--border))]',
                'bg-[rgb(var(--background-subtle)_/_0.45)]',
                tickets.length > 0
                  ? compacto
                    ? 'min-h-[12rem]'
                    : 'min-h-[16rem]'
                  : '',
              ].join(' ')}
            >
              <header className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Icone className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                  <span className="truncate text-xs font-semibold text-[rgb(var(--foreground))]">
                    {coluna.titulo}
                  </span>
                </div>
                <Badge variant={TOM_VARIANT[info.tom] ?? 'neutral'} className="tabular-nums">
                  {tickets.length}
                </Badge>
              </header>

              <ul className="app-scrollbar-fina flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                {tickets.length === 0 ? (
                  <li className="flex flex-1 items-center justify-center px-2 py-6 text-center">
                    <p className="text-[11px] leading-relaxed text-[rgb(var(--foreground-muted))]">
                      {coluna.descricaoVazia}
                    </p>
                  </li>
                ) : (
                  tickets.map((ticket) => (
                    <li key={ticket.id}>
                      <LojaTicketKanbanCard
                        ticket={ticket}
                        podeGerir={podeGerir}
                        compacto={compacto}
                      />
                    </li>
                  ))
                )}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function LojaTicketKanbanCard({
  ticket,
  podeGerir,
  compacto,
}: {
  ticket: TicketKanbanCardUi
  podeGerir: boolean
  compacto: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const info = STATUS_PEDIDO_TICKET[ticket.status]
  const variant = TOM_VARIANT[info.tom] ?? 'neutral'

  function irAoChat() {
    window.open(`/portal/mensagens?c=${ticket.conversaId}`, '_blank', 'noopener,noreferrer')
  }

  function atender() {
    setErro(null)
    startTransition(async () => {
      const r = await atenderTicketPedido(ticket.id)
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
      const r = await fecharTicketPedido(ticket.id)
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

  const dataLabel =
    ticket.status === 'FECHADO'
      ? ticket.fechadoEmLabel
      : ticket.status === 'ATENDENDO'
        ? ticket.atendidoEmLabel
        : ticket.abertoEmLabel

  return (
    <article
      className={[
        'rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm',
        compacto ? 'p-2.5' : 'p-3',
        ticket.aguardaConfirmacao && ticket.status !== 'FECHADO'
          ? 'border-[rgb(var(--color-warning)_/_0.45)]'
          : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[rgb(var(--foreground))]">
            Pedido {ticket.idCurto}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-[rgb(var(--foreground-muted))]">
            {ticket.clienteNome}
          </p>
        </div>
        <AdminRowActions ariaLabel={`Ações do ticket ${ticket.idCurto}`} items={items} />
      </div>

      {ticket.aguardaConfirmacao && ticket.status !== 'FECHADO' ? (
        <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[rgb(var(--color-warning-fg))]">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
          Aguardando confirmação do pedido
        </p>
      ) : null}

      <p className="mt-2 line-clamp-2 text-[11px] text-[rgb(var(--foreground))]">
        {ticket.itensResumo}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant={variant} className="text-[10px]">
          {info.label}
        </Badge>
        <Badge
          variant={ticket.pedidoStatus === 'PENDENTE' ? 'warning' : 'neutral'}
          className="text-[10px]"
        >
          {ticket.pedidoStatusLabel}
        </Badge>
        <span className="text-[10px] font-medium tabular-nums text-[rgb(var(--foreground))]">
          {ticket.totalLabel}
        </span>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[rgb(var(--foreground-muted))]">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          {ticket.modalidadeLabel}
          {dataLabel ? ` · ${dataLabel}` : ''}
        </span>
        {ticket.slaLabel ? (
          <span className="font-medium tabular-nums text-[rgb(var(--color-primary-fg))]">
            {ticket.slaLabel}
          </span>
        ) : null}
      </p>

      {ticket.cupomCodigo ? (
        <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-[rgb(var(--foreground-muted))]">
          <Tag className="h-3 w-3 shrink-0" aria-hidden />
          Cupom {ticket.cupomCodigo}
        </p>
      ) : null}

      {ticket.atendenteNome && ticket.status !== 'ABERTO' ? (
        <p className="mt-1 truncate text-[10px] text-[rgb(var(--foreground-muted))]">
          Atendente: {ticket.atendenteNome}
        </p>
      ) : null}

      {ticket.motivoFechoLabel && ticket.status === 'FECHADO' ? (
        <p className="mt-1 truncate text-[10px] text-[rgb(var(--foreground-muted))]">
          {ticket.motivoFechoLabel}
        </p>
      ) : null}

      {erro ? <p className="mt-1.5 text-[10px] text-red-600">{erro}</p> : null}
    </article>
  )
}

export function LojaTicketKanbanSkeleton({
  compacto = false,
  somenteAtivos = false,
  modoResumo = false,
  mostrarCabecalho = true,
}: {
  compacto?: boolean
  somenteAtivos?: boolean
  modoResumo?: boolean
  mostrarCabecalho?: boolean
}) {
  if (modoResumo) {
    return (
      <div className="animate-pulse scroll-mt-28 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <div className="h-4 w-40 rounded bg-[rgb(var(--border))]" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="h-28 rounded-lg bg-[rgb(var(--border)_/_0.5)]" />
          <div className="h-28 rounded-lg bg-[rgb(var(--border)_/_0.5)]" />
        </div>
      </div>
    )
  }

  const colunas = somenteAtivos ? 2 : 3
  const gradeColunas =
    colunas === 2
      ? compacto
        ? 'min-[520px]:grid-cols-2'
        : 'md:grid-cols-2'
      : compacto
        ? 'min-[520px]:grid-cols-3'
        : 'md:grid-cols-3'

  return (
    <div
      className={[
        'animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
        mostrarCabecalho ? (compacto ? 'p-4' : 'p-5') : 'border-0 bg-transparent p-0',
        compacto ? (somenteAtivos ? 'min-h-48' : 'min-h-64') : 'min-h-80',
      ].join(' ')}
    >
      {mostrarCabecalho ? <div className="h-4 w-40 rounded bg-[rgb(var(--border))]" /> : null}
      <div
        className={['grid grid-cols-1 gap-3', gradeColunas, mostrarCabecalho ? 'mt-4' : ''].join(
          ' ',
        )}
      >
        {Array.from({ length: colunas }, (_, i) => (
          <div key={i} className="h-48 rounded-xl bg-[rgb(var(--border)_/_0.5)]" />
        ))}
      </div>
    </div>
  )
}
