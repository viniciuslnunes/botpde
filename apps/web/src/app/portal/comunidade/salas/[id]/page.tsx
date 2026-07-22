import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { assertSalaMembro } from '@/lib/salas-api'
import { isLiveKitConfigured, requireLiveKitConfig } from '@/lib/env'
import { createRoomToken } from '@/lib/livekit'
import { getSalaById } from '@/lib/salas'
import { listParticipantesAtivos } from '@/lib/salas-presenca'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { encerrarSala } from '../actions'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { SalaAtivaShell } from '@/components/portal/sala-ativa-shell'

export const metadata: Metadata = { title: 'Sala de vídeo' }
export const dynamic = 'force-dynamic'

export default async function SalaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  // `assertSalaMembro` cobre o caminho torcida (membro ativo do tenant) e o
  // fallback Comunidade Nacional (sala do sintético ou `ABERTA` do clube) —
  // sempre usa o `tenantId` real da sala (não o sintético) para `getSalaById`.
  const { sala: salaCtx } = await assertSalaMembro(id)

  const sala = await getSalaById(salaCtx.tenantId, id)
  if (!sala) notFound()

  const participantesAtivos = await listParticipantesAtivos(salaCtx.tenantId, sala.id)
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
  const userAvatarUrl = await getAvatarAtualDoUsuario(session.user.id)

  return (
    <SalaAtivaShell
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
      userAvatarUrl={userAvatarUrl}
      livekitOk={livekitOk}
      token={token}
      livekitUrl={livekitUrl}
      initialParticipantes={participantesAtivos.map((p) => ({
        userId: p.userId,
        nome: p.nome,
        avatarUrl: p.avatarUrl ?? (p.userId === session.user.id ? userAvatarUrl : null),
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

