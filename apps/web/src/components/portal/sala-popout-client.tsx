'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  ArrowLeftToLine,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Users,
  Video,
  X,
} from 'lucide-react'
import { MeetRoom } from '@/components/portal/meet-room'
import { SalaChat, type SalaMensagem } from '@/components/portal/sala-chat'
import { SalaParticipantes, type ParticipanteSala } from '@/components/portal/sala-participantes'
import { springSnappy } from '@/lib/motion-presets'

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
  const [participantStripVisible, setParticipantStripVisible] = useState(true)
  const [commentsOpen, setCommentsOpen] = useState(true)
  const [membersOpen, setMembersOpen] = useState(false)
  const [onlineCount, setOnlineCount] = useState(initialParticipantes.length)

  const participantProfiles = Object.fromEntries(
    initialParticipantes.map((participante) => [
      participante.userId,
      { nome: participante.nome, avatarUrl: participante.avatarUrl },
    ]),
  )

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

  useEffect(() => {
    document.title = `${titulo} — vídeo`
    window.addEventListener('beforeunload', notificarFechamento)
    return () => {
      window.removeEventListener('beforeunload', notificarFechamento)
      notificarFechamento()
    }
  }, [titulo, notificarFechamento])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        voltarParaSala()
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
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [voltarParaSala])

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-black text-white">
      <header className="relative z-50 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{titulo}</p>
          <p className="text-xs text-zinc-400">
            Janela de vídeo · {onlineCount} online · atalhos Esc / C / M
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCommentsOpen((open) => !open)}
            aria-pressed={commentsOpen}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              commentsOpen
                ? 'border-transparent bg-[rgb(var(--color-primary))] text-white'
                : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'
            }`}
            title="Mostrar ou ocultar chat (C)"
          >
            {commentsOpen ? <EyeOff className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            Chat
          </button>
          <button
            type="button"
            onClick={() => setMembersOpen((open) => !open)}
            aria-pressed={membersOpen}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              membersOpen
                ? 'border-transparent bg-[rgb(var(--color-primary))] text-white'
                : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'
            }`}
            title="Mostrar ou ocultar membros (M)"
          >
            <Users className="h-4 w-4" />
            Membros
          </button>
          <button
            type="button"
            onClick={voltarParaSala}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--color-primary))] px-3 py-2 text-sm font-semibold text-white"
            title="Voltar à visualização da sala (Esc)"
          >
            <ArrowLeftToLine className="h-4 w-4" />
            Voltar à sala
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
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
            resumeScreenShare={resumeScreenShare}
            showParticipantStrip={participantStripVisible}
            onToggleParticipantStrip={() => setParticipantStripVisible((visible) => !visible)}
            onOnlineCountChange={setOnlineCount}
            onLeaveCall={voltarParaSala}
          />
        </main>

        <AnimatePresence initial={false}>
          {commentsOpen ? (
            <m.aside
              key="popout-chat"
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={springSnappy}
              className="absolute inset-y-0 right-0 z-40 flex w-[min(100%,22rem)] flex-col border-l border-white/10 bg-zinc-950 shadow-2xl sm:w-[22rem]"
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
                  <MessageSquare className="h-4 w-4" />
                  Chat da sala
                </h2>
                <button
                  type="button"
                  onClick={() => setCommentsOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:bg-white/10"
                  aria-label="Fechar chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-4">
                <SalaChat
                  salaId={salaId}
                  currentUserId={userId}
                  isHost={isHost}
                  initialMensagens={initialMensagens}
                  listClassName="h-[calc(100%-3.5rem)] max-h-none space-y-3 overflow-y-auto pr-1"
                />
              </div>
            </m.aside>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {membersOpen ? (
            <m.aside
              key="popout-members"
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={springSnappy}
              className={`absolute inset-y-0 z-40 flex w-[min(100%,18rem)] flex-col border-l border-white/10 bg-zinc-950 shadow-2xl sm:w-[18rem] ${
                commentsOpen ? 'right-[min(100%,22rem)] sm:right-[22rem]' : 'right-0'
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
                  <Users className="h-4 w-4" />
                  Membros online
                </h2>
                <button
                  type="button"
                  onClick={() => setMembersOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:bg-white/10"
                  aria-label="Fechar membros"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <SalaParticipantes
                  salaId={salaId}
                  initialParticipantes={initialParticipantes}
                  onCountChange={setOnlineCount}
                />
              </div>
            </m.aside>
          ) : null}
        </AnimatePresence>
      </div>
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
