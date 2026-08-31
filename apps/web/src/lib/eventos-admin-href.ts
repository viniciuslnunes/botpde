/**
 * Href operacional do evento: um link só, o hub que de fato opera aquele tipo.
 * Sem isso, RSVP/dia-gestor sempre acendiam Agenda — e Caravanas/Bateria
 * ficavam mudos mesmo sendo a tela onde o gestor age.
 *
 * Carnaval vence o tipo cru (ensaio de ala ainda é carnaval).
 */

export type EventoAdminHrefFonte = {
  id: string
  tipo: string
  departamentoSlug?: string | null
}

const SLUG_CARNAVAL = 'carnaval'
const SLUG_CARAVANAS = 'caravanas'
const SLUG_BATERIA = 'bateria'
const SLUG_SOCIAL = 'social-e-eventos'
const SLUG_FEMININO = 'feminino'

export function slugDepartamentoDoEvento(evento: {
  projeto?: { departamento?: { slug: string } | null } | null
}): string | null {
  return evento.projeto?.departamento?.slug ?? null
}

export function hrefAdminEvento(fonte: EventoAdminHrefFonte): string {
  const slug = fonte.departamentoSlug ?? ''
  if (slug === SLUG_CARNAVAL) return `/admin/carnaval/${fonte.id}`
  if (fonte.tipo === 'CARAVANA' || slug === SLUG_CARAVANAS) {
    return `/admin/caravanas/${fonte.id}`
  }
  if (fonte.tipo === 'ENSAIO' || slug === SLUG_BATERIA) {
    return `/admin/bateria/${fonte.id}`
  }
  if (slug === SLUG_SOCIAL) return `/admin/social/${fonte.id}`
  if (slug === SLUG_FEMININO) return `/admin/feminino/${fonte.id}`
  return `/admin/eventos/${fonte.id}`
}

/** Todos os destinos possíveis — reconcilia RSVP/lembrete ao cancelar, independente do hub. */
export function linksEventoParaReconciliar(eventoId: string): string[] {
  return [
    `/portal/eventos/${eventoId}`,
    `/admin/eventos/${eventoId}`,
    `/admin/caravanas/${eventoId}`,
    `/admin/bateria/${eventoId}`,
    `/admin/social/${eventoId}`,
    `/admin/feminino/${eventoId}`,
    `/admin/carnaval/${eventoId}`,
  ]
}
