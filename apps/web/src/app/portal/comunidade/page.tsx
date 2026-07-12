import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { checarPodePublicarNoFeed } from '@/lib/authz'
import { getActiveTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { db } from '@torcida/db'
import { ComunidadeFeedShell } from './_components/comunidade-feed-shell'
import { ComunidadeSalasAside } from './_components/comunidade-salas-aside'
import { getOrCreatePerfilMembro } from '@/lib/social'
import { getEventosParaComposer, type EventoComposerItem } from '@/lib/eventos'
import { getResumoBadgesComunidade } from '@/lib/notificacoes-comunidade'

const ComunidadeChatPanel = dynamic(
  () =>
    import('@/components/portal/comunidade-chat-panel').then((mod) => mod.ComunidadeChatPanel),
  {
    loading: () => (
      <div className="h-56 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
    ),
  },
)

export const metadata: Metadata = { title: 'Comunidade' }

function SalasFallback() {
  return <div className="h-40 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
}

export default async function ComunidadePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant) redirect('/')

  const currentUser = {
    id: session?.user?.id ?? '',
    nome: session?.user?.name ?? null,
    avatarUrl: session?.user?.image ?? null,
  }

  let perfilPrivado = true
  let eventosComposer: EventoComposerItem[] = []
  let navBadges = { notificacoesNaoLidas: 0, solicitacoesPendentes: 0 }
  let bloqueioPublicacao: string | null = null
  let somentePublico = false
  if (session?.user?.id != null) {
    const [perfil, eventos, badges, bloqueio, membro] = await Promise.all([
      getOrCreatePerfilMembro(session.user.id, tenant.id),
      getEventosParaComposer(tenant.id, session.user.id),
      getResumoBadgesComunidade(tenant.id, session.user.id),
      checarPodePublicarNoFeed(session.user.id, tenant.id),
      db.saasMembro.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
        select: { status: true },
      }),
    ])
    perfilPrivado = perfil.perfilPrivado
    eventosComposer = eventos
    navBadges = badges
    bloqueioPublicacao = bloqueio
    somentePublico = bloqueio === null && membro?.status !== 'APROVADO'
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
      <ComunidadeFeedShell
        tenant={{ id: tenant.id, nome: tenant.nome, afiliacaoId: tenant.afiliacaoId }}
        currentUser={currentUser}
        cursor={params.cursor}
        perfilPrivado={perfilPrivado}
        eventosComposer={eventosComposer}
        navBadges={navBadges}
        bloqueioPublicacao={bloqueioPublicacao}
        somentePublico={somentePublico}
      />

      <aside className="hidden xl:block">
        <div className="sticky top-20 space-y-4">
          <Suspense fallback={<SalasFallback />}>
            <ComunidadeSalasAside tenantId={tenant.id} />
          </Suspense>
          {currentUser.id && <ComunidadeChatPanel currentUserId={currentUser.id} />}
        </div>
      </aside>
    </div>
  )
}
