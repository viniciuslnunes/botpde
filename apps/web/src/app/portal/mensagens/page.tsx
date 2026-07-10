import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { listConversas, type ConversaInboxItem } from '@/lib/mensageria'
import { MensagensShell } from '@/components/portal/mensagens-shell'
import type { InboxItemDto } from '@/lib/mensageria-client'

export const metadata: Metadata = { title: 'Mensagens' }

function toDto(item: ConversaInboxItem): InboxItemDto {
  return {
    ...item,
    atualizadoEm: item.atualizadoEm.toISOString(),
    ultimaMensagem: item.ultimaMensagem
      ? { ...item.ultimaMensagem, criadoEm: item.ultimaMensagem.criadoEm.toISOString() }
      : null,
  }
}

export default async function MensagensPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const [params, session, tenant] = await Promise.all([
    searchParams,
    auth(),
    getTenantFromHost(),
  ])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  // Best-effort: se a migração da mensageria ainda não rodou neste banco,
  // a página abre vazia em vez de derrubar o portal.
  let conversas: ConversaInboxItem[] = []
  try {
    conversas = await listConversas(session.user.id)
  } catch {
    conversas = []
  }

  const dtos = conversas.map(toDto)
  const selecionada = params.c && dtos.some((c) => c.id === params.c) ? params.c : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Mensagens</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Conversas diretas e grupos com membros da torcida e aliadas
        </p>
      </div>

      <MensagensShell
        initialConversas={dtos}
        initialSelecionadaId={selecionada}
        currentUserId={session.user.id}
      />
    </div>
  )
}
