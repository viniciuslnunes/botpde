'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  AlertCircle,
  AppWindow,
  Bell,
  Hand,
  Info,
  Loader2,
  LogOut,
  Maximize2,
  Minimize2,
  MonitorUp,
  MonitorX,
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
  isTrustedMediaRequest,
  isTrustedMediaResponse,
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
  hostId: string
  isHost: boolean
  userId: string
  userName: string
  userAvatarUrl?: string | null
  participantProfiles?: Record<string, { nome: string | null; avatarUrl: string | null }>
  popoutMode?: boolean
  chromeVisible?: boolean
  resumeScreenShare?: boolean
  showParticipantStrip?: boolean
  canOpenVideoPopout?: boolean
  onOpenVideoPopout?: () => void
  onToggleParticipantStrip?: () => void
  onOnlineCountChange?: (count: number) => void
  onScreenShareActiveChange?: (active: boolean) => void
  onLeaveCall?: () => void
}

type LiveKitModule = typeof import('@livekit/components-react')

type MediaRequest = {
  requestId: string
  userId: string
  userName: string
  kind: MidiaSalaKind
}

type TrackRef = {
  participant: { identity: string; name?: string }
  source: Track.Source
  publication?: { trackSid?: string; source?: Track.Source; isSubscribed?: boolean }
}

type LayoutPinContext = {
  pin: {
    dispatch?: (action: { msg: 'set_pin'; trackReference: TrackRef } | { msg: 'clear_pin' }) => void
    state?: TrackRef[]
  }
}

function TooltipIconButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className="meet-room-overlay-action group"
    >
      {children}
      <span className="meet-room-tooltip" role="tooltip">
        {label}
      </span>
    </button>
  )
}

const ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
} as const

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

function isSameTrackRef(a: TrackRef, b: TrackRef | undefined): boolean {
  if (!b) return false
  return (
    a.participant.identity === b.participant.identity &&
    a.source === b.source &&
    (a.publication?.trackSid === b.publication?.trackSid || (!a.publication?.trackSid && !b.publication?.trackSid))
  )
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
      if (!enabled) {
        toast.info(
          'Dica: compartilhe a tela inteira ou outra janela — não a janela de vídeo desta sala.',
        )
      }
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
      aria-pressed={enabled}
    >
      <MonitorUp className="h-4 w-4 shrink-0" />
      <span>{pending ? 'Aguarde…' : enabled ? 'Parar tela' : 'Compartilhar tela'}</span>
    </button>
  )
}

function ActiveScreenShareBanner({
  salaId,
  sharers,
}: {
  salaId: string
  sharers: Array<{ userId: string; userName: string }>
}) {
  const [revoking, setRevoking] = useState<string | null>(null)

  async function interromper(userId: string) {
    if (revoking) return
    setRevoking(userId)
    try {
      const res = await fetch(`/api/salas/${salaId}/midia`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, kind: 'screen' }),
      })
      if (!res.ok) {
        toast.error('Não foi possível interromper o compartilhamento.')
        return
      }
      toast.success('Compartilhamento de tela interrompido.')
    } catch {
      toast.error('Não foi possível interromper o compartilhamento.')
    } finally {
      setRevoking(null)
    }
  }

  if (sharers.length === 0) return null

  return (
    <div className="meet-room-screen-banner" role="status">
      {sharers.map((sharer) => (
        <div key={sharer.userId} className="meet-room-screen-banner__row">
          <span className="meet-room-screen-banner__label">
            <MonitorUp className="h-4 w-4 shrink-0 text-sky-400" />
            <strong>{sharer.userName}</strong> está compartilhando a tela
          </span>
          <button
            type="button"
            onClick={() => void interromper(sharer.userId)}
            disabled={revoking === sharer.userId}
            className="meet-room-screen-banner__revoke"
          >
            {revoking === sharer.userId ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MonitorX className="h-3.5 w-3.5" />
            )}
            Interromper
          </button>
        </div>
      ))}
    </div>
  )
}

