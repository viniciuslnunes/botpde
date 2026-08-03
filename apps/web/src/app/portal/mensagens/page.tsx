import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { listConversas, serializeConversasInbox } from '@/lib/mensageria'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { MensagensShell } from '@/components/portal/mensagens-shell'
import { staffPodeLerTicketConversa } from '@/lib/loja-ticket'
import type { InboxItemDto } from '@/lib/mensageria-client'

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
    const pode = await staffPodeLerTicketConversa(selecionadaId, session.user.id)
    if (pode) {
      const conversa: {
        id: string
        tipo: 'DIRETA' | 'GRUPO' | 'CANAL'
        nome: string | null
        avatarUrl: string | null
        atualizadoEm: Date
        _count: { membros: number }
      } | null = await db.conversa.findUnique({
        where: { id: selecionadaId },
        select: {
          id: true,
          tipo: true,
          nome: true,
          avatarUrl: true,
          atualizadoEm: true,
          _count: { select: { membros: { where: { saiuEm: null } } } },
        },
      })
      if (conversa) {
        const sintetica: InboxItemDto = {
          id: conversa.id,
          tipo: conversa.tipo,
          nome: conversa.nome,
          avatarUrl: conversa.avatarUrl,
          atualizadoEm: conversa.atualizadoEm.toISOString(),
          meuPapel: 'MEMBRO',
          meuStatus: 'ATIVO',
          solicitacaoRecebida: false,
          aguardandoAprovacao: false,
          silenciada: false,
          totalMembros: conversa._count.membros,
          outroMembro: null,
          ultimaMensagem: null,
          naoLidas: 0,
        }
        conversas.unshift(sintetica)
      }
    }
  }

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
        initialSelecionadaId={selecionadaId}
        currentUserId={session.user.id}
      />
    </div>
  )
}
