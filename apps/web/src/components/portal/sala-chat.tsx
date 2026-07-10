'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Pin, Send, Trash2, Pencil } from 'lucide-react'
import { toast } from '@torcida/ui'
import { formatDateTimeShort } from '@/lib/format-datetime'

export type SalaMensagem = {
  id: string
  conteudo: string
  criadoEm: string
  criadoEmFormatado?: string
  editadaEm: string | null
  destacada: boolean
  autor: { id: string; nome: string | null; avatarUrl: string | null }
}

interface SalaChatProps {
  salaId: string
  currentUserId: string
  isHost: boolean
  initialMensagens: SalaMensagem[]
}

function isMensagemTemporaria(id: string): boolean {
  return id.startsWith('temp-')
}

function ordenarMensagens(lista: SalaMensagem[]): SalaMensagem[] {
  return [...lista].sort((a, b) => {
    if (a.destacada !== b.destacada) return a.destacada ? -1 : 1
    return new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()
  })
}

function mesclarComServidor(prev: SalaMensagem[], server: SalaMensagem[]): SalaMensagem[] {
  const pendentes = prev.filter((m) => isMensagemTemporaria(m.id))
  return ordenarMensagens([...server, ...pendentes])
}

function ultimaMensagemServidor(lista: SalaMensagem[]): string | null {
  const server = lista.filter((m) => !isMensagemTemporaria(m.id))
  if (server.length === 0) return null
  return [...server].sort(
    (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
  )[0]?.criadoEm ?? null
}

export function SalaChat({ salaId, currentUserId, isHost, initialMensagens }: SalaChatProps) {
  const [mensagens, setMensagens] = useState<SalaMensagem[]>(() => ordenarMensagens(initialMensagens))
  const [conteudo, setConteudo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoTexto, setEditandoTexto] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const lastCriadoEmRef = useRef<string | null>(ultimaMensagemServidor(initialMensagens))

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [mensagens, scrollToBottom])

  useEffect(() => {
    let active = true

    async function sincronizar() {
      if (document.visibilityState !== 'visible') return
      const after = lastCriadoEmRef.current
      const url = after
        ? `/api/salas/${salaId}/mensagens?after=${encodeURIComponent(after)}`
        : `/api/salas/${salaId}/mensagens?full=1`

      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok || !active) return
        const data = (await res.json()) as { mensagens?: SalaMensagem[] }
        if (!data.mensagens?.length) return

        setMensagens((prev) => {
          const merged = after
            ? ordenarMensagens([
                ...prev.filter((m) => !data.mensagens!.some((n) => n.id === m.id)),
                ...data.mensagens!.map((m) => ({
                  ...m,
                  criadoEmFormatado: formatDateTimeShort(m.criadoEm),
                })),
              ])
            : mesclarComServidor(
                prev,
                data.mensagens!.map((m) => ({
                  ...m,
                  criadoEmFormatado: formatDateTimeShort(m.criadoEm),
                })),
              )
          const last = ultimaMensagemServidor(merged)
          if (last) lastCriadoEmRef.current = last
          return merged
        })
      } catch {
        // polling silencioso
      }
    }

    async function sincronizarCompleto() {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`/api/salas/${salaId}/mensagens?full=1`, { cache: 'no-store' })
        if (!res.ok || !active) return
        const data = (await res.json()) as { mensagens?: SalaMensagem[] }
        if (!data.mensagens) return

        setMensagens((prev) => {
          const merged = mesclarComServidor(
            prev,
            data.mensagens!.map((m) => ({
              ...m,
              criadoEmFormatado: formatDateTimeShort(m.criadoEm),
            })),
          )
          const last = ultimaMensagemServidor(merged)
          if (last) lastCriadoEmRef.current = last
          return merged
        })
      } catch {
        // polling silencioso
      }
    }

    void sincronizar()
    const novasId = window.setInterval(sincronizar, 3000)
    const fullId = window.setInterval(sincronizarCompleto, 15000)
    return () => {
      active = false
      window.clearInterval(novasId)
      window.clearInterval(fullId)
    }
  }, [salaId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const texto = conteudo.trim()
    if (!texto || enviando) return

    const tempId = `temp-${Date.now()}`
    const otimista: SalaMensagem = {
      id: tempId,
      conteudo: texto,
      criadoEm: new Date().toISOString(),
      criadoEmFormatado: formatDateTimeShort(new Date()),
      editadaEm: null,
      destacada: false,
      autor: { id: currentUserId, nome: 'Você', avatarUrl: null },
    }

    setConteudo('')
    setErro(null)
    setEnviando(true)
    setMensagens((prev) => ordenarMensagens([...prev, otimista]))

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
        const next = ordenarMensagens(
          prev.filter((m) => m.id !== tempId).concat({
            ...data.mensagem!,
            criadoEmFormatado: formatDateTimeShort(data.mensagem!.criadoEm),
          }),
        )
        const last = ultimaMensagemServidor(next)
        if (last) lastCriadoEmRef.current = last
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

  async function moderar(
    mensagemId: string,
    body: { conteudo?: string; destacada?: boolean },
    remover = false,
  ) {
    if (isMensagemTemporaria(mensagemId)) return

    if (remover) {
      const res = await fetch(`/api/salas/${salaId}/mensagens/${mensagemId}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Não foi possível excluir a mensagem.')
        return
      }
      setMensagens((prev) => prev.filter((m) => m.id !== mensagemId))
      toast.success('Mensagem removida.')
      return
    }

    const res = await fetch(`/api/salas/${salaId}/mensagens/${mensagemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { mensagem?: SalaMensagem; error?: string }
    if (!res.ok || !data.mensagem) {
      toast.error(data.error ?? 'Erro ao atualizar mensagem.')
      return
    }

    setMensagens((prev) =>
      ordenarMensagens(
        prev.map((m) =>
          m.id === mensagemId
            ? {
                ...data.mensagem!,
                criadoEmFormatado: formatDateTimeShort(data.mensagem!.criadoEm),
              }
            : m,
        ),
      ),
    )
    setEditandoId(null)
    toast.success(body.destacada !== undefined ? 'Destaque atualizado.' : 'Mensagem editada.')
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
          {mensagens.map((mensagem) => {
            const temporaria = isMensagemTemporaria(mensagem.id)
            return (
              <div
                key={mensagem.id}
                className={`rounded-xl border p-3 ${
                  mensagem.destacada
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]'
                } ${temporaria ? 'opacity-80' : ''}`}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-[rgb(var(--foreground-muted))]" suppressHydrationWarning>
                    {mensagem.autor.id === currentUserId ? 'Você' : (mensagem.autor.nome ?? 'Membro')} ·{' '}
                    {mensagem.criadoEmFormatado ?? formatDateTimeShort(mensagem.criadoEm)}
                    {temporaria && ' · enviando…'}
                    {mensagem.editadaEm && ' · editada'}
                    {mensagem.destacada && ' · destacada'}
                  </div>
                  {isHost && !temporaria && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        title={mensagem.destacada ? 'Remover destaque' : 'Destacar'}
                        onClick={() =>
                          void moderar(mensagem.id, { destacada: !mensagem.destacada })
                        }
                        className="rounded p-1 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]"
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => {
                          setEditandoId(mensagem.id)
                          setEditandoTexto(mensagem.conteudo)
                        }}
                        className="rounded p-1 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Excluir"
                        onClick={() => void moderar(mensagem.id, {}, true)}
                        className="rounded p-1 text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {editandoId === mensagem.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void moderar(mensagem.id, { conteudo: editandoTexto.trim() })
                    }}
                  >
                    <input
                      value={editandoTexto}
                      onChange={(e) => setEditandoTexto(e.target.value)}
                      maxLength={800}
                      className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1 text-sm"
                    />
                    <button type="submit" className="text-xs font-semibold text-[rgb(var(--color-primary))]">
                      Salvar
                    </button>
                  </form>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                    {mensagem.conteudo}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
