import type { Metadata } from 'next'
import nextDynamic from 'next/dynamic'
import { notFound, redirect } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { isLiveKitConfigured, requireLiveKitConfig } from '@/lib/env'
import { createRoomToken } from '@/lib/livekit'
import { getSalaById } from '@/lib/salas'
import { listParticipantesAtivos } from '@/lib/salas-presenca'
import { getTenantFromHost } from '@/lib/tenant'
import { encerrarSala } from '../actions'
import { formatDateTimeShort } from '@/lib/format-datetime'

const SalaAtivaClient = nextDynamic(
  () => import('@/components/portal/sala-ativa-client').then((mod) => mod.SalaAtivaClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--foreground-muted))]" />
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Carregando sala…</p>
      </div>
    ),
  },
)

export const metadata: Metadata = { title: 'Sala de vídeo' }
export const dynamic = 'force-dynamic'

export default async function SalaDetailPage({
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
  if (!sala) notFound()

  const participantesAtivos = await listParticipantesAtivos(tenant.id, sala.id)
  const isHost = session.user.id === sala.hostId
  const livekitOk = isLiveKitConfigured()
  const token = livekitOk
    ? await createRoomToken(
        sala.livekitRoomName,
        session.user.id,
        session.user.name ?? 'Torcedor',
        isHost,
      )
    : null
  const livekitUrl = livekitOk ? requireLiveKitConfig().url : null

  const encerrarSalaBound = encerrarSala.bind(null, sala.id)

  return (
    <SalaAtivaClient
      sala={{
        id: sala.id,
        titulo: sala.titulo,
        linkConvite: sala.linkConvite,
        tipo: sala.tipo,
        criadoEm: sala.criadoEm.toISOString(),
        criadoEmFormatado: formatDateTimeShort(sala.criadoEm),
        encerradaEm: sala.encerradaEm?.toISOString() ?? null,
        encerradaEmFormatado: sala.encerradaEm
          ? formatDateTimeShort(sala.encerradaEm)
          : null,
        host: sala.host,
        evento: sala.evento ? { titulo: sala.evento.titulo } : null,
      }}
      isHost={isHost}
      userId={session.user.id}
      userName={session.user.name ?? 'Torcedor'}
      livekitOk={livekitOk}
      token={token}
      livekitUrl={livekitUrl}
      initialParticipantes={participantesAtivos.map((p) => ({
        userId: p.userId,
        nome: p.nome,
        avatarUrl: p.avatarUrl,
        papel: p.papel,
        entrouEm: p.entrouEm.toISOString(),
      }))}
      initialMensagens={sala.mensagens.map((m) => ({
        id: m.id,
        conteudo: m.conteudo,
        criadoEm: m.criadoEm.toISOString(),
        criadoEmFormatado: formatDateTimeShort(m.criadoEm),
        editadaEm: m.editadaEm?.toISOString() ?? null,
        destacada: m.destacada,
        autor: m.autor,
      }))}
      encerrarSalaAction={encerrarSalaBound}
    />
  )
}
