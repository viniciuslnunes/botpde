'use client'

import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { Ban, Loader2, MessageCircle, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import { lightboxBackdrop, lightboxContent, springGentle } from '@/lib/motion-presets'

interface PerfilMensagemActionsProps {
  userId: string
  /** Pode iniciar DM direta (visibilidade tenant/aliados, sem bloqueio). */
  podeConversar: boolean
  /** Precisa enviar solicitação com mensagem inicial. */
  podeSolicitarMensagem?: boolean
  /** Eu já bloqueei este usuário. */
  bloqueadoPorMim: boolean
}

export function PerfilMensagemActions({
  userId,
  podeConversar,
  podeSolicitarMensagem = false,
  bloqueadoPorMim,
}: PerfilMensagemActionsProps) {
  const router = useRouter()
  const tituloId = useId()
  const [abrindo, setAbrindo] = useState(false)
  const [bloqueado, setBloqueado] = useState(bloqueadoPorMim)
  const [alternando, setAlternando] = useState(false)
  const [mostrarSolicitacao, setMostrarSolicitacao] = useState(false)
  const [mensagemInicial, setMensagemInicial] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  function fecharSolicitacao() {
    setMostrarSolicitacao(false)
    setMensagemInicial('')
  }

  useEffect(() => {
    if (!mostrarSolicitacao) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setMostrarSolicitacao(false)
      setMensagemInicial('')
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [mostrarSolicitacao])

  async function abrirConversa(conteudo?: string) {
    setAbrindo(true)
    try {
      const res = await fetch('/api/conversas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'DIRETA',
          destinatarioId: userId,
          ...(conteudo ? { conteudo } : {}),
        }),
      })
      const data = (await res.json()) as {
        conversaId?: string
        error?: string
        precisaMensagem?: boolean
        solicitacao?: boolean
      }
      if (!res.ok || !data.conversaId) {
        if (data.precisaMensagem) {
          setMostrarSolicitacao(true)
          setAbrindo(false)
          return
        }
        throw new Error(data.error ?? 'Erro ao abrir conversa.')
      }
      if (data.solicitacao) {
        toast.success('Solicitação enviada. Aguarde a aprovação do membro.')
        fecharSolicitacao()
      }
      router.push(`/portal/mensagens?c=${data.conversaId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao abrir conversa.')
      setAbrindo(false)
    }
  }

  async function alternarBloqueio() {
    setAlternando(true)
    try {
      const res = await fetch(`/api/usuarios/${userId}/bloqueio`, {
        method: bloqueado ? 'DELETE' : 'POST',
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erro ao atualizar bloqueio.')
      setBloqueado(!bloqueado)
      toast.success(bloqueado ? 'Usuário desbloqueado.' : 'Usuário bloqueado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar bloqueio.')
    } finally {
      setAlternando(false)
    }
  }

  const podeAcionarMensagem = (podeConversar || podeSolicitarMensagem) && !bloqueado
  const precisaSolicitacao = podeSolicitarMensagem && !podeConversar
  const mensagemPronta = mensagemInicial.trim().length > 0

  const dialog =
    mounted &&
    createPortal(
      <AnimatePresence>
        {mostrarSolicitacao && podeSolicitarMensagem && (
          <m.div
            key="solicitacao-backdrop"
            variants={lightboxBackdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            role="presentation"
            onClick={fecharSolicitacao}
          >
            <m.div
              key="solicitacao-panel"
              variants={lightboxContent}
              initial="hidden"
              animate="show"
              exit="exit"
              transition={springGentle}
              role="dialog"
              aria-modal="true"
              aria-labelledby={tituloId}
              className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pb-[env(safe-area-inset-bottom)] shadow-xl sm:rounded-2xl sm:pb-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-3.5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2
                      id={tituloId}
                      className="text-base font-semibold text-[rgb(var(--foreground))]"
                    >
                      Solicitar conversa
                    </h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
                      Envie uma mensagem inicial. O membro precisa aprovar antes da conversa
                      continuar.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fecharSolicitacao}
                  aria-label="Fechar"
                  className="shrink-0 rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 px-4 py-4">
                <textarea
                  value={mensagemInicial}
                  onChange={(e) => setMensagemInicial(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  autoFocus
                  placeholder="Olá! Gostaria de conversar com você…"
                  className="w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2.5 text-sm leading-relaxed text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))]"
                />
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={fecharSolicitacao}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={abrindo || !mensagemPronta}
                    onClick={() => void abrirConversa(mensagemInicial.trim())}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {abrindo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                    {abrindo ? 'Enviando…' : 'Enviar solicitação'}
                  </button>
                </div>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>,
      document.body,
    )

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {podeAcionarMensagem && (
          <button
            type="button"
            disabled={abrindo}
            onClick={() => {
              if (precisaSolicitacao) {
                setMostrarSolicitacao(true)
                return
              }
              void abrirConversa()
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {abrindo && !mostrarSolicitacao ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            {precisaSolicitacao ? 'Solicitar conversa' : 'Mensagem'}
          </button>
        )}
        <button
          type="button"
          disabled={alternando}
          onClick={() => void alternarBloqueio()}
          className={[
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60',
            bloqueado
              ? 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]'
              : 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30',
          ].join(' ')}
        >
          {alternando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
          {bloqueado ? 'Desbloquear' : 'Bloquear'}
        </button>
      </div>
      {dialog}
    </>
  )
}
