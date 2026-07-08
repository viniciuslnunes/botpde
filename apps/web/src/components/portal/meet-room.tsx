'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Info, Loader2 } from 'lucide-react'
import { MediaDeviceFailure, Track } from 'livekit-client'
import '@livekit/components-styles'
import './meet-room.css'

type MeetRoomProps = {
  token: string
  serverUrl: string
}

type LiveKitModule = typeof import('@livekit/components-react')

function mediaFailureMessage(failure: MediaDeviceFailure): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return 'Permita câmera e microfone nas configurações do navegador para falar ou aparecer em vídeo.'
    case MediaDeviceFailure.NotFound:
      return 'Nenhuma câmera ou microfone detectado. Você ainda pode usar o chat da sala e compartilhar tela, se disponível.'
    case MediaDeviceFailure.DeviceInUse:
      return 'Câmera ou microfone em uso por outro aplicativo. Feche o outro app e tente novamente.'
    default:
      return 'Não foi possível acessar câmera ou microfone. Use os botões abaixo para tentar novamente.'
  }
}

function MeetConference({ lk }: { lk: LiveKitModule }) {
  const { GridLayout, ParticipantTile, ControlBar, RoomAudioRenderer, useTracks } = lk

  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])

  return (
    <div className="meet-room-layout">
      <div className="meet-room-stage">
        <GridLayout tracks={tracks} className="meet-room-grid">
          <ParticipantTile />
        </GridLayout>
      </div>

      <ControlBar
        className="meet-room-controls"
        controls={{
          microphone: true,
          camera: true,
          screenShare: true,
          chat: false,
          leave: false,
        }}
      />
      <RoomAudioRenderer />
    </div>
  )
}

export function MeetRoom({ token, serverUrl }: MeetRoomProps) {
  const [lk, setLk] = useState<LiveKitModule | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mediaHint, setMediaHint] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    import('@livekit/components-react')
      .then((mod) => {
        if (active) setLk(mod)
      })
      .catch(() => {
        if (active) {
          setLoadError(
            'SDK LiveKit indisponível. Verifique as dependências e a configuração LIVEKIT_URL.',
          )
        }
      })
    return () => {
      active = false
    }
  }, [])

  const handleMediaDeviceFailure = useCallback((failure: MediaDeviceFailure) => {
    setMediaHint(mediaFailureMessage(failure))
  }, [])

  if (loadError) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[rgb(var(--border))] p-6 text-center">
        <AlertCircle className="h-8 w-8 text-[rgb(var(--foreground-muted))]" />
        <p className="max-w-md text-sm text-[rgb(var(--foreground-muted))]">{loadError}</p>
      </div>
    )
  }

  if (!lk) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--foreground-muted))]" />
      </div>
    )
  }

  const { LiveKitRoom } = lk

  return (
    <div className="meet-room-root" data-lk-theme="default">
      {mediaHint && (
        <div className="meet-room-alert" role="status">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{mediaHint}</span>
          </div>
        </div>
      )}

      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={false}
        video={false}
        data-lk-theme="default"
        className="flex min-h-0 flex-1 flex-col"
        onMediaDeviceFailure={handleMediaDeviceFailure}
        onError={(error) => {
          console.error('[MeetRoom]', error)
        }}
      >
        <MeetConference lk={lk} />
      </LiveKitRoom>
    </div>
  )
}