function MeetControls({
  lk,
  salaId,
  hostId,
  isHost,
  userId,
  userName,
  activeScreenSharers,
  compact = false,
  onLeaveCall,
}: {
  lk: LiveKitModule
  salaId: string
  hostId: string
  isHost: boolean
  userId: string
  userName: string
  activeScreenSharers: Array<{ userId: string; userName: string }>
  compact?: boolean
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
  const hadSpeakRef = useRef(false)
  const hadScreenRef = useRef(false)

  const canSpeak = canUseSpeak(localParticipant, isHost)
  const canScreen = canUseScreenShare(localParticipant, isHost)

  const syncPermissions = useCallback(() => {
    if (isHost) return

    const speakNow = canUseSpeak(localParticipant, false)
    const screenNow = canUseScreenShare(localParticipant, false)

    if (speakNow && !hadSpeakRef.current) {
      notifyGuestResponse('speak', true)
      setPendingKind(null)
    }
    if (screenNow && !hadScreenRef.current) {
      notifyGuestResponse('screen', true)
      setPendingKind(null)
    }

    hadSpeakRef.current = speakNow
    hadScreenRef.current = screenNow

    if (speakNow || screenNow) {
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
        if (!isTrustedMediaRequest(participant?.identity, message)) return
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

      if (message.type === 'media_response' && !isHost && message.userId === userId) {
        if (!isTrustedMediaResponse(participant?.identity, hostId, message)) return
        if (!message.approved) {
          notifyGuestResponse(message.kind, false)
          setPendingKind(null)
        }
      }
    }

    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, isHost, userId, hostId])

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
    const res = await fetch(`/api/salas/${salaId}/midia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: request.userId, kind: request.kind, approved }),
    })
    if (!res.ok) {
      toast.error('Não foi possível processar a solicitação.')
      return
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
    <div className={`meet-room-footer${compact ? ' meet-room-footer--compact' : ''}`}>
      {isHost && activeScreenSharers.length > 0 && !compact && (
        <ActiveScreenShareBanner salaId={salaId} sharers={activeScreenSharers} />
      )}

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
          title="Sair da chamada"
        >
          {saindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {compact ? 'Sair' : 'Sair da chamada'}
        </button>
      </div>
    </div>
  )
}

function resolveParticipantProfile(
  tile: Element,
  userId: string,
  participantProfiles: Record<string, { nome: string | null; avatarUrl: string | null }>,
): { nome: string | null; avatarUrl: string | null } | null {
  const isLocal = tile.getAttribute('data-lk-local-participant') === 'true'
  if (isLocal && participantProfiles[userId]) return participantProfiles[userId]

  const identity =
    tile.getAttribute('data-lk-identity')?.trim() ||
    tile.getAttribute('data-lk-participant-identity')?.trim()
  if (identity && participantProfiles[identity]) return participantProfiles[identity]

  const attrName = tile.getAttribute('data-lk-participant-name')?.trim()
  const labelName = tile.querySelector('.lk-participant-name')?.textContent?.trim()
  const candidateName = attrName || labelName

  if (candidateName) {
    const byExactName = Object.values(participantProfiles).find(
      (profile) => (profile.nome ?? '').trim() === candidateName,
    )
    if (byExactName) return byExactName

    const byLooseName = Object.values(participantProfiles).find((profile) => {
      const nome = (profile.nome ?? '').trim().toLowerCase()
      return nome.length > 0 && candidateName.toLowerCase().includes(nome)
    })
    if (byLooseName) return byLooseName
  }

  return isLocal ? participantProfiles[userId] ?? null : null
}

function isCameraLiveOnTile(tile: Element): boolean {
  // Só esconde o avatar quando a câmera está explicitamente ligada.
  // LiveKit costuma manter <video> no DOM mesmo com câmera off — isso fazia
  // o fallback sumir/aparecer (silhueta padrão ↔ foto).
  return tile.getAttribute('data-lk-video-muted') === 'false'
}

function ensureTileAvatarFallback(
  tile: Element,
  userId: string,
  participantProfiles: Record<string, { nome: string | null; avatarUrl: string | null }>,
) {
  const source = tile.getAttribute('data-lk-source')
  if (source === 'screen_share') return

  const existing = tile.querySelector('.meet-room-avatar-fallback') as HTMLElement | null

  if (isCameraLiveOnTile(tile)) {
    existing?.remove()
    tile.removeAttribute('data-meet-room-custom-avatar')
    return
  }

  const profile = resolveParticipantProfile(tile, userId, participantProfiles)
  const participantName =
    tile.getAttribute('data-lk-participant-name')?.trim() ||
    tile.querySelector('.lk-participant-name')?.textContent?.trim() ||
    profile?.nome ||
    'Membro'
  const avatarUrl = profile?.avatarUrl ?? ''

  tile.setAttribute('data-meet-room-custom-avatar', 'true')

  if (
    existing &&
    existing.dataset.avatarUrl === avatarUrl &&
    existing.dataset.participantName === participantName
  ) {
    return
  }

  const fallback = existing ?? document.createElement('div')
  fallback.className = 'meet-room-avatar-fallback'
  fallback.dataset.avatarUrl = avatarUrl
  fallback.dataset.participantName = participantName

  if (avatarUrl) {
    const currentImg = fallback.querySelector('img.meet-room-avatar-fallback__image') as HTMLImageElement | null
    if (currentImg && currentImg.getAttribute('src') === avatarUrl) {
      currentImg.alt = participantName
    } else {
      fallback.replaceChildren()
      const img = document.createElement('img')
      img.src = avatarUrl
      img.alt = participantName
      img.decoding = 'async'
      img.referrerPolicy = 'no-referrer'
      img.className = 'meet-room-avatar-fallback__image'
      fallback.appendChild(img)
    }
  } else {
    fallback.replaceChildren()
    const initial = document.createElement('span')
    initial.className = 'meet-room-avatar-fallback__initial'
    initial.textContent = participantName.charAt(0).toUpperCase() || 'M'
    fallback.appendChild(initial)
  }

  if (!existing) tile.appendChild(fallback)
}

function MeetStage({
  lk,
  userId,
  participantProfiles,
  showParticipantStrip,
  onToggleParticipantStrip,
}: {
  lk: LiveKitModule
  userId: string
  participantProfiles: Record<string, { nome: string | null; avatarUrl: string | null }>
  showParticipantStrip: boolean
  onToggleParticipantStrip?: () => void
}) {
  const {
    GridLayout,
    ParticipantTile,
    FocusLayout,
    CarouselLayout,
    useLayoutContext,
    usePinnedTracks,
    useTracks,
    isTrackReference,
  } = lk

  const layoutContext = useLayoutContext() as LayoutPinContext
  const lastAutoFocusedScreenShareRef = useRef<TrackRef | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false, updateOnlyOn: [RoomEvent.ActiveSpeakersChanged] },
  ) as TrackRef[]

  const screenShareTracks = tracks.filter(
    (track) => isTrackReference(track) && track.publication?.source === Track.Source.ScreenShare,
  )

  const pinnedTrack = (usePinnedTracks(layoutContext) as TrackRef[])[0]
  // Sempre prioriza a tela compartilhada no palco — pin do LiveKit às vezes
  // falha para track local (isSubscribed/timing) e deixa a área preta.
  const activeScreenShare =
    screenShareTracks.find((t) => t.publication?.isSubscribed) ?? screenShareTracks[0] ?? null
  const focusTrack = activeScreenShare ?? pinnedTrack
  const carouselTracks = tracks.filter((track) => !isSameTrackRef(track, focusTrack))

  const screenShareKey = screenShareTracks
    .map((t) => `${t.publication?.trackSid ?? ''}_${t.publication?.isSubscribed ? '1' : '0'}`)
    .join(',')

  useEffect(() => {
    const pin = layoutContext.pin.dispatch
    if (!pin) return

    if (activeScreenShare) {
      if (!isSameTrackRef(activeScreenShare, lastAutoFocusedScreenShareRef.current ?? undefined)) {
        pin({ msg: 'set_pin', trackReference: activeScreenShare })
        lastAutoFocusedScreenShareRef.current = activeScreenShare
      }
      return
    }

    if (lastAutoFocusedScreenShareRef.current) {
      pin({ msg: 'clear_pin' })
      lastAutoFocusedScreenShareRef.current = null
    }
  }, [layoutContext.pin.dispatch, screenShareKey, activeScreenShare])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    function syncAvatars() {
      const root = stageRef.current
      if (!root) return
      for (const tile of Array.from(root.querySelectorAll('.lk-participant-tile'))) {
        ensureTileAvatarFallback(tile, userId, participantProfiles)
      }
    }

    syncAvatars()

    let frame = 0
    const scheduleSync = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        syncAvatars()
      })
    }

    const observer = new MutationObserver(scheduleSync)
    observer.observe(stage, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'data-lk-video-muted',
        'data-lk-source',
        'data-lk-local-participant',
        'data-lk-participant-name',
        'data-lk-identity',
      ],
    })

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [participantProfiles, userId, showParticipantStrip, focusTrack])

  if (focusTrack) {
    return (
      <div ref={stageRef} className="meet-room-focus-wrapper">
        <div className="meet-room-spotlight">
          <FocusLayout trackRef={focusTrack} className="meet-room-focus-main" />
          <div className="meet-room-focus-badge">
            <MonitorUp className="h-3.5 w-3.5" />
            Tela de {focusTrack.participant.name ?? 'participante'}
          </div>
        </div>

        <div
          className={`meet-room-bottom-strip-shell${
            showParticipantStrip ? '' : ' meet-room-bottom-strip-shell--collapsed'
          }`}
        >
          {onToggleParticipantStrip ? (
            <button
              type="button"
              className="meet-room-strip-toggle"
              onClick={onToggleParticipantStrip}
              aria-expanded={showParticipantStrip}
              title={
                showParticipantStrip
                  ? 'Ocultar participantes (vista limpa)'
                  : 'Mostrar participantes'
              }
            >
              {showParticipantStrip ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
              <span className="meet-room-strip-toggle__label">
                {showParticipantStrip ? 'Ocultar' : 'Participantes'}
              </span>
            </button>
          ) : null}

          <AnimatePresence initial={false}>
            {showParticipantStrip && carouselTracks.length > 0 ? (
              <m.div
                key="bottom-strip"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={springSnappy}
                className="meet-room-bottom-strip-track"
              >
                <CarouselLayout tracks={carouselTracks} className="meet-room-bottom-strip">
                  <ParticipantTile />
                </CarouselLayout>
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    )
  }

  return (
    <div ref={stageRef} className="h-full">
      <GridLayout tracks={tracks} className="meet-room-grid">
        <ParticipantTile />
      </GridLayout>
    </div>
  )
}

function MeetConference({
  lk,
  salaId,
  hostId,
  isHost,
  userId,
  userName,
  participantProfiles,
  popoutMode,
  resumeScreenShare,
  showParticipantStrip,
  canOpenVideoPopout,
  onOpenVideoPopout,
  onToggleParticipantStrip,
  onScreenShareActiveChange,
  onLeaveCall,
}: {
  lk: LiveKitModule
  salaId: string
  hostId: string
  isHost: boolean
  userId: string
  userName: string
  participantProfiles: Record<string, { nome: string | null; avatarUrl: string | null }>
  popoutMode: boolean
  resumeScreenShare: boolean
  showParticipantStrip: boolean
  canOpenVideoPopout: boolean
  onOpenVideoPopout?: () => void
  onToggleParticipantStrip?: () => void
  onScreenShareActiveChange?: (active: boolean) => void
  onLeaveCall?: () => void
}) {
  const {
    RoomAudioRenderer,
    useTracks,
    useLocalParticipant,
    useRoomContext,
    LayoutContextProvider,
    useCreateLayoutContext,
    isTrackReference,
  } = lk

  const layoutContext = useCreateLayoutContext() as LayoutPinContext
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()

  const screenTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], {
    onlySubscribed: true,
  }) as TrackRef[]

  const activeScreenSharers = useMemo(() => {
    const seen = new Set<string>()
    const sharers: Array<{ userId: string; userName: string }> = []
    for (const track of screenTracks) {
      if (!isTrackReference(track)) continue
      const id = track.participant.identity
      if (seen.has(id)) continue
      seen.add(id)
      sharers.push({
        userId: id,
        userName: track.participant.name ?? 'Participante',
      })
    }
    return sharers
  }, [screenTracks, isTrackReference])

  const localScreenShareActive = activeScreenSharers.some((sharer) => sharer.userId === userId)
  const resumeScreenAttemptedRef = useRef(false)
  const roomConnected = room.state === ConnectionState.Connected

  useEffect(() => {
    onScreenShareActiveChange?.(localScreenShareActive)
  }, [localScreenShareActive, onScreenShareActiveChange])

  useEffect(() => {
    if (!resumeScreenShare) {
      resumeScreenAttemptedRef.current = false
      return
    }
    if (!roomConnected) return
    if (resumeScreenAttemptedRef.current) return

    const participant = room.localParticipant
    if (participant.isScreenShareEnabled) {
      resumeScreenAttemptedRef.current = true
      return
    }

    // Uma única tentativa: re-disparar abre o picker do Chrome em loop
    // (re-renders durante o getDisplayMedia reexecutavam o efeito).
    resumeScreenAttemptedRef.current = true
    void participant.setScreenShareEnabled(true, { audio: true }).catch(() => {
      toast.info('Reative o compartilhamento de tela nesta janela para continuar a apresentação.')
    })
  }, [resumeScreenShare, roomConnected, room])

  const canSpeak = canUseSpeak(localParticipant, isHost)
  const canScreen = canUseScreenShare(localParticipant, isHost)
  const conectado = roomConnected

  return (
    <LayoutContextProvider value={layoutContext}>
      <div className="meet-room-layout">
        <div className="meet-room-stage">
          {!conectado ? (
            <div className="meet-room-connecting">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Conectando à sala…</span>
            </div>
          ) : popoutMode ? (
            <div className="h-full w-full">
              <MeetStage
                lk={lk}
                userId={userId}
                participantProfiles={participantProfiles}
                showParticipantStrip={showParticipantStrip}
                onToggleParticipantStrip={onToggleParticipantStrip}
              />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <m.div
                key="stage"
                variants={fadeScale}
                initial="hidden"
                animate="show"
                exit="hidden"
                transition={springSnappy}
                className="h-full w-full"
              >
                <MeetStage
                  lk={lk}
                  userId={userId}
                  participantProfiles={participantProfiles}
                  showParticipantStrip={showParticipantStrip}
                  onToggleParticipantStrip={onToggleParticipantStrip}
                />
              </m.div>
            </AnimatePresence>
          )}

          {conectado && canOpenVideoPopout && onOpenVideoPopout && !popoutMode ? (
            <div className="meet-room-stage-actions">
              <TooltipIconButton
                label="Abrir vídeo em nova janela"
                onClick={onOpenVideoPopout}
              >
                <AppWindow className="h-4 w-4" />
              </TooltipIconButton>
            </div>
          ) : null}

          {conectado && !isHost && !canSpeak && !canScreen && (
            <div className="meet-room-local-status">
              Sem permissão de voz, câmera ou tela — use os botões abaixo para solicitar ao anfitrião.
            </div>
          )}
        </div>

        <MeetControls
          lk={lk}
          salaId={salaId}
          hostId={hostId}
          isHost={isHost}
          userId={userId}
          userName={userName}
          activeScreenSharers={activeScreenSharers}
          compact={popoutMode}
          onLeaveCall={onLeaveCall}
        />
        <RoomAudioRenderer />
      </div>
    </LayoutContextProvider>
  )
}

export function MeetRoom({
  salaId,
  token,
  serverUrl,
  hostId,
  isHost,
  userId,
  userName,
  userAvatarUrl = null,
  participantProfiles = {},
  popoutMode = false,
  chromeVisible = true,
  resumeScreenShare = false,
  showParticipantStrip = true,
  canOpenVideoPopout = false,
  onOpenVideoPopout,
  onToggleParticipantStrip,
  onOnlineCountChange,
  onScreenShareActiveChange,
  onLeaveCall,
}: MeetRoomProps) {
  const [lk, setLk] = useState<LiveKitModule | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mediaHint, setMediaHint] = useState<string | null>(null)

  const profilesWithLocal = useMemo(() => {
    const next = { ...participantProfiles }
    const existing = next[userId]
    next[userId] = {
      nome: existing?.nome ?? userName,
      avatarUrl: userAvatarUrl ?? existing?.avatarUrl ?? null,
    }
    return next
  }, [participantProfiles, userAvatarUrl, userId, userName])

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
    () => ({
      lk: lk!,
      salaId,
      hostId,
      isHost,
      userId,
      userName,
      participantProfiles: profilesWithLocal,
      popoutMode,
      resumeScreenShare,
      showParticipantStrip,
      canOpenVideoPopout,
      onOpenVideoPopout,
      onToggleParticipantStrip,
      onScreenShareActiveChange,
      onLeaveCall,
    }),
    [
      lk,
      salaId,
      hostId,
      isHost,
      userId,
      userName,
      profilesWithLocal,
      popoutMode,
      resumeScreenShare,
      showParticipantStrip,
      canOpenVideoPopout,
      onOpenVideoPopout,
      onToggleParticipantStrip,
      onScreenShareActiveChange,
      onLeaveCall,
    ],
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
    <div
      className="meet-room-root"
      data-lk-theme="default"
      data-popout={popoutMode ? 'true' : 'false'}
      data-chrome={chromeVisible ? 'true' : 'false'}
    >
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
        options={ROOM_OPTIONS}
        data-lk-theme="default"
        className="flex h-full min-h-0 flex-1 flex-col"
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
