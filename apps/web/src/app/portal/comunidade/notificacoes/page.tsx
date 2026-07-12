import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { listarNotificacoesSociais } from '@/lib/notificacoes-comunidade'
import { NotificacoesComunidadeClient } from './notificacoes-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notificações — Comunidade' }

export default async function NotificacoesComunidadePage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const notificacoes = await listarNotificacoesSociais(tenant.id, session.user.id)

  return (
    <div className="space-y-5">
      <ComunidadePageHeader
        icon={Bell}
        titulo="Notificações"
        subtitulo="Menções, reposts, reações e atualizações da sua rede."
      />
      <NotificacoesComunidadeClient inicial={notificacoes} />
    </div>
  )
}
