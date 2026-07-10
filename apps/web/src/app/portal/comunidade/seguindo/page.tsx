import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { db } from '@torcida/db'
import { SeguimentoReviewButtons } from '@/components/portal/seguimento-buttons'
import { aprovarSeguimento, rejeitarSeguimento } from '@/app/portal/comunidade/actions'
import { Avatar } from '@/components/portal/avatar'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Solicitações de Seguimento' }

interface SeguimentoPendenteRow {
  id: string
  criadoEm: Date
  seguidor: {
    id: string
    nome: string | null
    avatarUrl: string | null
  }
}

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(data),
  )
}

export default async function SeguindoPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const pendentes: SeguimentoPendenteRow[] = await db.seguimento.findMany({
    where: {
      seguidoId: session.user.id,
      tenantContextoId: tenant.id,
      status: 'PENDENTE',
    },
    orderBy: { criadoEm: 'desc' },
    include: {
      seguidor: {
        select: {
          id: true,
          nome: true,
          avatarUrl: true,
        },
      },
    },
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Solicitações para seguir</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Aprove ou rejeite pedidos pendentes do seu perfil.
          </p>
        </div>
        <Link
          href="/portal/comunidade"
          className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          Voltar ao feed
        </Link>
      </div>

      {pendentes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center">
          <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
            Sem solicitações pendentes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendentes.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Link href={`/portal/comunidade/perfil/${item.seguidor.id}`}>
                  <Avatar nome={item.seguidor.nome} avatarUrl={item.seguidor.avatarUrl} size="md" />
                </Link>
                <div className="min-w-0">
                  <Link
                    href={`/portal/comunidade/perfil/${item.seguidor.id}`}
                    className="truncate text-sm font-semibold text-[rgb(var(--foreground))] hover:underline"
                  >
                    {item.seguidor.nome ?? 'Membro'}
                  </Link>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    solicitou em {formatarData(item.criadoEm)}
                  </p>
                </div>
              </div>
              <SeguimentoReviewButtons
                seguimentoId={item.id}
                onAprovar={aprovarSeguimento}
                onRejeitar={rejeitarSeguimento}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
