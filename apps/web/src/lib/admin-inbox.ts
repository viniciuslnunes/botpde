/**
 * Contrato compartilhado da inbox de comando admin (Onda 5).
 * Pendência = decisão; ação opcional dispara Server Action inline.
 */

export type AdminInboxTom = 'danger' | 'warning' | 'default'

export type AdminInboxAcao =
  | { tipo: 'baixar_cobranca'; cobrancaId: string; label?: string }
  | { tipo: 'confirmar_pedido'; pedidoId: string; label?: string }
  | { tipo: 'aprovar_membro'; membroId: string; label?: string }
  | {
      tipo: 'checkin_rsvp'
      eventoId: string
      userId: string
      override?: boolean
      label?: string
    }

export type AdminInboxItem = {
  id: string
  titulo: string
  detalhe: string
  href: string
  tom: AdminInboxTom
  /** SLA legível (ex.: "D+12", "em 3h") — opcional. */
  sla?: string | null
  acao?: AdminInboxAcao | null
}

/** Item de lista thin Agenda — mesmo shape de AdminEventoItem (serializável). */
export type AdminEventoListaItem = {
  id: string
  titulo: string
  descricao: string | null
  dataLabel: string
  local: string | null
  fotoUrl?: string | null
  confirmados: number
  capacidade?: number | null
  passado: boolean
  tipo: string
  serieId?: string | null
  lotacaoLabel?: string | null
  embarcados?: number | null
  diasLabel?: string | null
}

export function formatarDataEventoAdmin(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

/**
 * Rótulo de SLA legível para cards da inbox.
 * - `idade` (passado): "agora" | "há Xh" | "hoje" | "D+N"
 * - `ate` (futuro): "agora" | "em Xh" | "em Nd"
 * - `auto`: futuro se alvo > agora; senão idade.
 */
export function slaLabel(
  alvo: Date | number,
  opts?: {
    agora?: Date | number
    modo?: 'idade' | 'ate' | 'auto'
  },
): string {
  const agoraMs =
    opts?.agora == null
      ? Date.now()
      : typeof opts.agora === 'number'
        ? opts.agora
        : opts.agora.getTime()
  const alvoMs = typeof alvo === 'number' ? alvo : new Date(alvo).getTime()
  if (!Number.isFinite(alvoMs) || !Number.isFinite(agoraMs)) return '—'

  const diff = alvoMs - agoraMs
  const modo = opts?.modo ?? 'auto'
  const futuro = modo === 'ate' || (modo === 'auto' && diff > 0)

  if (futuro) {
    if (diff <= 0) return 'agora'
    const horas = diff / HORA_MS
    if (horas < 24) return `em ${Math.max(1, Math.round(horas))}h`
    const dias = Math.floor(diff / DIA_MS)
    return dias <= 0 ? 'hoje' : `em ${dias}d`
  }

  const atras = Math.max(0, -diff)
  const horas = atras / HORA_MS
  if (horas < 1) return 'agora'
  if (horas < 24) return `há ${Math.max(1, Math.round(horas))}h`
  const dias = Math.floor(atras / DIA_MS)
  return dias <= 0 ? 'hoje' : `D+${dias}`
}
