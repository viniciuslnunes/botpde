import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { auth } from '@/lib/auth'
import { resolveTenantIdPortalComunidade } from '@/lib/comunidade-contexto'
import { listarNotificacoesSociais } from '@/lib/notificacoes-comunidade'
import { NotificacoesComunidadeClient } from './notificacoes-client'
import { ComunidadePageHeader } from '../_components/comunidade-page-header'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notificações — Comunidade' }

export default async function NotificacoesComunidadePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenantId = await resolveTenantIdPortalComunidade(session.user.id, session.user.email)
  if (!tenantId) redirect('/portal')

  const notificacoes = await listarNotificacoesSociais(tenantId, session.user.id)

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
