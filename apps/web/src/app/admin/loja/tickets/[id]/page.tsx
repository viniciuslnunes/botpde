import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { Badge } from '@torcida/ui'
import {
  idCurtoPedido,
  MOTIVO_FECHO_PEDIDO_TICKET,
  STATUS_PEDIDO_TICKET,
  formatarMoedaBRL,
  PERMISSIONS,
  calculateEffectivePermissions,
  hasPermission,
} from '@torcida/types'
import { assertStoreView } from '@/lib/authz'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { carregarMensagensDoTicket } from '@/lib/loja-ticket'
import { auditarVisualizacaoTicketArquivo } from '@/lib/loja-ticket-arquivo'
import { AdminPedidoTicketActions } from '@/app/admin/loja/pedidos/admin-pedido-ticket-actions'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Conversa do ticket — Loja Admin' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

export default async function AdminLojaTicketDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  let tenant: Awaited<ReturnType<typeof assertStoreView>>['tenant']
  let session: Awaited<ReturnType<typeof assertStoreView>>['session']
  try {
    ;({ tenant, session } = await assertStoreView())
  } catch {
    redirect('/admin')
  }

  const { id } = await params
  const loaded = await carregarMensagensDoTicket(id, tenant.id)
  if (!loaded) notFound()

  // Auditoria da consulta ao arquivo (mensagens só aqui, sob demanda).
  if (session.user?.id) {
    await auditarVisualizacaoTicketArquivo({
      tenantId: tenant.id,
      atorId: session.user.id,
      ticketId: loaded.ticket.id,
      pedidoId: loaded.ticket.pedidoId,
      conversaId: loaded.ticket.conversaId,
      status: loaded.ticket.status,
    })
  }

  const { ticket, mensagens } = loaded
  const statusInfo = STATUS_PEDIDO_TICKET[ticket.status]
  const modalidade = ticket.pedido.modalidadeEntrega === 'ENVIO' ? 'Envio' : 'Retirada'

  let podeGerir = false
  if (isSuperAdminEmail(session.user?.email)) {
    podeGerir = true
  } else if (session.user?.id) {
    const { rolePermissions, overrides } = await getUserPermissionsInTenant(
      session.user.id,
      tenant.id,
    )
    const efetivas = calculateEffectivePermissions(rolePermissions, overrides)
    podeGerir = hasPermission(efetivas, PERMISSIONS.STORE_MANAGE)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/loja/atendimento?v=arquivo"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[rgb(var(--foreground-muted))] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao arquivo
          </Link>
          <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">
            Pedido {idCurtoPedido(ticket.pedidoId)} · {modalidade}
          </h2>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            {ticket.pedido.user.nome ?? ticket.pedido.user.email ?? 'Cliente'} ·{' '}
            {formatarMoedaBRL(Number(ticket.pedido.total))} · pedido{' '}
            {ticket.pedido.status.toLowerCase()}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge
            variant={
              statusInfo.tom === 'warning'
                ? 'warning'
                : statusInfo.tom === 'info'
                  ? 'info'
                  : 'neutral'
            }
          >
            {statusInfo.label}
          </Badge>
          <AdminPedidoTicketActions
            ticket={{
              id: ticket.id,
              status: ticket.status,
              conversaId: ticket.conversaId,
              atendenteNome: ticket.atendente?.nome ?? null,
            }}
            podeGerir={podeGerir}
          />
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-xs text-[rgb(var(--foreground-muted))]">
        <p>
          Aberto {formatarData(ticket.abertoEm)}
          {ticket.atendidoEm ? ` · Atendido ${formatarData(ticket.atendidoEm)}` : ''}
          {ticket.fechadoEm ? ` · Fechado ${formatarData(ticket.fechadoEm)}` : ''}
        </p>
        {ticket.motivoFecho && (
          <p className="mt-1">{MOTIVO_FECHO_PEDIDO_TICKET[ticket.motivoFecho]}</p>
        )}
        <p className="mt-1">
          Itens:{' '}
          {ticket.pedido.itens
            .map(
              (i) =>
                `${i.produtoNome}${i.tamanho ? ` (${i.tamanho})` : ''} ×${i.quantidade}`,
            )
            .join(', ')}
        </p>
        <Link
          href={`/portal/mensagens?c=${ticket.conversaId}`}
          className="mt-2 inline-flex items-center gap-1 font-medium text-[rgb(var(--primary))] hover:underline"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Abrir no portal de mensagens
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
        <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Conversa ({mensagens.length} mensagem{mensagens.length === 1 ? '' : 'ns'})
        </div>
        {mensagens.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma mensagem registrada nesta conversa.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border))]">
            {mensagens.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">
                    {m.autor.nome ?? 'Usuário'}
                  </p>
                  <time className="shrink-0 text-[11px] text-[rgb(var(--foreground-muted))]">
                    {formatarData(m.criadoEm)}
                  </time>
                </div>
                {m.removidaEm ? (
                  <p className="mt-1 text-sm italic text-[rgb(var(--foreground-muted))]">
                    Mensagem removida
                  </p>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                    {m.conteudo}
                  </p>
                )}
                {m.midiaUrls.length > 0 && !m.removidaEm && (
                  <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                    {m.midiaUrls.length} anexo{m.midiaUrls.length === 1 ? '' : 's'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
