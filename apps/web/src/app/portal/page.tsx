import { redirect } from 'next/navigation'

/**
 * Alias legado de /portal — redireciona para a comunidade.
 */
export default function PortalPage() {
  redirect('/portal/comunidade')
}
