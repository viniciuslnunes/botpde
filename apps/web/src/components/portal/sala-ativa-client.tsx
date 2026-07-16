'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MessageSquare,
  Minimize2,
  Phone,
  Power,
  Users,
  Video,
} from 'lucide-react'
import { MeetRoom } from '@/components/portal/meet-room'
import { SalaChat, type SalaMensagem } from '@/components/portal/sala-chat'
import { SalaEnquete } from '@/components/portal/sala-enquete'
import { SalaParticipantes, type ParticipanteSala } from '@/components/portal/sala-participantes'
import { fadeScale, springSnappy } from '@/lib/motion-presets'

type SalaAtivaClientProps = {
  sala: {
    id: string
    titulo: string
    linkConvite: string
    tipo: string
    criadoEm: string
    criadoEmFormatado: string
    encerradaEm: string | null
    encerradaEmFormatado: string | null
    host: { id: string; nome: string | null }
    evento: { titulo: string } | null
  }
  isHost: boolean
  userId: string
  userName: string
  livekitOk: boolean
  token: string | null
  livekitUrl: string | null
  initialParticipantes: ParticipanteSala[]
  initialMensagens: SalaMensagem[]
  encerrarSalaAction: () => void
}

function callStateKey(
  encerrada: boolean,
  livekitOk: boolean,
  inCall: boolean,
  hasToken: boolean,
): string {
  if (encerrada) return 'encerrada'
  if (!livekitOk) return 'degraded'
  if (inCall && hasToken) return 'call'
  return 'left'
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}

const PRESENTATION_DOCK_BOTTOM =
  'calc(var(--lk-control-bar-height, 4.25rem) + env(safe-area-inset-bottom, 0px) + 0.5rem)'

