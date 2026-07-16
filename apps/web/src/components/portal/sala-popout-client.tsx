'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Video } from 'lucide-react'
import { MeetRoom } from '@/components/portal/meet-room'
import type { ParticipanteSala } from '@/components/portal/sala-participantes'

type SalaPopoutClientProps = {
  salaId: string
  titulo: string
  hostId: string
  isHost: boolean
  userId: string
  userName: string
  token: string
  livekitUrl: string
  initialParticipantes: ParticipanteSala[]
}

export function SalaPopoutClient({
  salaId,
  titulo,
  hostId,
  isHost,
  userId,
  userName,
  token,
  livekitUrl,
  initialParticipantes,
}: SalaPopoutClientProps) {
  const [participantStripVisible, setParticipantStripVisible] = useState(true)
  const participantProfiles = Object.fromEntries(
    initialParticipantes.map((participante) => [
      participante.userId,
      { nome: participante.nome, avatarUrl: participante.avatarUrl },
    ]),
  )

  const notificarFechamento = useCallback(() => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'sala-video-popout-closed', salaId }, window.location.origin)
    }
  }, [salaId])

  useEffect(() => {
    document.title = `${titulo} — vídeo`
    window.addEventListener('beforeunload', notificarFechamento)
    return () => {
      window.removeEventListener('beforeunload', notificarFechamento)
      notificarFechamento()
    }
  }, [titulo, notificarFechamento])

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-black">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{titulo}</p>
          <p className="text-xs text-zinc-400">Janela de vídeo · feche para voltar à sala</p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <Video className="h-3.5 w-3.5" />
          Ao vivo
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <MeetRoom
          salaId={salaId}
          token={token}
          serverUrl={livekitUrl}
          hostId={hostId}
          isHost={isHost}
          userId={userId}
          userName={userName}
          participantProfiles={participantProfiles}
          popoutMode
          showParticipantStrip={participantStripVisible}
          onToggleParticipantStrip={() => setParticipantStripVisible((visible) => !visible)}
          onLeaveCall={notificarFechamento}
        />
      </main>
    </div>
  )
}

export function SalaPopoutLoading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-black">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
    </div>
  )
}
