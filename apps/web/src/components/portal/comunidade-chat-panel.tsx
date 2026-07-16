'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ChevronDown, ExternalLink, MessageCircle } from 'lucide-react'
import type { InboxItemDto } from '@/lib/mensageria-client'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import { MensagensShell } from './mensagens-shell'

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

export function ComunidadeChatPanel({ currentUserId }: ComunidadeChatPanelProps) {
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
    const timer = window.setTimeout(() => void carregarResumo(), 0)
    return () => window.clearTimeout(timer)
  }, [carregarResumo])

  useVisibleInterval(() => {
    if (expanded) return
    void carregarResumo()
  }, 15000)

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
          <span className="text-sm font-semibold text-[rgb(var(--foreground))]">Mensagens</span>
          {naoLidas > 0 && (
            <span className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {naoLidas > 99 ? '99+' : naoLidas}
            </span>
          )}
          <ChevronDown
            className={[
              'ml-auto h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform',
              expanded ? 'rotate-180' : '',
            ].join(' ')}
          />
        </button>
        <Link
          href="/portal/mensagens"
          prefetch={false}
          title="Abrir em tela cheia"
          aria-label="Abrir mensagens em tela cheia"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--primary))]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Mantém o shell montado — evita perder estado e refetch lento ao colapsar/expandir */}
      <div className={expanded ? 'p-2' : 'hidden'} aria-hidden={!expanded}>
        {!shellPronto ? (
          <div className="h-40 animate-pulse rounded-xl bg-[rgb(var(--background-subtle))]" />
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
            onInboxChange={onInboxAtualizada}
          />
        )}
      </div>
    </div>
  )
}
