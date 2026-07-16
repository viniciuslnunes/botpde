'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeftToLine,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Users,
  Video,
  X,
} from 'lucide-react'
import { MeetRoom } from '@/components/portal/meet-room'
import { SalaChat, type SalaMensagem } from '@/components/portal/sala-chat'
import { SalaParticipantes, type ParticipanteSala } from '@/components/portal/sala-participantes'

type SalaPopoutClientProps = {
  salaId: string
  titulo: string
  hostId: string
  isHost: boolean
  userId: string
  userName: string
  userAvatarUrl?: string | null
  token: string
  livekitUrl: string
  resumeScreenShare?: boolean
  initialParticipantes: ParticipanteSala[]
  initialMensagens: SalaMensagem[]
}

const CHROME_IDLE_MS = 2000

const panelGlass =
  'border border-white/15 bg-zinc-950/25 shadow-2xl backdrop-blur-xl'

export function SalaPopoutClient({
  salaId,
  titulo,
  hostId,
  isHost,
  userId,
  userName,
  userAvatarUrl = null,
  token,
  livekitUrl,
  resumeScreenShare = false,
  initialParticipantes,
  initialMensagens,
}: SalaPopoutClientProps) {
  const [participantStripVisible, setParticipantStripVisible] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false)
  const idleTimerRef = useRef<number | null>(null)
  const panelHoverRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const participantProfiles = Object.fromEntries(
    initialParticipantes.map((participante) => [
      participante.userId,
      { nome: participante.nome, avatarUrl: participante.avatarUrl },
    ]),
  )

  const revelarChrome = useCallback(() => {
    setChromeVisible(true)
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
    if (panelHoverRef.current || commentsOpen || membersOpen) return
    idleTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false)
    }, CHROME_IDLE_MS)
  }, [commentsOpen, membersOpen])

  const voltarParaSala = useCallback(() => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'sala-video-popout-closed', salaId }, window.location.origin)
      window.opener.focus()
    }
    window.close()
  }, [salaId])

  const notificarFechamento = useCallback(() => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'sala-video-popout-closed', salaId }, window.location.origin)
    }
  }, [salaId])

  const alternarFullscreen = useCallback(async () => {
    const node = rootRef.current
    if (!node) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await node.requestFullscreen()
      }
    } catch {
      // Navegador pode bloquear fullscreen sem gesto do usuário — o clique já é o gesto.
    }
    revelarChrome()
  }, [revelarChrome])

  useEffect(() => {
    function onFullscreenChange() {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    document.title = `${titulo} — vídeo`
    window.addEventListener('beforeunload', notificarFechamento)
    return () => {
      window.removeEventListener('beforeunload', notificarFechamento)
      notificarFechamento()
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
    }
  }, [titulo, notificarFechamento])

  useEffect(() => {
    revelarChrome()
  }, [commentsOpen, membersOpen, revelarChrome])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      revelarChrome()
      if (event.key === 'Escape') {
        if (document.fullscreenElement) return
        event.preventDefault()
        if (commentsOpen || membersOpen) {
          setCommentsOpen(false)
          setMembersOpen(false)
          return
        }
        voltarParaSala()
        return
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        void alternarFullscreen()
        return
      }
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault()
        setCommentsOpen((open) => !open)
        return
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault()
        setMembersOpen((open) => !open)
        return
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setParticipantStripVisible((visible) => !visible)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [voltarParaSala, revelarChrome, commentsOpen, membersOpen, alternarFullscreen])

  const dockBtn = (active: boolean) =>
    `inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${
      active
        ? 'bg-[rgb(var(--color-primary))] text-white'
        : 'bg-white/10 text-white hover:bg-white/18'
    }`

  return (
    <div
      ref={rootRef}
      className="relative h-dvh min-h-0 overflow-hidden bg-black text-white"
      onMouseMove={revelarChrome}
      onTouchStart={revelarChrome}
    >
      <div className="absolute inset-0">
        <MeetRoom
          salaId={salaId}
          token={token}
          serverUrl={livekitUrl}
          hostId={hostId}
          isHost={isHost}
          userId={userId}
          userName={userName}
          userAvatarUrl={userAvatarUrl}
          participantProfiles={participantProfiles}
          popoutMode
          chromeVisible={chromeVisible}
          resumeScreenShare={resumeScreenShare}
          showParticipantStrip={participantStripVisible}
          onToggleParticipantStrip={() => {
            setParticipantStripVisible((visible) => !visible)
            revelarChrome()
          }}
          onLeaveCall={voltarParaSala}
        />
      </div>

      {/* Menu vertical à direita do vídeo */}
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 z-50 flex items-center pr-3 transition-all duration-200 ${
          chromeVisible ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-2 opacity-0'
        }`}
      >
        <div
          className={`pointer-events-auto flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-zinc-950/35 p-1.5 shadow-xl backdrop-blur-md ${
            chromeVisible ? '' : 'pointer-events-none'
          }`}
        >
          <button
            type="button"
            onClick={() => setCommentsOpen((open) => !open)}
            aria-pressed={commentsOpen}
            title="Chat (C)"
            className={dockBtn(commentsOpen)}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMembersOpen((open) => !open)}
            aria-pressed={membersOpen}
            title="Membros (M)"
            className={dockBtn(membersOpen)}
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void alternarFullscreen()}
            aria-pressed={isBrowserFullscreen}
            title={isBrowserFullscreen ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'}
            className={dockBtn(isBrowserFullscreen)}
          >
            {isBrowserFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={voltarParaSala}
            title="Voltar à sala (Esc)"
            className={dockBtn(false)}
          >
            <ArrowLeftToLine className="h-4 w-4" />
          </button>
        </div>
      </div>

      {commentsOpen ? (
        <aside
          className={`absolute bottom-24 right-16 top-16 z-40 flex w-[min(100%-5rem,20rem)] flex-col overflow-hidden rounded-2xl ${panelGlass}`}
          aria-label="Chat da sala"
          onMouseEnter={() => {
            panelHoverRef.current = true
            setChromeVisible(true)
            if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
          }}
          onMouseLeave={() => {
            panelHoverRef.current = false
            revelarChrome()
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-100">
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </h2>
            <button
              type="button"
              onClick={() => setCommentsOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-zinc-100 hover:bg-white/15"
              aria-label="Fechar chat"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <SalaChat
              salaId={salaId}
              currentUserId={userId}
              isHost={isHost}
              initialMensagens={initialMensagens}
              listClassName="h-[calc(100%-3.25rem)] max-h-none space-y-3 overflow-y-auto pr-1"
            />
          </div>
        </aside>
      ) : null}

      {membersOpen ? (
        <aside
          className={`absolute bottom-24 top-16 z-40 flex w-[min(100%-5rem,16rem)] flex-col overflow-hidden rounded-2xl ${panelGlass} ${
            commentsOpen ? 'right-[calc(min(100%-5rem,20rem)+4.5rem)]' : 'right-16'
          }`}
          aria-label="Membros online"
          onMouseEnter={() => {
            panelHoverRef.current = true
            setChromeVisible(true)
            if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
          }}
          onMouseLeave={() => {
            panelHoverRef.current = false
            revelarChrome()
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-100">
              <Users className="h-3.5 w-3.5" />
              Membros
            </h2>
            <button
              type="button"
              onClick={() => setMembersOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-zinc-100 hover:bg-white/15"
              aria-label="Fechar membros"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <SalaParticipantes
              salaId={salaId}
              initialParticipantes={initialParticipantes}
              onCountChange={() => undefined}
            />
          </div>
        </aside>
      ) : null}
    </div>
  )
}

export function SalaPopoutLoading() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-black">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      <p className="inline-flex items-center gap-1.5 text-sm text-zinc-500">
        <Video className="h-4 w-4" />
        Abrindo janela de vídeo…
      </p>
    </div>
  )
}
