'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  AlertCircle,
  Bell,
  Hand,
  Info,
  Loader2,
  LogOut,
  MonitorUp,
  X,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import { playSalaModerationAlert } from '@/lib/sala-alert-sound'
import {
  ConnectionState,
  MediaDeviceFailure,
  RoomEvent,
  Track,
  type LocalParticipant,
  type RemoteParticipant,
} from 'livekit-client'
import '@livekit/components-styles'
import {
  decodeSalaModeracaoMessage,
  encodeSalaModeracaoMessage,
  permissionAllowsScreen,
  permissionAllowsSpeak,
  SALA_MOD_TOPIC,
  type MidiaSalaKind,
  type SalaModeracaoMessage,
} from '@/lib/sala-moderacao'
import './meet-room.css'
import { fadeScale, collapsePanel, springSnappy } from '@/lib/motion-presets'

type MeetRoomProps = {
  salaId: string
  token: string
  serverUrl: string
  isHost: boolean
  userId: string
  userName: string
  onOnlineCountChange?: (count: number) => void
  onLeaveCall?: () => void
}

type LiveKitModule = typeof import('@livekit/components-react')

type MediaRequest = {
  requestId: string
  userId: string
  userName: string
  kind: MidiaSalaKind
}

function requestKindLabel(kind: MidiaSalaKind): string {
  return kind === 'speak' ? 'falar' : 'compartilhar tela'
}

function notifyHostNewRequest(request: MediaRequest) {
  playSalaModerationAlert()
  toast.warning(`${request.userName} quer ${requestKindLabel(request.kind)}`, 'Responda na barra abaixo do vídeo.')
}

function notifyGuestResponse(kind: MidiaSalaKind, approved: boolean) {
  if (approved) {
    toast.success(
      kind === 'speak'
        ? 'Anfitrião liberou microfone e câmera.'
        : 'Anfitrião liberou compartilhamento de tela.',
    )
    return
  }
  toast.info('Solicitação negada pelo anfitrião.')
}

function mediaFailureMessage(failure: MediaDeviceFailure): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return 'Permita câmera e microfone nas configurações do navegador.'
    case MediaDeviceFailure.NotFound:
      return 'Nenhuma câmera ou microfone detectado. Você ainda pode usar o chat e solicitar compartilhar tela.'
    case MediaDeviceFailure.DeviceInUse:
      return 'Câmera ou microfone em uso por outro aplicativo.'
    default:
      return 'Não foi possível acessar câmera ou microfone.'
  }
}

function canUseSpeak(participant: LocalParticipant, isHost: boolean): boolean {
  if (isHost) return true
  const permissions = participant.permissions
  if (!permissions?.canPublish) return false
  return permissionAllowsSpeak(permissions.canPublishSources)
}

function canUseScreenShare(participant: LocalParticipant, isHost: boolean): boolean {
  if (isHost) return true
  const permissions = participant.permissions
  if (!permissions?.canPublish) return false
  return permissionAllowsScreen(permissions.canPublishSources)
}

