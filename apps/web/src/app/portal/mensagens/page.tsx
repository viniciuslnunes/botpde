import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { MensagensShell } from '@/components/portal/mensagens-shell'

export const metadata: Metadata = { title: 'Mensagens' }

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Mensagens</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Conversas diretas e grupos com membros da torcida e aliadas
        </p>
      </div>

      <MensagensShell
        initialConversas={[]}
        initialSelecionadaId={params.c ?? null}
        currentUserId={session.user.id}
      />
    </div>
  )
}
