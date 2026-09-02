'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { AnimatePresence, m, type Variants } from 'motion/react'
import { ChevronDown, ExternalLink, MessageCircle } from 'lucide-react'
import type { InboxItemDto } from '@/lib/mensageria-client'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import { useInboxStream } from '@/lib/use-mensagem-stream'
import { springGentle, springSnappy } from '@/lib/motion-presets'
import { MensagensShell } from './mensagens-shell'

/** Só altura — opacity no collapse multiplicava e podia deixar a thread “em branco”. */
const collapsePanelHeight: Variants = {
  hidden: { height: 0 },
  show: { height: 'auto' },
  exit: { height: 0 },
}

const STORAGE_KEY = 'comunidade-chat-expanded'
const listeners = new Set<() => void>()

function emitChange() {
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function getServerSnapshot() {
  return false
}

function setStoredExpanded(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // ignore
  }
  emitChange()
}

interface ComunidadeChatPanelProps {
  currentUserId: string
  /** Quando false (rail oculta fora do feed), não abre SSE nem polling de inbox. */
  liveUpdates?: boolean
  podeCriarGrupo?: boolean
}

type BloqueioInbox = 'nenhum' | 'cadastro_pendente' | 'sem_vinculo' | 'cadastro_reprovado'

function aplicarBloqueioResumo(data: {
  cadastroPendente?: boolean
  semVinculo?: boolean
  cadastroReprovado?: boolean
}): BloqueioInbox {
  if (data.cadastroPendente) return 'cadastro_pendente'
  if (data.semVinculo) return 'sem_vinculo'
  if (data.cadastroReprovado) return 'cadastro_reprovado'
  return 'nenhum'
}

export function ComunidadeChatPanel({
  currentUserId,
  liveUpdates = true,
  podeCriarGrupo = false,
}: ComunidadeChatPanelProps) {
  const expanded = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [conversas, setConversas] = useState<InboxItemDto[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [bloqueioInbox, setBloqueioInbox] = useState<BloqueioInbox>('nenhum')
  const [carregandoInbox, setCarregandoInbox] = useState(false)
  const [inboxCarregada, setInboxCarregada] = useState(false)
  const inboxCarregandoRef = useRef(false)

  const carregarResumo = useCallback(async () => {
    try {
      const res = await fetch('/api/conversas/resumo', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as {
        naoLidas?: number
        cadastroPendente?: boolean
        semVinculo?: boolean
        cadastroReprovado?: boolean
      }
      setBloqueioInbox(aplicarBloqueioResumo(data))
      if (typeof data.naoLidas === 'number') setNaoLidas(data.naoLidas)
    } catch {
      // silencioso
    }
  }, [])

  const carregarInboxCompleta = useCallback(async (mostrarSkeleton: boolean) => {
    if (inboxCarregandoRef.current) return
    inboxCarregandoRef.current = true
    if (mostrarSkeleton) setCarregandoInbox(true)
    try {
      const res = await fetch('/api/conversas', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as {
        conversas?: InboxItemDto[]
        cadastroPendente?: boolean
        semVinculo?: boolean
        cadastroReprovado?: boolean
      }
      setBloqueioInbox(aplicarBloqueioResumo(data))
      if (data.conversas) {
        setConversas(data.conversas)
        setNaoLidas(data.conversas.reduce((acc, c) => acc + c.naoLidas, 0))
      }
      setInboxCarregada(true)
    } catch {
      // silencioso
    } finally {
      inboxCarregandoRef.current = false
      setCarregandoInbox(false)
    }
  }, [])

  useEffect(() => {
    if (!liveUpdates) return
    const timer = window.setTimeout(() => void carregarResumo(), 0)
    return () => window.clearTimeout(timer)
  }, [carregarResumo, liveUpdates])

  useVisibleInterval(() => {
    void carregarResumo()
  }, 60_000, liveUpdates && !expanded)

  useInboxStream(() => {
    void carregarResumo()
  }, liveUpdates && !expanded)

  useEffect(() => {
    if (!expanded) return
    if (bloqueioInbox !== 'nenhum') return
    const timer = window.setTimeout(() => void carregarInboxCompleta(!inboxCarregada), 0)
    return () => window.clearTimeout(timer)
  }, [expanded, inboxCarregada, bloqueioInbox, carregarInboxCompleta])

  const onInboxAtualizada = useCallback((itens: InboxItemDto[]) => {
    setConversas(itens)
    setNaoLidas(itens.reduce((acc, c) => acc + c.naoLidas, 0))
  }, [])

  const toggleExpanded = useCallback(() => {
    setStoredExpanded(!getSnapshot())
  }, [])

  const shellPronto = bloqueioInbox !== 'nenhum' || (inboxCarregada && !carregandoInbox)

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="flex items-center gap-2 border-b border-[rgb(var(--border))] px-3 py-2">
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-[rgb(var(--background-subtle))]"
          aria-expanded={expanded}
        >
          <MessageCircle className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
          <span className="portal-display text-sm text-[rgb(var(--foreground))]">Mensagens</span>
          <AnimatePresence initial={false}>
            {naoLidas > 0 && (
              <m.span
                key={naoLidas > 99 ? '99+' : naoLidas}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={springSnappy}
                className="rounded-full bg-[rgb(var(--color-primary))] px-1.5 py-0.5 text-[10px] font-bold text-[rgb(var(--color-primary-on))]"
              >
                {naoLidas > 99 ? '99+' : naoLidas}
              </m.span>
            )}
          </AnimatePresence>
          <m.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={springSnappy}
            className="ml-auto inline-flex shrink-0"
          >
            <ChevronDown className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          </m.span>
        </button>
        <Link
          href="/portal/mensagens"
          prefetch={false}
          title="Abrir em tela cheia"
          aria-label="Abrir mensagens em tela cheia"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-primary-fg))]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Mantém o shell montado — evita perder estado e refetch lento ao colapsar/expandir */}
      <m.div
        initial={false}
        animate={expanded ? 'show' : 'hidden'}
        variants={collapsePanelHeight}
        transition={springGentle}
        className="overflow-hidden"
        aria-hidden={!expanded}
      >
        <div className="p-2">
        {!shellPronto ? (
          <m.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            className="h-40 rounded-xl bg-[rgb(var(--background-subtle))]"
          />
        ) : bloqueioInbox === 'cadastro_pendente' ? (
          <p className="px-3 py-6 text-center text-xs text-[rgb(var(--foreground-muted))]">
            Seu vínculo ainda está em análise. O chat libera quando a torcida aprovar seu cadastro.
          </p>
        ) : bloqueioInbox === 'cadastro_reprovado' ? (
          <p className="px-3 py-6 text-center text-xs text-[rgb(var(--foreground-muted))]">
            Seu cadastro de associado não está ativo. Entre em contato com a diretoria da torcida.
          </p>
        ) : bloqueioInbox === 'sem_vinculo' ? (
          <p className="px-3 py-6 text-center text-xs text-[rgb(var(--foreground-muted))]">
            Associe-se à torcida para conversar com outros membros.
          </p>
        ) : (
          <MensagensShell
            variant="embedded"
            initialConversas={conversas}
            initialSelecionadaId={null}
            currentUserId={currentUserId}
            inboxPreloaded
            active={expanded}
            onInboxChange={onInboxAtualizada}
            podeCriarGrupo={podeCriarGrupo}
          />
        )}
        </div>
      </m.div>
    </div>
  )
}
