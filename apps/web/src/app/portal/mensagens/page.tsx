import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listConversas, serializeConversasInbox } from '@/lib/mensageria'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { MensagensShell } from '@/components/portal/mensagens-shell'
import { montarInboxItemTicketStaff } from '@/lib/loja-ticket'
import { podeCriarGrupoInbox } from '@/lib/mensageria-api'

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
  const selecionadaId = params.c ?? null

  // Ticket de loja: staff com STORE_* pode abrir a thread sem ser membro da conversa.
  if (selecionadaId && !conversas.some((c) => c.id === selecionadaId)) {
    const sintetica = await montarInboxItemTicketStaff(selecionadaId, session.user.id)
    const brecho = sintetica
      ? null
      : await (await import('@/lib/brecho-ticket')).montarInboxItemBrechoStaff(
          selecionadaId,
          session.user.id,
        )
    if (sintetica) conversas.unshift(sintetica)
    else if (brecho) conversas.unshift(brecho)
  }

  const escopoNacional = ctx.modo === 'nacional' || !ctx.escopos.torcida
  const podeCriarGrupo = await podeCriarGrupoInbox(session.user.id, session.user.email)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="portal-display text-xl text-[rgb(var(--foreground))] sm:text-2xl">
          Mensagens
        </h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          {escopoNacional
            ? 'Conversas diretas e grupos com torcedores do seu clube'
            : 'Conversas diretas e grupos com membros da torcida e aliadas'}
        </p>
      </div>

      <MensagensShell
        initialConversas={conversas}
        initialSelecionadaId={selecionadaId}
        currentUserId={session.user.id}
        podeCriarGrupo={podeCriarGrupo}
      />
    </div>
  )
}
