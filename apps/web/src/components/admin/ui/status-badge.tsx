import { Badge, type BadgeVariant } from '@torcida/ui'
import { STATUS_COBRANCA_LABEL, STATUS_PATRIMONIO_LABEL } from '@torcida/types'

export type StatusBadgeDominio = 'membro' | 'cobranca' | 'pedido' | 'rsvp' | 'patrimonio'

type MapaStatus = Record<string, { label: string; variant: BadgeVariant }>

const MEMBRO: MapaStatus = {
  PENDENTE: { label: 'Pendente', variant: 'warning' },
  APROVADO: { label: 'Aprovado', variant: 'success' },
  REPROVADO: { label: 'Reprovado', variant: 'danger' },
}

const COBRANCA: MapaStatus = {
  PENDENTE: { label: STATUS_COBRANCA_LABEL.PENDENTE, variant: 'warning' },
  PAGA: { label: STATUS_COBRANCA_LABEL.PAGA, variant: 'success' },
  CANCELADA: { label: STATUS_COBRANCA_LABEL.CANCELADA, variant: 'neutral' },
  VENCIDA: { label: STATUS_COBRANCA_LABEL.VENCIDA, variant: 'danger' },
}

const PEDIDO: MapaStatus = {
  PENDENTE: { label: 'Pendente', variant: 'warning' },
  CONFIRMADO: { label: 'Confirmado', variant: 'info' },
  ENTREGUE: { label: 'Entregue', variant: 'success' },
  CANCELADO: { label: 'Cancelado', variant: 'danger' },
}

const RSVP: MapaStatus = {
  CONFIRMADO: { label: 'Confirmado', variant: 'success' },
  RECUSADO: { label: 'Recusado', variant: 'danger' },
  LISTA_ESPERA: { label: 'Lista de espera', variant: 'warning' },
}

const PATRIMONIO: MapaStatus = {
  DISPONIVEL: { label: STATUS_PATRIMONIO_LABEL.DISPONIVEL, variant: 'success' },
  EM_USO: { label: STATUS_PATRIMONIO_LABEL.EM_USO, variant: 'info' },
  MANUTENCAO: { label: STATUS_PATRIMONIO_LABEL.MANUTENCAO, variant: 'warning' },
  BAIXADO: { label: STATUS_PATRIMONIO_LABEL.BAIXADO, variant: 'neutral' },
}

const MAPAS: Record<StatusBadgeDominio, MapaStatus> = {
  membro: MEMBRO,
  cobranca: COBRANCA,
  pedido: PEDIDO,
  rsvp: RSVP,
  patrimonio: PATRIMONIO,
}

export interface StatusBadgeProps {
  dominio: StatusBadgeDominio
  status: string
  className?: string
}

/** Badge de status por domínio — labels/variantes centralizados sobre `Badge` de @torcida/ui. */
export function StatusBadge({ dominio, status, className }: StatusBadgeProps) {
  const item = MAPAS[dominio][status]
  return (
    <Badge variant={item?.variant ?? 'neutral'} className={className}>
      {item?.label ?? status}
    </Badge>
  )
}
