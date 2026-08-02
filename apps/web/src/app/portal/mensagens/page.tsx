import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listConversas, serializeConversasInbox } from '@/lib/mensageria'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { MensagensShell } from '@/components/portal/mensagens-shell'

export const metadata: Metadata = { title: 'Mensagens' }

export default async function MensagensPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const [params, session] = await Promise.all([searchParams, auth()])
  if (!session?.user?.id) redirect('/entrar')

  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) redirect('/portal')

  const conversas = serializeConversasInbox(await listConversas(session.user.id))
  const escopoNacional = ctx.modo === 'nacional' || !ctx.escopos.torcida

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))] sm:text-2xl">Mensagens</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          {escopoNacional
            ? 'Conversas diretas e grupos com torcedores do seu clube'
            : 'Conversas diretas e grupos com membros da torcida e aliadas'}
        </p>
      </div>

      <MensagensShell
        initialConversas={conversas}
        initialSelecionadaId={params.c ?? null}
        currentUserId={session.user.id}
      />
    </div>
  )
}
