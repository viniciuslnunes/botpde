import { redirect } from 'next/navigation'

/** Rotas legadas → hub Agenda unificado. */
export default function PortalCaravanasRedirect() {
  redirect('/portal/eventos?tipo=CARAVANA')
}
