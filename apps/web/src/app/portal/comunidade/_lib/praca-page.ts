import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { resolverContextoComunidade, resolverEscopoComunidade } from '@/lib/comunidade-contexto'
import { ancoraPraca, sufixoEscopoPraca } from '@/lib/praca'

export async function exigirContextoPraca(escopoParam?: string) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')
  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) redirect('/portal/comunidade')
  const escopo = resolverEscopoComunidade(ctx, escopoParam)
  const ancora = ancoraPraca(escopo, ctx)
  return {
    session,
    ctx,
    escopo,
    ancora,
    sufixo: sufixoEscopoPraca(escopo),
  }
}
