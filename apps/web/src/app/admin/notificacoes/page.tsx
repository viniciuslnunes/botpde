import Link from 'next/link'
import type { Metadata } from 'next'
import { Bell } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { TipoNotificacao } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { TIPOS_NOTIFICACAO_ADMIN } from '@/lib/notificacoes-comunidade'
import { marcarTodasNotificacoesAdminLidas } from '@/app/actions/notificacoes'
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

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data)
}

export default async function AdminNotificacoesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

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
          {notificacoes.some((n) => !n.lida) && (
            <form action={marcarTodasNotificacoesAdminLidas}>
              <button
                type="submit"
                className="app-action rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
              >
                Marcar todas como lidas
              </button>
            </form>
          )}
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
              <Link
                href={n.link ?? '/admin'}
                className={[
                  'block rounded-xl border border-[rgb(var(--border))] px-4 py-3 transition-colors',
                  n.lida
                    ? 'bg-[rgb(var(--surface))] hover:bg-[rgb(var(--background-subtle))]'
                    : 'bg-[rgb(var(--primary)_/_0.06)] hover:bg-[rgb(var(--primary)_/_0.1)]',
                ].join(' ')}
              >
                <p className="text-sm font-medium text-[rgb(var(--foreground))]">{n.titulo}</p>
                {n.corpo && (
                  <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--foreground-muted))]">
                    {n.corpo}
                  </p>
                )}
                <p className="mt-2 text-[10px] text-[rgb(var(--foreground-muted))]">
                  {formatarData(n.criadoEm)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
