import { redirect } from 'next/navigation'

/** Rotas legadas → hub Agenda unificado. */
export default function PortalBateriaRedirect() {
  redirect('/portal/eventos?tipo=ENSAIO')
}
