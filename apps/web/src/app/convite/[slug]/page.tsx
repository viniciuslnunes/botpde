import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { usuarioPrecisaNickname } from '@/lib/tenant-context'
import { resolverConvite } from '@/lib/convite'

export const dynamic = 'force-dynamic'

/**
 * Porta de entrada do convite direto. Só LÊ e redireciona — nunca escreve no
 * banco (write-on-GET já causou órfãos neste repo).
 *
 * A ordem dos desvios é o que garante que nenhum dado essencial se perca no
 * atalho: sem sessão → login (social ou e-mail/senha); com sessão mas sem
 * apelido → `/definir-apelido`; só então o onboarding com as etapas de clube,
 * torcida e unidade já resolvidas pelo link.
 */
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const session = await auth()
  if (!session?.user?.id) {
    redirect(`/entrar?callbackUrl=${encodeURIComponent(`/convite/${slug}`)}`)
  }

  const convite = await resolverConvite(slug)
  if (!convite) {
    // Mantém o slug na URL do onboarding: se o resolve falhar por cache/dado
    // transitório, a página ainda tenta de novo em vez de abrir no Clube.
    redirect(`/onboarding?convite=${encodeURIComponent(slug)}`)
  }

  if (await usuarioPrecisaNickname(session.user.id)) {
    redirect(`/definir-apelido?callbackUrl=${encodeURIComponent(`/convite/${slug}`)}`)
  }

  redirect(`/onboarding?convite=${encodeURIComponent(slug)}`)
}
