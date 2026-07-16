import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { isLiveKitConfigured, requireLiveKitConfig } from '@/lib/env'
import { createRoomToken } from '@/lib/livekit'
import { getSalaById } from '@/lib/salas'
import { listParticipantesAtivos } from '@/lib/salas-presenca'
import { getTenantFromHost } from '@/lib/tenant'
import { SalaPopoutLoading } from '@/components/portal/sala-popout-client'

export const metadata: Metadata = { title: 'Vídeo da sala' }
export const dynamic = 'force-dynamic'

const SalaPopoutClientLazy = nextDynamic(
  () => import('@/components/portal/sala-popout-client').then((mod) => mod.SalaPopoutClient),
  { ssr: false, loading: () => <SalaPopoutLoading /> },
)

export default async function VideoSalaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  await assertMembroAtivo(tenant.id, session.user.id)

  const sala = await getSalaById(tenant.id, id)
  if (!sala || sala.encerradaEm) notFound()

  if (!isLiveKitConfigured()) notFound()

  const participantesAtivos = await listParticipantesAtivos(tenant.id, sala.id)
  const isHost = session.user.id === sala.hostId
  const token = await createRoomToken(
    sala.livekitRoomName,
    session.user.id,
    session.user.name ?? 'Torcedor',
    isHost,
  )
  const livekitUrl = requireLiveKitConfig().url

  return (
    <SalaPopoutClientLazy
      salaId={sala.id}
      titulo={sala.titulo}
      hostId={sala.hostId}
      isHost={isHost}
      userId={session.user.id}
      userName={session.user.name ?? 'Torcedor'}
      token={token}
      livekitUrl={livekitUrl}
      initialParticipantes={participantesAtivos.map((p) => ({
        userId: p.userId,
        nome: p.nome,
        avatarUrl: p.avatarUrl,
        papel: p.papel,
        entrouEm: p.entrouEm.toISOString(),
      }))}
    />
  )
}
