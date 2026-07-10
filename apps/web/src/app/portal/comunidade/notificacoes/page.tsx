import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { listarNotificacoesSociais } from '@/lib/notificacoes-comunidade'
import { NotificacoesComunidadeClient } from './notificacoes-client'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notificações — Comunidade' }

export default async function NotificacoesComunidadePage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const notificacoes = await listarNotificacoesSociais(tenant.id, session.user.id)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/portal/comunidade"
        className="text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao feed
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Notificações</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Menções, reposts, reações e atualizações da sua rede.
        </p>
      </div>
      <NotificacoesComunidadeClient inicial={notificacoes} />
    </div>
  )
}
