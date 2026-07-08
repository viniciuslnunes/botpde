'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'

export type SalaMensagem = {
  id: string
  conteudo: string
  criadoEm: string
  autor: { id: string; nome: string | null; avatarUrl: string | null }
}

interface SalaChatProps {
  salaId: string
  currentUserId: string
  initialMensagens: SalaMensagem[]
}

function formatarHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export function SalaChat({ salaId, currentUserId, initialMensagens }: SalaChatProps) {
  const [mensagens, setMensagens] = useState<SalaMensagem[]>(() =>
    [...initialMensagens].sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
    ),
  )
  const [conteudo, setConteudo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lastCriadoEmRef = useRef<string | null>(
    initialMensagens.length > 0
      ? [...initialMensagens].sort(
          (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
        )[0]?.criadoEm ?? null
      : null,
  )

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [mensagens, scrollToBottom])

  const mergeMensagens = useCallback((novas: SalaMensagem[]) => {
    if (novas.length === 0) return
    setMensagens((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]))
      for (const msg of novas) map.set(msg.id, msg)
      const merged = [...map.values()].sort(
        (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
      )
      const last = merged[merged.length - 1]
      if (last) lastCriadoEmRef.current = last.criadoEm
      return merged
    })
  }, [])

  useEffect(() => {
    let active = true

    async function poll() {
      const after = lastCriadoEmRef.current
      const url = after
        ? `/api/salas/${salaId}/mensagens?after=${encodeURIComponent(after)}`
        : `/api/salas/${salaId}/mensagens`

      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok || !active) return
        const data = (await res.json()) as { mensagens?: SalaMensagem[] }
        if (data.mensagens?.length) mergeMensagens(data.mensagens)
      } catch {
        // polling silencioso
      }
    }

    const id = window.setInterval(poll, 2500)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [salaId, mergeMensagens])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const texto = conteudo.trim()
    if (!texto || enviando) return

    const tempId = `temp-${Date.now()}`
    const otimista: SalaMensagem = {
      id: tempId,
      conteudo: texto,
      criadoEm: new Date().toISOString(),
      autor: { id: currentUserId, nome: 'Você', avatarUrl: null },
    }

    setConteudo('')
    setErro(null)
    setEnviando(true)
    setMensagens((prev) => [...prev, otimista])

    try {
      const res = await fetch(`/api/salas/${salaId}/mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: texto }),
      })
      const data = (await res.json()) as { mensagem?: SalaMensagem; error?: string }
      if (!res.ok || !data.mensagem) {
        throw new Error(data.error ?? 'Erro ao enviar mensagem.')
      }

      setMensagens((prev) => {
        const next = prev
          .filter((m) => m.id !== tempId)
          .concat(data.mensagem!)
          .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime())
        const last = next[next.length - 1]
        if (last) lastCriadoEmRef.current = last.criadoEm
        return next
      })
    } catch (error) {
      setMensagens((prev) => prev.filter((m) => m.id !== tempId))
      setConteudo(texto)
      setErro(error instanceof Error ? error.message : 'Erro ao enviar mensagem.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <input
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          required
          maxLength={800}
          disabled={enviando}
          placeholder="Escreva uma mensagem para o grupo"
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={enviando || !conteudo.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[rgb(var(--color-primary))] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar
        </button>
      </form>

      {erro && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      )}

      {mensagens.length === 0 ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem mensagens ainda.</p>
      ) : (
        <div ref={listRef} className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {mensagens.map((mensagem) => (
            <div
              key={mensagem.id}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3"
            >
              <div className="mb-1 text-xs text-[rgb(var(--foreground-muted))]">
                {mensagem.autor.id === currentUserId ? 'Você' : (mensagem.autor.nome ?? 'Membro')} ·{' '}
                {formatarHora(mensagem.criadoEm)}
              </div>
              <p className="whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                {mensagem.conteudo}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
