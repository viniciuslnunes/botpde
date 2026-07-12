import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { listarRedeSocial, podeVerListasRede } from '@/lib/perfil-social'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { getSeguimentoStatus } from '@/lib/social'
import { db } from '@torcida/db'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Seguindo' }

export default async function PerfilSeguindoPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const [{ userId }, session, tenant] = await Promise.all([params, auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { nome: true },
  })
  if (!user) redirect('/portal/comunidade')

  const podeVer = await podeVerListasRede(session.user.id, userId, tenant.id)
  const { membros } = podeVer
    ? await listarRedeSocial(userId, tenant.id, 'seguindo', session.user.id)
    : { membros: [] }

  const statuses = await Promise.all(
    membros.map((m) => getSeguimentoStatus(session.user.id, m.userId)),
  )

  return (
    <div className="space-y-4">
      <Link
        href={`/portal/comunidade/perfil/${userId}`}
        className="text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
      >
        ← Voltar ao perfil
      </Link>
      <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">
        {user.nome ?? 'Membro'} segue
      </h1>

      {!podeVer ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Lista privada.</p>
      ) : membros.length === 0 ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Não segue ninguém ainda.</p>
      ) : (
        <div className="space-y-2">
          {membros.map((m, i) => (
            <div
              key={m.userId}
              className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3"
            >
              <Link href={`/portal/comunidade/perfil/${m.userId}`} className="flex min-w-0 items-center gap-3">
                <Avatar nome={m.nome} avatarUrl={m.avatarUrl} size="md" />
                <p className="truncate text-sm font-semibold">{m.nome ?? 'Membro'}</p>
              </Link>
              {m.userId !== session.user.id && (
                <SeguimentoButtons userId={m.userId} status={statuses[i]} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
