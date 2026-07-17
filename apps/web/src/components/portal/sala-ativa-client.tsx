'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import {
  AppWindow,
  ArrowLeft,
  MessageSquare,
  Phone,
  Power,
  Users,
  Video,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import { MeetRoom } from '@/components/portal/meet-room'
import { SalaChat, type SalaMensagem } from '@/components/portal/sala-chat'
import { SalaEnquete } from '@/components/portal/sala-enquete'
import { SalaParticipantes, type ParticipanteSala } from '@/components/portal/sala-participantes'
import { useConfirmAction } from '@/lib/confirm-action'
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
  userAvatarUrl?: string | null
  livekitOk: boolean
  token: string | null
  livekitUrl: string | null
  initialParticipantes: ParticipanteSala[]
  initialMensagens: SalaMensagem[]
  encerrarSalaAction: () => Promise<void> | void
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

const VIDEO_POPOUT_NAME = 'sala-video-popout'

function SalaChatPanel({
  salaId,
  userId,
  isHost,
  initialMensagens,
}: {
  salaId: string
  userId: string
  isHost: boolean
  initialMensagens: SalaMensagem[]
}) {
  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        <MessageSquare className="h-4 w-4" />
        Chat da sala
      </h2>
      <SalaChat
        salaId={salaId}
        currentUserId={userId}
        isHost={isHost}
        initialMensagens={initialMensagens}
      />
    </section>
  )
}