function SalaChatPanel({
  salaId,
  userId,
  isHost,
  initialMensagens,
  compact = false,
  translucent = false,
  bottomSheet = false,
  commentsOpen = true,
  onToggleComments,
  listClassName,
}: {
  salaId: string
  userId: string
  isHost: boolean
  initialMensagens: SalaMensagem[]
  compact?: boolean
  translucent?: boolean
  bottomSheet?: boolean
  commentsOpen?: boolean
  onToggleComments?: () => void
  listClassName?: string
}) {
  return (
    <section
      className={`border border-[rgb(var(--border))] bg-[rgb(var(--surface))] ${
        bottomSheet
          ? 'flex max-h-[min(52dvh,28rem)] min-h-0 flex-col rounded-t-2xl border-b-0 p-4 shadow-2xl'
          : `rounded-2xl ${compact ? 'flex h-full min-h-0 flex-col p-4' : 'p-5'}`
      } ${
        translucent ? 'border-white/10 bg-zinc-950/72 text-white shadow-2xl backdrop-blur-md' : ''
      }`}
    >
      {bottomSheet ? (
        <div
          className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-white/20"
          aria-hidden
        />
      ) : null}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2
          className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${
            translucent ? 'text-zinc-300' : 'text-[rgb(var(--foreground-muted))]'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Chat da sala
        </h2>
        {onToggleComments ? (
          <button
            type="button"
            onClick={onToggleComments}
            title={commentsOpen ? 'Ocultar comentários' : 'Mostrar comentários'}
            aria-label={commentsOpen ? 'Ocultar comentários' : 'Mostrar comentários'}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
              translucent
                ? 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'
                : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]'
            }`}
          >
            {commentsOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      <div className={compact || bottomSheet ? 'min-h-0 flex-1 overflow-hidden' : ''}>
        <SalaChat
          salaId={salaId}
          currentUserId={userId}
          isHost={isHost}
          initialMensagens={initialMensagens}
          listClassName={
            listClassName ??
            (bottomSheet
              ? 'max-h-[min(36dvh,18rem)] space-y-3 overflow-y-auto pr-1'
              : compact
                ? 'h-full max-h-none space-y-3 overflow-y-auto pr-1'
                : undefined)
          }
        />
      </div>
    </section>
  )
}

export function SalaAtivaClient({
  sala,
  isHost,
  userId,
  userName,
  livekitOk,
  token,
  livekitUrl,
  initialParticipantes,
  initialMensagens,
  encerrarSalaAction,
}: SalaAtivaClientProps) {
  const [onlineCount, setOnlineCount] = useState(initialParticipantes.length)
  const [inCall, setInCall] = useState(true)
  const [callKey, setCallKey] = useState(0)
  const [hasActiveScreenShare, setHasActiveScreenShare] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const [presentationCommentsOpen, setPresentationCommentsOpen] = useState(true)
  const [presentationParticipantsVisible, setPresentationParticipantsVisible] = useState(true)
  const [presentationChromeVisible, setPresentationChromeVisible] = useState(true)
  const idleTimerRef = useRef<number | null>(null)
  const isCompactPresentation = useMediaQuery('(max-width: 1023px)')
  const presentationActive = presentationMode && inCall && hasActiveScreenShare
  const participantProfiles = Object.fromEntries(
    initialParticipantes.map((participante) => [
      participante.userId,
      { nome: participante.nome, avatarUrl: participante.avatarUrl },
    ]),
  )

  const handleCountChange = useCallback((count: number) => {
    setOnlineCount(count)
  }, [])

  const handleLeaveCall = useCallback(() => {
    setInCall(false)
    setPresentationMode(false)
    setPresentationChromeVisible(true)
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const handleRejoinCall = useCallback(() => {
    setCallKey((k) => k + 1)
    setInCall(true)
  }, [])

  const handleScreenShareActiveChange = useCallback((active: boolean) => {
    setHasActiveScreenShare(active)
    if (!active) {
      setPresentationMode(false)
      setPresentationChromeVisible(true)
    }
  }, [])

  const abrirModoApresentacao = useCallback(() => {
    const compact = window.matchMedia('(max-width: 1023px)').matches
    setPresentationMode(true)
    setPresentationCommentsOpen(!compact)
    setPresentationParticipantsVisible(!compact)
    setPresentationChromeVisible(true)
  }, [])

  const fecharModoApresentacao = useCallback(() => {
    setPresentationMode(false)
    setPresentationChromeVisible(true)
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const revelarChromeApresentacao = useCallback(() => {
    setPresentationChromeVisible(true)
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      setPresentationChromeVisible(false)
    }, 1600)
  }, [])

  useEffect(() => {
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!presentationActive) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [presentationActive])

  useEffect(() => {
    if (!presentationActive || isCompactPresentation) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        fecharModoApresentacao()
        return
      }

      if (event.key.toLowerCase() === 'c') {
        event.preventDefault()
        setPresentationCommentsOpen((open) => !open)
        revelarChromeApresentacao()
        return
      }

      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setPresentationParticipantsVisible((visible) => !visible)
        revelarChromeApresentacao()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [presentationActive, isCompactPresentation, fecharModoApresentacao, revelarChromeApresentacao])

  const stateKey = callStateKey(Boolean(sala.encerradaEm), livekitOk, inCall, Boolean(token && livekitUrl))

  return (
    <div className={presentationActive ? 'fixed inset-0 z-40 overflow-hidden bg-black' : 'space-y-6'}>
      {!presentationActive && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/portal/comunidade/salas"
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para salas
            </Link>
            <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{sala.titulo}</h1>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
              Anfitrião: {sala.host.nome ?? 'Membro'} · {onlineCount} participante(s) online
            </p>
          </div>

          {isHost && !sala.encerradaEm && (
            <form action={encerrarSalaAction}>
              <m.button
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                <Power className="h-4 w-4" />
                Encerrar sala
              </m.button>
            </form>
          )}
        </div>
      )}

      {!presentationActive && sala.evento && (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSnappy}
          className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-sm text-[rgb(var(--foreground))]"
        >
          Sala vinculada ao evento <strong>{sala.evento.titulo}</strong>
        </m.div>
      )}

      <AnimatePresence mode="wait">
        {stateKey === 'encerrada' ? (
          <m.div
            key="encerrada"
            variants={fadeScale}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
            className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center"
          >
            <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
              Esta sala foi encerrada em{' '}
              <span suppressHydrationWarning>{sala.encerradaEmFormatado}</span>
            </p>
          </m.div>
        ) : stateKey === 'degraded' ? (
          <m.div
            key="degraded"
            variants={fadeScale}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
            className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950"
          >
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Vídeo indisponível — LiveKit não configurado neste ambiente.
            </p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              O chat da sala abaixo continua funcionando.
            </p>
          </m.div>
        ) : stateKey === 'call' ? (
          <div key="call" className={presentationActive ? 'space-y-0' : 'space-y-3'}>
            <m.section
              variants={fadeScale}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={springSnappy}
              className={
                presentationActive
                  ? 'fixed inset-0 z-0 overflow-hidden rounded-none border-none bg-black'
                  : 'overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm'
              }
            >
              <MeetRoom
                key={callKey}
                salaId={sala.id}
                token={token!}
                serverUrl={livekitUrl!}
                hostId={sala.host.id}
                isHost={isHost}
                userId={userId}
                userName={userName}
                participantProfiles={participantProfiles}
                presentationMode={presentationActive}
                showParticipantStrip={presentationParticipantsVisible}
                canTogglePresentation={hasActiveScreenShare}
                onTogglePresentation={presentationActive ? fecharModoApresentacao : abrirModoApresentacao}
                onToggleParticipantStrip={() =>
                  setPresentationParticipantsVisible((visible) => !visible)
                }
                onOnlineCountChange={handleCountChange}
                onScreenShareActiveChange={handleScreenShareActiveChange}
                onLeaveCall={handleLeaveCall}
              />
            </m.section>
          </div>
        ) : (
          <m.section
            key="left"
            variants={fadeScale}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={springSnappy}
            className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8"
          >
            <div className="mx-auto max-w-lg text-center">
              <Phone className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
              <h2 className="text-lg font-semibold text-[rgb(var(--foreground))]">
                Você saiu da chamada
              </h2>
              <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
                Ainda pode acompanhar o chat, enquetes e quem está online na sala.
              </p>
              <m.button
                type="button"
                onClick={handleRejoinCall}
                whileTap={{ scale: 0.96 }}
                transition={springSnappy}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-white"
              >
                <Video className="h-4 w-4" />
                Entrar na chamada novamente
              </m.button>
            </div>
          </m.section>
        )}
      </AnimatePresence>

      {!sala.encerradaEm && (
        <>
          <AnimatePresence>
            {presentationActive && (
              <m.div
                key="presentation-mode"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={springSnappy}
                className="fixed inset-0 z-50 pointer-events-none"
                style={{
                  paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
                }}
                onMouseMove={revelarChromeApresentacao}
                onMouseEnter={revelarChromeApresentacao}
                onTouchStart={revelarChromeApresentacao}
              >
                <div className="hidden h-full p-3 md:p-5 lg:flex lg:flex-col lg:gap-3">
                  <AnimatePresence initial={false}>
                    {presentationChromeVisible && (
                      <m.div
                        key="presentation-topbar-desktop"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={springSnappy}
                        className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-zinc-950/72 px-4 py-3 text-white shadow-xl backdrop-blur-md"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{sala.titulo}</p>
                          <p className="text-xs text-zinc-400">
                            Modo apresentação ·{' '}
                            {presentationCommentsOpen ? 'comentários visíveis' : 'comentários ocultos'}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            Atalhos:{' '}
                            <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">Esc</kbd> sair,{' '}
                            <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">C</kbd> comentários,{' '}
                            <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">P</kbd> participantes
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            title={
                              presentationParticipantsVisible
                                ? 'Ocultar participantes laterais (P)'
                                : 'Mostrar participantes laterais (P)'
                            }
                            onClick={() =>
                              setPresentationParticipantsVisible((visible) => !visible)
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                          >
                            {presentationParticipantsVisible ? (
                              <>
                                <ChevronLeft className="h-4 w-4" />
                                Tela 100%
                              </>
                            ) : (
                              <>
                                <ChevronRight className="h-4 w-4" />
                                Mostrar participantes
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            title="Sair da tela cheia (Esc)"
                            onClick={fecharModoApresentacao}
                            className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-3 py-2 text-sm font-semibold text-white"
                          >
                            <Minimize2 className="h-4 w-4" />
                            Sair da tela cheia
                          </button>
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>

                  <div className="flex min-h-0 flex-1 gap-3">
                    <div className="hidden flex-1 lg:block" aria-hidden />
                    {!presentationCommentsOpen && (
                      <div className="pointer-events-auto flex h-full items-start">
                        <button
                          type="button"
                          title="Mostrar comentários (C)"
                          onClick={() => setPresentationCommentsOpen(true)}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/66 px-3 py-2 text-sm font-semibold text-white shadow-xl backdrop-blur-md transition hover:bg-zinc-900/80"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Mostrar comentários
                        </button>
                      </div>
                    )}
                    <AnimatePresence initial={false}>
                      {presentationCommentsOpen && (
                        <m.div
                          key="presentation-comments-desktop"
                          initial={{ opacity: 0, x: 24 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 24 }}
                          transition={springSnappy}
                          className="pointer-events-auto h-full min-h-0 w-[380px]"
                        >
                          <SalaChatPanel
                            salaId={sala.id}
                            userId={userId}
                            isHost={isHost}
                            initialMensagens={initialMensagens}
                            compact
                            translucent
                            commentsOpen={presentationCommentsOpen}
                            onToggleComments={() => setPresentationCommentsOpen((open) => !open)}
                          />
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex h-full flex-col lg:hidden">
                  <AnimatePresence initial={false}>
                    {presentationChromeVisible && (
                      <m.div
                        key="presentation-topbar-mobile"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={springSnappy}
                        className="pointer-events-auto mx-3 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-zinc-950/72 px-3 py-2.5 text-white shadow-xl backdrop-blur-md"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{sala.titulo}</p>
                          <p className="truncate text-xs text-zinc-400">Modo apresentação</p>
                        </div>
                        <button
                          type="button"
                          title="Sair da tela cheia"
                          aria-label="Sair da tela cheia"
                          onClick={fecharModoApresentacao}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary))] text-white"
                        >
                          <Minimize2 className="h-4 w-4" />
                        </button>
                      </m.div>
                    )}
                  </AnimatePresence>

                  <div className="flex-1" aria-hidden />

                  <AnimatePresence initial={false}>
                    {presentationCommentsOpen && (
                      <>
                        <m.button
                          key="presentation-chat-backdrop"
                          type="button"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={springSnappy}
                          aria-label="Fechar comentários"
                          className="pointer-events-auto fixed inset-0 bg-black/45"
                          style={{ bottom: PRESENTATION_DOCK_BOTTOM }}
                          onClick={() => setPresentationCommentsOpen(false)}
                        />
                        <m.div
                          key="presentation-comments-mobile"
                          initial={{ opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 24 }}
                          transition={springSnappy}
                          className="pointer-events-auto fixed inset-x-0 z-10 px-2"
                          style={{ bottom: PRESENTATION_DOCK_BOTTOM }}
                        >
                          <SalaChatPanel
                            salaId={sala.id}
                            userId={userId}
                            isHost={isHost}
                            initialMensagens={initialMensagens}
                            compact
                            translucent
                            bottomSheet
                            commentsOpen={presentationCommentsOpen}
                            onToggleComments={() => setPresentationCommentsOpen((open) => !open)}
                          />
                        </m.div>
                      </>
                    )}
                  </AnimatePresence>

                  <div
                    className="pointer-events-auto fixed inset-x-0 z-20 px-3"
                    style={{ bottom: PRESENTATION_DOCK_BOTTOM }}
                  >
                    <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/82 p-1.5 shadow-2xl backdrop-blur-md">
                      <button
                        type="button"
                        title={presentationCommentsOpen ? 'Ocultar comentários' : 'Mostrar comentários'}
                        aria-label={presentationCommentsOpen ? 'Ocultar comentários' : 'Mostrar comentários'}
                        aria-pressed={presentationCommentsOpen}
                        onClick={() => {
                          setPresentationCommentsOpen((open) => !open)
                          revelarChromeApresentacao()
                        }}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                          presentationCommentsOpen
                            ? 'bg-[rgb(var(--color-primary))] text-white'
                            : 'bg-white/5 text-white hover:bg-white/10'
                        }`}
                      >
                        <MessageSquare className="h-4 w-4" />
                        Chat
                      </button>
                      <button
                        type="button"
                        title={
                          presentationParticipantsVisible
                            ? 'Ocultar participantes'
                            : 'Mostrar participantes'
                        }
                        aria-label={
                          presentationParticipantsVisible
                            ? 'Ocultar participantes'
                            : 'Mostrar participantes'
                        }
                        aria-pressed={!presentationParticipantsVisible}
                        onClick={() => {
                          setPresentationParticipantsVisible((visible) => !visible)
                          revelarChromeApresentacao()
                        }}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                          !presentationParticipantsVisible
                            ? 'bg-[rgb(var(--color-primary))] text-white'
                            : 'bg-white/5 text-white hover:bg-white/10'
                        }`}
                      >
                        <Users className="h-4 w-4" />
                        {presentationParticipantsVisible ? 'Tela 100%' : 'Participantes'}
                      </button>
                      <button
                        type="button"
                        title="Sair da tela cheia"
                        aria-label="Sair da tela cheia"
                        onClick={fecharModoApresentacao}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                      >
                        <Minimize2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!inCall && (
              <m.section
                key="participantes-full"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={springSnappy}
                className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
              >
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  <Users className="h-4 w-4" />
                  Participantes na sala
                </h2>
                <SalaParticipantes
                  salaId={sala.id}
                  initialParticipantes={initialParticipantes}
                  onCountChange={handleCountChange}
                />
              </m.section>
            )}
          </AnimatePresence>

          {!presentationActive && (
            <>
              <SalaEnquete salaId={sala.id} isHost={isHost} />

              <div className={`grid gap-4 ${inCall ? 'lg:grid-cols-[1fr_320px]' : 'lg:grid-cols-2'}`}>
                <SalaChatPanel
                  salaId={sala.id}
                  userId={userId}
                  isHost={isHost}
                  initialMensagens={initialMensagens}
                />

                <AnimatePresence>
                  {inCall && (
                    <m.aside
                      key="sidebar"
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 16 }}
                      transition={springSnappy}
                      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
                    >
                      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        <Users className="h-4 w-4" />
                        Participantes online
                      </h2>
                      <SalaParticipantes
                        salaId={sala.id}
                        initialParticipantes={initialParticipantes}
                        onCountChange={handleCountChange}
                      />

                      <dl className="mt-6 space-y-2 border-t border-[rgb(var(--border))] pt-4 text-sm">
                        <div>
                          <dt className="text-[rgb(var(--foreground-muted))]">Convite</dt>
                          <dd className="font-mono text-[rgb(var(--foreground))]">{sala.linkConvite}</dd>
                        </div>
                        <div>
                          <dt className="text-[rgb(var(--foreground-muted))]">Criada em</dt>
                          <dd className="text-[rgb(var(--foreground))]" suppressHydrationWarning>
                            {sala.criadoEmFormatado}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[rgb(var(--foreground-muted))]">Tipo</dt>
                          <dd className="text-[rgb(var(--foreground))]">{sala.tipo}</dd>
                        </div>
                      </dl>
                    </m.aside>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
