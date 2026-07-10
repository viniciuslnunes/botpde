import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { ComunidadeFeedSection } from './_components/comunidade-feed-section'
import { ComunidadeSalasAside } from './_components/comunidade-salas-aside'

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

function FeedFallback() {
  return (
    <>
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          <div className="h-20 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
          <div className="h-32 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
        </div>
      </aside>
      <main className="min-w-0 space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
        ))}
      </main>
    </>
  )
}

function SalasFallback() {
  return <div className="h-40 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
}

export default async function ComunidadePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const params = await searchParams
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')

  const currentUser = {
    id: session?.user?.id ?? '',
    nome: session?.user?.name ?? null,
    avatarUrl: session?.user?.image ?? null,
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
      <Suspense fallback={<FeedFallback />}>
        <ComunidadeFeedSection
          tenant={{ id: tenant.id, nome: tenant.nome, afiliacaoId: tenant.afiliacaoId }}
          currentUser={currentUser}
          cursor={params.cursor}
        />
      </Suspense>

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
