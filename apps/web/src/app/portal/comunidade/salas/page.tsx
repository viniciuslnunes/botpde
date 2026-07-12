import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Users, Video } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { listSalasAtivas } from '@/lib/salas'
import { CriarSalaForm } from '@/components/portal/criar-sala-form'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { db } from '@torcida/db'

export const metadata: Metadata = { title: 'Salas de vídeo' }

export default async function SalasPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const [salas, eventos] = await Promise.all([
    listSalasAtivas(tenant.id),
    db.evento.findMany({
      where: { tenantId: tenant.id, data: { gte: new Date() } },
      select: { id: true, titulo: true },
      orderBy: { data: 'asc' },
      take: 30,
    }) as Promise<{ id: string; titulo: string }[]>,
  ])

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effectivePermissions: string[] = calculateEffectivePermissions(rolePermissions, overrides)
  const canHost = hasPermission(effectivePermissions, PERMISSIONS.MEETINGS_HOST)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/comunidade"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar à comunidade
        </Link>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Salas ao vivo</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Encontros em tempo real com áudio, vídeo, chat e compartilhamento de tela
        </p>
      </div>

      {canHost && <CriarSalaForm eventos={eventos} />}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          {salas.length > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          {salas.length > 0 ? `${salas.length} sala${salas.length === 1 ? '' : 's'} abertas` : 'Salas ativas'}
        </h2>

        {salas.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.1)]">
              <Video className="h-6 w-6 text-[rgb(var(--primary))]" />
            </div>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Nenhuma sala aberta agora
            </p>
            <p className="mt-1 max-w-xs text-xs text-[rgb(var(--foreground-muted))]">
              {canHost
                ? 'Abra a primeira sala e chame a torcida para um encontro ao vivo.'
                : 'Assim que um anfitrião abrir uma sala, ela aparece aqui.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {salas.map((sala) => (
              <Link
                key={sala.id}
                href={`/portal/comunidade/salas/${sala.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:border-[rgb(var(--primary)_/_0.5)]"
              >
                <div className="flex items-start gap-2">
                  <Video className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-[rgb(var(--foreground))]">{sala.titulo}</h3>
                    {sala.evento && (
                      <span className="mt-1 inline-block rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--primary))]">
                        {sala.evento.titulo}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-[rgb(var(--border))] pt-3">
                  <span className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                    <Avatar nome={sala.host.nome} avatarUrl={sala.host.avatarUrl} size="xs" />
                    {sala.host.nome ?? 'Membro'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                    <Users className="h-3.5 w-3.5" />
                    {sala._count.participantes}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
