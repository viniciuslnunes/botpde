/**
 * Próxima ação do associado na Home — função pura, sem banco (testável).
 * Regra de produto (VIN-20): para membro APROVADO, a próxima ação natural é
 * o primeiro evento futuro em que ele ainda NÃO respondeu o RSVP ("Confirmar
 * presença"). Se já confirmou o mais próximo, a Home informa a presença
 * confirmada (reforço, não cobrança). Sem eventos futuros, não há ação.
 *
 * Membro não aprovado não recebe ação daqui — o hero já cobre cadastro
 * pendente/reprovado/inexistente com os avisos próprios.
 */

export interface EventoParaAcao {
  id: string
  titulo: string
  data: Date
}

export type ProximaAcao =
  | { tipo: 'CONFIRMAR_PRESENCA'; evento: EventoParaAcao }
  | { tipo: 'PRESENCA_CONFIRMADA'; evento: EventoParaAcao }
  | null

/**
 * @param eventos - próximos eventos visíveis, já ordenados por data asc
 * @param rsvpsPorEvento - status de RSVP do usuário por eventoId
 * @param membroAprovado - só membro aprovado recebe ação de evento
 */
export function resolverProximaAcao(
  eventos: EventoParaAcao[],
  rsvpsPorEvento: Map<string, 'CONFIRMADO' | 'RECUSADO'>,
  membroAprovado: boolean,
): ProximaAcao {
  if (!membroAprovado || eventos.length === 0) return null

  for (const evento of eventos) {
    const rsvp = rsvpsPorEvento.get(evento.id)
    if (!rsvp) return { tipo: 'CONFIRMAR_PRESENCA', evento }
    if (rsvp === 'CONFIRMADO') return { tipo: 'PRESENCA_CONFIRMADA', evento }
    // RECUSADO → sem cobrança; avalia o próximo evento da lista
  }
  return null
}