async function registrarPresenca(salaId: string, method: 'POST' | 'DELETE'): Promise<number | null> {
  try {
    const res = await fetch(`/api/salas/${salaId}/participantes`, { method, cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { total?: number }
    return typeof data.total === 'number' ? data.total : null
  } catch {
    return null
  }
}

function ScreenShareButton({ lk }: { lk: LiveKitModule }) {
  const { useLocalParticipant } = lk
  const { localParticipant } = useLocalParticipant()
  const [pending, setPending] = useState(false)
  const enabled = localParticipant.isScreenShareEnabled

  async function alternarTela() {
    if (pending) return
    setPending(true)
    try {
      await localParticipant.setScreenShareEnabled(!enabled, { audio: true })
    } catch {
      toast.error('Não foi possível compartilhar a tela. Verifique a permissão do navegador.')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void alternarTela()}
      disabled={pending}
      data-active={enabled ? 'true' : 'false'}
      className="meet-room-action-wide"
    >
      <MonitorUp className="h-4 w-4 shrink-0" />
      <span>{pending ? 'Aguarde…' : enabled ? 'Parar tela' : 'Compartilhar tela'}</span>
    </button>
  )
}

function MeetControls({
  lk,
  salaId,
  isHost,
  userId,
  userName,
  onLeaveCall,
}: {
  lk: LiveKitModule
  salaId: string
  isHost: boolean
  userId: string
  userName: string
  onLeaveCall?: () => void
}) {
  const { useLocalParticipant, useRoomContext, TrackToggle } = lk
  const { localParticipant } = useLocalParticipant()
  const room = useRoomContext()

  const [requests, setRequests] = useState<MediaRequest[]>([])
  const [pendingKind, setPendingKind] = useState<MidiaSalaKind | null>(null)
  const [saindo, setSaindo] = useState(false)
  const [pulseRequests, setPulseRequests] = useState(false)
  const knownRequestIdsRef = useRef<Set<string>>(new Set())

  const canSpeak = canUseSpeak(localParticipant, isHost)
  const canScreen = canUseScreenShare(localParticipant, isHost)

  const syncPermissions = useCallback(() => {
    if (isHost) return
    if (canUseSpeak(localParticipant, false) || canUseScreenShare(localParticipant, false)) {
      setPendingKind(null)
    }
  }, [isHost, localParticipant])

  useEffect(() => {
    queueMicrotask(() => syncPermissions())
    localParticipant.on('participantPermissionsChanged', syncPermissions)
    return () => {
      localParticipant.off('participantPermissionsChanged', syncPermissions)
    }
  }, [localParticipant, syncPermissions])

  useEffect(() => {
    function onData(payload: Uint8Array, participant?: RemoteParticipant) {
      const message = decodeSalaModeracaoMessage(payload)
      if (!message) return

      if (message.type === 'media_request' && isHost) {
        setRequests((prev) => {
          if (prev.some((r) => r.requestId === message.requestId)) return prev
          if (!knownRequestIdsRef.current.has(message.requestId)) {
            knownRequestIdsRef.current.add(message.requestId)
            notifyHostNewRequest(message)
            setPulseRequests(true)
            window.setTimeout(() => setPulseRequests(false), 5000)
          }
          return [...prev, message]
        })
        return
      }

      if (message.type === 'media_response' && message.userId === userId) {
        notifyGuestResponse(message.kind, message.approved)
        if (message.approved) syncPermissions()
        setPendingKind(null)
      }

      if (message.type === 'media_request' && !isHost && participant) {
        // eco ignorado
      }
    }

    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, isHost, userId, syncPermissions])

  async function enviarSolicitacao(kind: MidiaSalaKind) {
    if (pendingKind) return
    const requestId = crypto.randomUUID()
    const message: SalaModeracaoMessage = {
      type: 'media_request',
      requestId,
      userId,
      userName,
      kind,
    }
    setPendingKind(kind)
    await room.localParticipant.publishData(encodeSalaModeracaoMessage(message), {
      reliable: true,
      topic: SALA_MOD_TOPIC,
    })
  }

  async function responderSolicitacao(request: MediaRequest, approved: boolean) {
    if (approved) {
      const res = await fetch(`/api/salas/${salaId}/midia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: request.userId, kind: request.kind }),
      })
      if (!res.ok) return
    }

    const response: SalaModeracaoMessage = {
      type: 'media_response',
      requestId: request.requestId,
      userId: request.userId,
      approved,
      kind: request.kind,
    }
    await room.localParticipant.publishData(encodeSalaModeracaoMessage(response), {
      reliable: true,
      topic: SALA_MOD_TOPIC,
    })
    setRequests((prev) => prev.filter((r) => r.requestId !== request.requestId))
  }

  async function sairDaChamada() {
    if (saindo) return
    setSaindo(true)
    await registrarPresenca(salaId, 'DELETE')
    room.disconnect()
    onLeaveCall?.()
  }

  return (
    <div className="meet-room-footer">
      {isHost && requests.length > 0 && (
        <div
          className={`meet-room-requests${pulseRequests ? ' meet-room-requests--pulse' : ''}`}
          role="region"
          aria-live="polite"
          aria-label="Solicitações pendentes de mídia"
        >
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <Bell className={`h-4 w-4${pulseRequests ? ' text-amber-400 animate-pulse' : ''}`} />
            Solicitações pendentes
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-zinc-950">
              {requests.length}
            </span>
          </p>
          <ul className="space-y-2">
            {requests.map((request) => (
              <li
                key={request.requestId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2"
              >
                <span className="text-sm text-zinc-100">
                  <strong>{request.userName}</strong>{' '}
                  {request.kind === 'speak' ? 'quer falar' : 'quer compartilhar tela'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void responderSolicitacao(request, true)}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    Permitir
                  </button>
                  <button
                    type="button"
                    onClick={() => void responderSolicitacao(request, false)}
                    className="rounded-lg border border-zinc-600 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                  >
                    Negar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="meet-room-toolbar">
        {isHost || canSpeak ? (
          <>
            <TrackToggle source={Track.Source.Microphone} className="meet-room-toggle" />
            <TrackToggle source={Track.Source.Camera} className="meet-room-toggle" />
          </>
        ) : (
          <button
            type="button"
            disabled={pendingKind === 'speak'}
            onClick={() => void enviarSolicitacao('speak')}
            className="meet-room-action"
          >
            <Hand className="h-4 w-4" />
            {pendingKind === 'speak' ? 'Aguardando…' : 'Solicitar falar'}
          </button>
        )}

        {isHost || canScreen ? (
          <ScreenShareButton lk={lk} />
        ) : (
          <button
            type="button"
            disabled={pendingKind === 'screen'}
            onClick={() => void enviarSolicitacao('screen')}
            className="meet-room-action"
          >
            <MonitorUp className="h-4 w-4" />
            {pendingKind === 'screen' ? 'Aguardando…' : 'Solicitar tela'}
          </button>
        )}

        <button
          type="button"
          onClick={() => void sairDaChamada()}
          disabled={saindo}
          className="meet-room-leave"
        >
          {saindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Sair da chamada
        </button>
      </div>
    </div>
  )
}

function MeetConference({
  lk,
  salaId,
  isHost,
  userId,
  userName,
  onLeaveCall,
}: {
  lk: LiveKitModule
  salaId: string
  isHost: boolean
  userId: string
  userName: string
  onLeaveCall?: () => void
}) {
  const { GridLayout, ParticipantTile, RoomAudioRenderer, useTracks, useLocalParticipant, useRoomContext } =
    lk

  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  const canSpeak = canUseSpeak(localParticipant, isHost)
  const canScreen = canUseScreenShare(localParticipant, isHost)
  const conectado = room.state === ConnectionState.Connected

  return (
    <div className="meet-room-layout">
      <div className="meet-room-stage">
        <AnimatePresence mode="wait">
          {!conectado ? (
            <m.div
              key="connecting"
              variants={fadeScale}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={springSnappy}
              className="meet-room-connecting"
            >
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Conectando à sala…</span>
            </m.div>
          ) : (
            <m.div
              key="grid"
              variants={fadeScale}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={springSnappy}
              className="h-full w-full"
            >
              <GridLayout tracks={tracks} className="meet-room-grid">
                <ParticipantTile />
              </GridLayout>
            </m.div>
          )}
        </AnimatePresence>

        {conectado && !isHost && !canSpeak && !canScreen && (
          <div className="meet-room-local-status">
            Sem permissão de voz, câmera ou tela — use os botões abaixo para solicitar ao anfitrião.
          </div>
        )}
      </div>

      <MeetControls
        lk={lk}
        salaId={salaId}
        isHost={isHost}
        userId={userId}
        userName={userName}
        onLeaveCall={onLeaveCall}
      />
      <RoomAudioRenderer />
    </div>
  )
}

export function MeetRoom({
  salaId,
  token,
  serverUrl,
  isHost,
  userId,
  userName,
  onOnlineCountChange,
  onLeaveCall,
}: MeetRoomProps) {
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
          setLoadError('SDK LiveKit indisponível neste ambiente.')
        }
      })
    return () => {
      active = false
    }
  }, [])

  const handleConnected = useCallback(async () => {
    const total = await registrarPresenca(salaId, 'POST')
    if (typeof total === 'number') onOnlineCountChange?.(total)
  }, [salaId, onOnlineCountChange])

  const handleDisconnected = useCallback(async () => {
    const total = await registrarPresenca(salaId, 'DELETE')
    if (typeof total === 'number') onOnlineCountChange?.(total)
  }, [salaId, onOnlineCountChange])

  const handleMediaDeviceFailure = useCallback((failure: MediaDeviceFailure) => {
    setMediaHint(mediaFailureMessage(failure))
  }, [])

  useEffect(() => {
    return () => {
      void registrarPresenca(salaId, 'DELETE')
    }
  }, [salaId])

  const conferenceProps = useMemo(
    () => ({ lk: lk!, salaId, isHost, userId, userName, onLeaveCall }),
    [lk, salaId, isHost, userId, userName, onLeaveCall],
  )

  if (loadError) {
    return (
      <m.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springSnappy}
        className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[rgb(var(--border))] p-6 text-center"
      >
        <AlertCircle className="h-8 w-8 text-[rgb(var(--foreground-muted))]" />
        <p className="max-w-md text-sm text-[rgb(var(--foreground-muted))]">{loadError}</p>
      </m.div>
    )
  }

  if (!lk) {
    return (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={springSnappy}
        className="flex min-h-[420px] items-center justify-center rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
      >
        <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--foreground-muted))]" />
      </m.div>
    )
  }

  const { LiveKitRoom } = lk

  return (
    <div className="meet-room-root" data-lk-theme="default">
      <AnimatePresence>
        {mediaHint && (
          <m.div
            key="hint"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="meet-room-alert overflow-hidden"
            role="status"
          >
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{mediaHint}</span>
            <button
              type="button"
              onClick={() => setMediaHint(null)}
              className="ml-auto text-amber-200/80 hover:text-amber-100"
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          </m.div>
        )}
      </AnimatePresence>

      {!isHost && (
        <p className="meet-room-hint">
          Microfone, câmera e tela exigem aprovação do anfitrião. Use os botões abaixo para solicitar.
        </p>
      )}

      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={false}
        video={false}
        data-lk-theme="default"
        className="flex min-h-0 flex-1 flex-col"
        onConnected={() => void handleConnected()}
        onDisconnected={() => void handleDisconnected()}
        onMediaDeviceFailure={handleMediaDeviceFailure}
        onError={(error) => {
          console.error('[MeetRoom]', error)
        }}
      >
        <MeetConference {...conferenceProps} />
      </LiveKitRoom>
    </div>
  )
}
