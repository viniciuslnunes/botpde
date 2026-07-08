'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

type MeetRoomProps = {
  token: string
  serverUrl: string
}

type LiveKitModule = typeof import('@livekit/components-react')

export function MeetRoom({ token, serverUrl }: MeetRoomProps) {
  const [lk, setLk] = useState<LiveKitModule | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    import('@livekit/components-react')
      .then((mod) => {
        if (active) setLk(mod)
      })
      .catch(() => {
        if (active) {
          setLoadError(
            'SDK LiveKit indisponível. Instale as dependências (livekit-client, @livekit/components-react) e configure LIVEKIT_URL.',
          )
        }
      })
    return () => {
      active = false
    }
  }, [])

  if (loadError) {
    return (
      <div className="flex h-[560px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[rgb(var(--border))] p-6 text-center">
        <AlertCircle className="h-8 w-8 text-[rgb(var(--foreground-muted))]" />
        <p className="max-w-md text-sm text-[rgb(var(--foreground-muted))]">{loadError}</p>
      </div>
    )
  }

  if (!lk) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-xl border border-[rgb(var(--border))]">
        <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--foreground-muted))]" />
      </div>
    )
  }

  const { LiveKitRoom, RoomAudioRenderer, VideoConference } = lk

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      video
      audio
      data-lk-theme="default"
      className="h-[560px] rounded-xl border border-[rgb(var(--border))]"
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}
