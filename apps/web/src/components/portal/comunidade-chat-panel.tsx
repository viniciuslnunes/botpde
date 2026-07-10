'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ChevronDown, ExternalLink, MessageCircle } from 'lucide-react'
import type { InboxItemDto } from '@/lib/mensageria-client'
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

export function ComunidadeChatPanel({ currentUserId }: ComunidadeChatPanelProps) {
  const expanded = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [conversas, setConversas] = useState<InboxItemDto[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!expanded) return
    let active = true
    async function carregar() {
      try {
        const res = await fetch('/api/conversas', { cache: 'no-store' })
        if (!res.ok || !active) return
        const data = (await res.json()) as { conversas?: InboxItemDto[] }
        if (data.conversas) setConversas(data.conversas)
      } catch {
        // silencioso
      } finally {
        if (active) setCarregando(false)
      }
    }
    setCarregando(true)
    void carregar()
    return () => {
      active = false
    }
  }, [expanded])

  const naoLidas = conversas.reduce((acc, c) => acc + c.naoLidas, 0)

  const toggleExpanded = useCallback(() => {
    setStoredExpanded(!getSnapshot())
  }, [])

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

      {expanded && (
        <div className="p-2">
          {carregando ? (
            <div className="h-40 animate-pulse rounded-xl bg-[rgb(var(--background-subtle))]" />
          ) : (
            <MensagensShell
              variant="embedded"
              initialConversas={conversas}
              initialSelecionadaId={null}
              currentUserId={currentUserId}
            />
          )}
        </div>
      )}
    </div>
  )
}