export function SalaAtivaClient({
  sala,
  isHost,
  userId,
  userName,
  userAvatarUrl = null,
  livekitOk,
  token,
  livekitUrl,
  initialParticipantes,
  initialMensagens,
  encerrarSalaAction,
}: SalaAtivaClientProps) {
  const router = useRouter()
  const confirmAction = useConfirmAction()
  const [onlineCount, setOnlineCount] = useState(initialParticipantes.length)
  const [inCall, setInCall] = useState(true)
  const [callKey, setCallKey] = useState(0)
  const [hasActiveScreenShare, setHasActiveScreenShare] = useState(false)
  const [resumeScreenAfterPopout, setResumeScreenAfterPopout] = useState(false)
  const [participantStripVisible, setParticipantStripVisible] = useState(true)
  const [videoPopoutOpen, setVideoPopoutOpen] = useState(false)
  const popoutRef = useRef<Window | null>(null)
  const popoutPollRef = useRef<number | null>(null)
  const popoutClosedByMessageRef = useRef(false)

  const participantProfiles = Object.fromEntries(
    initialParticipantes.map((participante) => [
      participante.userId,
      {
        nome: participante.nome,
        avatarUrl:
          participante.avatarUrl ??
          (participante.userId === userId ? userAvatarUrl : null),
      },
    ]),
  )

  const handleCountChange = useCallback((count: number) => {
    setOnlineCount(count)
  }, [])

  const encerrarPopout = useCallback(() => {
    if (popoutPollRef.current !== null) {
      window.clearInterval(popoutPollRef.current)
      popoutPollRef.current = null
    }
    popoutRef.current = null
    setVideoPopoutOpen(false)
  }, [])

  const handleLeaveCall = useCallback(() => {
    setInCall(false)
    setResumeScreenAfterPopout(false)
    encerrarPopout()
  }, [encerrarPopout])

  const handleRejoinCall = useCallback(() => {
    setCallKey((k) => k + 1)
    setInCall(true)
  }, [])

  const handleScreenShareActiveChange = useCallback((active: boolean) => {
    setHasActiveScreenShare(active)
    if (active) {
      setResumeScreenAfterPopout(false)
    }
  }, [])

  const abrirJanelaVideo = useCallback(() => {
    if (videoPopoutOpen && popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.focus()
      return
    }

    const shouldResume = hasActiveScreenShare
    const resumeQuery = shouldResume ? '?resumeScreen=1' : ''
    const popoutUrl = `/video-sala/${sala.id}${resumeQuery}`
    const popout = window.open(
      popoutUrl,
      VIDEO_POPOUT_NAME,
      'popup=yes,width=1440,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes',
    )

    if (!popout) {
      toast.error('Não foi possível abrir a janela de vídeo. Verifique se pop-ups estão permitidos.')
      return
    }

    popoutRef.current = popout
    setVideoPopoutOpen(true)
    // Só retomamos tela ao fechar o popout (mensagem), não ao abrir —
    // o usuário pode ter clicado em "Parar tela" na janela.
    setResumeScreenAfterPopout(false)
    popoutClosedByMessageRef.current = false

    if (popoutPollRef.current !== null) window.clearInterval(popoutPollRef.current)
    popoutPollRef.current = window.setInterval(() => {
      if (!popoutRef.current || popoutRef.current.closed) {
        const alreadyHandled = popoutClosedByMessageRef.current
        encerrarPopout()
        // Sem postMessage (aba fechada à força), remonta sem retomar tela.
        if (!alreadyHandled) setCallKey((k) => k + 1)
      }
    }, 500)
  }, [encerrarPopout, hasActiveScreenShare, sala.id, videoPopoutOpen])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as {
        type?: string
        salaId?: string
        resumeScreen?: boolean
        leftCall?: boolean
      }
      if (data.type === 'sala-video-popout-closed' && data.salaId === sala.id) {
        popoutClosedByMessageRef.current = true
        encerrarPopout()
        if (data.leftCall) {
          setInCall(false)
          setResumeScreenAfterPopout(false)
          return
        }
        setResumeScreenAfterPopout(Boolean(data.resumeScreen))
        setCallKey((k) => k + 1)
      }
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      if (popoutPollRef.current !== null) window.clearInterval(popoutPollRef.current)
    }
  }, [encerrarPopout, sala.id])

  const stateKey = callStateKey(Boolean(sala.encerradaEm), livekitOk, inCall, Boolean(token && livekitUrl))
  const showEmbeddedMeet = stateKey === 'call' && !videoPopoutOpen

  return (
    <div className="space-y-6">
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
          <m.button
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            onClick={() => {
              void confirmAction({
                titulo: 'Encerrar esta sala?',
                descricao: 'Participantes serão desconectados. A sala não pode ser reaberta.',
                labelConfirmar: 'Encerrar',
                variante: 'destructive',
                cancelled: false,
                run: () => Promise.resolve(encerrarSalaAction()),
                success: 'Sala encerrada.',
              }).then((ok) => {
                if (ok) router.refresh()
              })
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            <Power className="h-4 w-4" />
            Encerrar sala
          </m.button>
        )}
      </div>

      {sala.evento && (
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
          <div key="call" className="space-y-3">
            {showEmbeddedMeet ? (
              <m.section
                variants={fadeScale}
                initial="hidden"
                animate="show"
                exit="hidden"
                transition={springSnappy}
                className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm"
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
                  userAvatarUrl={userAvatarUrl}
                  participantProfiles={participantProfiles}
                  showParticipantStrip={participantStripVisible}
                  canOpenVideoPopout
                  onOpenVideoPopout={abrirJanelaVideo}
                  onToggleParticipantStrip={() =>
                    setParticipantStripVisible((visible) => !visible)
                  }
                  onOnlineCountChange={handleCountChange}
                  onScreenShareActiveChange={handleScreenShareActiveChange}
                  resumeScreenShare={resumeScreenAfterPopout}
                  onLeaveCall={handleLeaveCall}
                />
              </m.section>
            ) : (
              <m.section
                key="video-popout-placeholder"
                variants={fadeScale}
                initial="hidden"
                animate="show"
                exit="hidden"
                transition={springSnappy}
                className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center"
              >
                <AppWindow className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
                <h2 className="text-lg font-semibold text-[rgb(var(--foreground))]">
                  Vídeo aberto em outra janela
                </h2>
                <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
                  O chat e os participantes continuam nesta página. Feche a janela de vídeo para voltar aqui.
                </p>
                <m.button
                  type="button"
                  onClick={abrirJanelaVideo}
                  whileTap={{ scale: 0.96 }}
                  transition={springSnappy}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-2 text-sm font-semibold text-[rgb(var(--foreground))]"
                >
                  <AppWindow className="h-4 w-4" />
                  Focar janela de vídeo
                </m.button>
              </m.section>
            )}
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
    </div>
  )
}
