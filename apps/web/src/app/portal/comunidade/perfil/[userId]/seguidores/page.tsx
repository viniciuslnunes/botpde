import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { resolveTenantMinhaTorcida } from '@/lib/comunidade-contexto'
import { listarRedeSocial, podeVerListasRede } from '@/lib/perfil-social'
import { saoUsuariosRivais } from '@/lib/perfil-visibilidade'
import { ComunidadeMemberList } from '../../../_components/comunidade-member-list'
import { getSeguimentoStatus } from '@/lib/social'
import { db } from '@torcida/db'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Seguidores' }

export default async function PerfilSeguidoresPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const [{ userId }, session] = await Promise.all([params, auth()])
  if (!session?.user?.id) redirect('/entrar')
  if (session.user.id !== userId && (await saoUsuariosRivais(session.user.id, userId))) {
    notFound()
  }
  const tenant = await resolveTenantMinhaTorcida(session.user.id, session.user.email)
  if (!tenant) redirect('/portal/comunidade?escopo=nacional')

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { nome: true },
  })
  if (!user) redirect('/portal/comunidade')

  const podeVer = await podeVerListasRede(session.user.id, userId, tenant.id)
  const { membros } = podeVer
    ? await listarRedeSocial(userId, tenant.id, 'seguidores', session.user.id)
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
        Seguidores de {user.nome ?? 'Membro'}
      </h1>

      <ComunidadeMemberList
        membros={membros}
        statuses={statuses}
        currentUserId={session.user.id}
        podeVer={podeVer}
        emptyTitle="Nenhum seguidor ainda."
      />
    </div>
  )
}
