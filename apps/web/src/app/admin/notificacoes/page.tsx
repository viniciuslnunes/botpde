import type { Metadata } from 'next'
import { Bell } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { TipoNotificacao } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'
import { reconciliarPropostasAliancaPendentes } from '@/lib/notificacoes'
import { AdminMarcarTodasLidasButton } from '@/app/admin/notificacoes/admin-marcar-todas-lidas-button'
import { AdminNotificacaoLink } from '@/app/admin/notificacoes/admin-notificacao-link'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Notificações — Admin' }

type NotificacaoAdminRow = {
  id: string
  tipo: TipoNotificacao
  titulo: string
  corpo: string | null
  link: string | null
  lida: boolean
  criadoEm: Date
}

export default async function AdminNotificacoesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  await reconciliarPropostasAliancaPendentes(tenant.id)

  const notificacoes: NotificacaoAdminRow[] = await db.notificacao.findMany({
    where: {
      tenantId: tenant.id,
      userId: session.user.id,
      tipo: { in: TIPOS_NOTIFICACAO_ADMIN },
    },
    orderBy: { criadoEm: 'desc' },
    take: 50,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      corpo: true,
      link: true,
      lida: true,
      criadoEm: true,
    },
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <MotionReveal>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[rgb(var(--foreground))]">Notificações</h1>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Alertas operacionais desta torcida (alianças, denúncias, comunicados).
            </p>
          </div>
          {notificacoes.some((n) => !n.lida) && <AdminMarcarTodasLidasButton />}
        </div>
      </MotionReveal>

      {notificacoes.length === 0 ? (
        <MotionEmptyState
          icon={<Bell className="h-6 w-6" />}
          title="Nenhuma notificação operacional"
          description="Quando houver propostas de aliança, denúncias ou comunicados urgentes, elas aparecem aqui."
        />
      ) : (
        <ul className="space-y-2">
          {notificacoes.map((n) => (
            <li key={n.id}>
              <AdminNotificacaoLink
                id={n.id}
                tipo={n.tipo}
                titulo={n.titulo}
                corpo={n.corpo}
                link={n.link}
                lida={n.lida}
                criadoEm={n.criadoEm}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
