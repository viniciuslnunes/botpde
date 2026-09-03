import { listarKanbanTickets } from '@/lib/loja-ticket'
import { serializarKanbanTickets } from '@/lib/loja-ticket-kanban'
import { LojaTicketKanban } from './loja-ticket-kanban'

export async function LojaTicketKanbanSection({
  tenantId,
  podeGerir,
  compacto = false,
  somenteAtivos = false,
  modoResumo = false,
  sectionId,
  arquivoHref = '/admin/loja/atendimento?v=arquivo',
  arquivoRotulo = 'Ver arquivo completo',
  fechadosTake = 15,
  mostrarCabecalho = true,
}: {
  tenantId: string
  podeGerir: boolean
  compacto?: boolean
  /** Painel do departamento: só Na fila + Em atendimento (sem Concluídos). */
  somenteAtivos?: boolean
  /** Cards em grade no painel do departamento — sem colunas de kanban. */
  modoResumo?: boolean
  sectionId?: string
  arquivoHref?: string
  arquivoRotulo?: string
  fechadosTake?: number
  mostrarCabecalho?: boolean
}) {
  const kanban = await listarKanbanTickets(tenantId, {
    fechadosTake: somenteAtivos || modoResumo ? 0 : fechadosTake,
  })
  const board = serializarKanbanTickets(kanban)

  return (
    <LojaTicketKanban
      board={board}
      podeGerir={podeGerir}
      compacto={compacto}
      somenteAtivos={somenteAtivos}
      modoResumo={modoResumo}
      sectionId={sectionId}
      arquivoHref={arquivoHref}
      arquivoRotulo={arquivoRotulo}
      mostrarCabecalho={mostrarCabecalho}
    />
  )
}
