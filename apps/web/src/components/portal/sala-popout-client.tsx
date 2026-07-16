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
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-4 py-2.5">
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

      <div className="flex min-h-0 flex-1">
        <main className="relative min-h-0 min-w-0 flex-1">
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
          {commentsOpen && (
            <m.aside
              key="popout-chat"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={springSnappy}
              className="hidden h-full min-h-0 shrink-0 overflow-hidden border-l border-white/10 bg-zinc-950/95 md:block"
            >
              <div className="flex h-full min-h-0 w-[360px] flex-col p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
                  <MessageSquare className="h-4 w-4" />
                  Chat da sala
                </h2>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <SalaChat
                    salaId={salaId}
                    currentUserId={userId}
                    isHost={isHost}
                    initialMensagens={initialMensagens}
                    listClassName="h-full max-h-none space-y-3 overflow-y-auto pr-1"
                  />
                </div>
              </div>
            </m.aside>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {membersOpen && (
            <m.aside
              key="popout-members"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={springSnappy}
              className="hidden h-full min-h-0 shrink-0 overflow-hidden border-l border-white/10 bg-zinc-950/95 lg:block"
            >
              <div className="flex h-full min-h-0 w-[280px] flex-col p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
                  <Users className="h-4 w-4" />
                  Membros online
                </h2>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <SalaParticipantes
                    salaId={salaId}
                    initialParticipantes={initialParticipantes}
                    onCountChange={setOnlineCount}
                  />
                </div>
              </div>
            </m.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile: bottom sheets for chat/members */}
      <AnimatePresence>
        {commentsOpen && (
          <m.div
            key="mobile-chat"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={springSnappy}
            className="fixed inset-x-0 bottom-0 z-30 max-h-[48dvh] border-t border-white/10 bg-zinc-950 p-4 md:hidden"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
                <MessageSquare className="h-4 w-4" />
                Chat
              </h2>
              <button
                type="button"
                onClick={() => setCommentsOpen(false)}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-300"
              >
                Fechar
              </button>
            </div>
            <SalaChat
              salaId={salaId}
              currentUserId={userId}
              isHost={isHost}
              initialMensagens={initialMensagens}
              listClassName="max-h-[28dvh] space-y-3 overflow-y-auto pr-1"
            />
          </m.div>
        )}
      </AnimatePresence>
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
