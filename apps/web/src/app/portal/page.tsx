import { redirect } from 'next/navigation'

/** Início do portal foi descontinuado — landing pós-auth é Comunidade. */
export default function PortalHomePage() {
  redirect('/portal/comunidade')
}
