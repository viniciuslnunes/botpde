import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessagesSquare, Users, Video } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { listSalasAtivas } from '@/lib/salas'
import { criarSala } from './actions'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { db } from '@torcida/db'

export const metadata: Metadata = { title: 'Salas de vídeo' }

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Salas de vídeo</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Encontros em tempo real da comunidade usando áudio, vídeo e compartilhamento de tela
        </p>
      </div>

      {canHost && (
        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Criar nova sala
          </h2>
          <form action={criarSala} className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <input
              name="titulo"
              required
              minLength={3}
              maxLength={120}
              placeholder="Ex: Pré-jogo da rodada"
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
            />
            <select
              name="eventoId"
              defaultValue=""
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
            >
              <option value="">Sem evento vinculado</option>
              {eventos.map((evento) => (
                <option key={evento.id} value={evento.id}>
                  {evento.titulo}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white">
              Criar sala
            </button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Salas ativas
        </h2>

        {salas.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center">
            <MessagesSquare className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
              Não há salas abertas no momento
            </p>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              {canHost ? 'Crie a primeira sala para iniciar um encontro.' : 'Aguarde um anfitrião abrir uma sala.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {salas.map((sala) => (
              <Link
                key={sala.id}
                href={`/portal/comunidade/salas/${sala.id}`}
                className="flex flex-col gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Video className="h-4 w-4 text-[rgb(var(--primary))]" />
                  <h3 className="font-semibold text-[rgb(var(--foreground))]">{sala.titulo}</h3>
                  {sala.evento && (
                    <span className="rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                      Evento: {sala.evento.titulo}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-[rgb(var(--foreground-muted))]">
                  <span>Anfitrião: {sala.host.nome ?? 'Membro'}</span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {sala._count.participantes} online
                  </span>
                  <span>Criada em {formatarData(new Date(sala.criadoEm))}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
