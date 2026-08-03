import { db } from '@torcida/db'

/** Grava consulta ao arquivo (chamado só na página de detalhe — sob demanda). */
export async function auditarVisualizacaoTicketArquivo(input: {
  tenantId: string
  atorId: string
  ticketId: string
  pedidoId: string
  conversaId: string
  status: string
}): Promise<void> {
  await db.auditLog.create({
    data: {
      tenantId: input.tenantId,
      atorId: input.atorId,
      acao: 'PEDIDO_TICKET_HISTORICO_VISUALIZADO',
      entidade: 'SaasPedidoTicket',
      entidadeId: input.ticketId,
      detalhes: {
        pedidoId: input.pedidoId,
        conversaId: input.conversaId,
        status: input.status,
      },
    },
  })
}
