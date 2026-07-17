'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Loader2, MessageSquare, Pin, Send, Trash2, Pencil } from 'lucide-react'
import { toast } from '@torcida/ui'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { useConfirmAction } from '@/lib/confirm-action'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { Avatar } from '@/components/portal/avatar'
import { collapsePanel, fadeUp, springSnappy } from '@/lib/motion-presets'

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
  listClassName?: string
  /** Painel sobre vídeo: fundos semi-transparentes */
  glass?: boolean
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
  const pendentes = prev.filter((msg) => isMensagemTemporaria(msg.id))
  return ordenarMensagens([...server, ...pendentes])
}

function ultimaMensagemServidor(lista: SalaMensagem[]): string | null {
  const server = lista.filter((msg) => !isMensagemTemporaria(msg.id))
  if (server.length === 0) return null
  return [...server].sort(
    (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
  )[0]?.criadoEm ?? null
}

export function SalaChat({
  salaId,
  currentUserId,
  isHost,
  initialMensagens,
  listClassName = 'max-h-80 space-y-3 overflow-y-auto pr-1',
  glass = false,
}: SalaChatProps) {
  const confirmAction = useConfirmAction()
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

    async function sincronizar(): Promise<boolean> {
      if (document.visibilityState !== 'visible') return false
      const after = lastCriadoEmRef.current
      const url = after
        ? `/api/salas/${salaId}/mensagens?after=${encodeURIComponent(after)}`
        : `/api/salas/${salaId}/mensagens?full=1`

      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok || !active) return false
        const data = (await res.json()) as { mensagens?: SalaMensagem[] }
        if (!data.mensagens?.length) return false

        setMensagens((prev) => {
          const merged = after
            ? ordenarMensagens([
                ...prev.filter((msg) => !data.mensagens!.some((n) => n.id === msg.id)),
                ...data.mensagens!.map((msg) => ({
                  ...msg,
                  criadoEmFormatado: formatDateTimeShort(msg.criadoEm),
                })),
              ])
            : mesclarComServidor(
                prev,
                data.mensagens!.map((msg) => ({
                  ...msg,
                  criadoEmFormatado: formatDateTimeShort(msg.criadoEm),
                })),
              )
          const last = ultimaMensagemServidor(merged)
          if (last) lastCriadoEmRef.current = last
          return merged
        })
        return true
      } catch {
        // polling silencioso
      }
      return false
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
            data.mensagens!.map((msg) => ({
              ...msg,
              criadoEmFormatado: formatDateTimeShort(msg.criadoEm),
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

    const BASE_MS = 4000
    const MAX_MS = 15000
    let delay = BASE_MS
    let novasId: number | undefined

    async function loop() {
      const houveNovas = await sincronizar()
      if (!active) return
      delay = houveNovas ? BASE_MS : Math.min(delay * 2, MAX_MS)
      novasId = window.setTimeout(loop, delay)
    }

    void loop()
    const fullId = window.setInterval(sincronizarCompleto, 30000)
    return () => {
      active = false
      if (novasId !== undefined) window.clearTimeout(novasId)
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
          prev.filter((msg) => msg.id !== tempId).concat({
            ...data.mensagem!,
            criadoEmFormatado: formatDateTimeShort(data.mensagem!.criadoEm),
          }),
        )
        const last = ultimaMensagemServidor(next)
        if (last) lastCriadoEmRef.current = last
        return next
      })
    } catch (error) {
      setMensagens((prev) => prev.filter((msg) => msg.id !== tempId))
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
      await confirmAction({
        titulo: 'Excluir esta mensagem?',
        descricao: 'A mensagem some do chat da sala.',
        labelConfirmar: 'Excluir',
        variante: 'destructive',
        cancelled: false,
        run: async () => {
          const res = await fetch(`/api/salas/${salaId}/mensagens/${mensagemId}`, {
            method: 'DELETE',
          })
          if (!res.ok) throw new Error('Não foi possível excluir a mensagem.')
          setMensagens((prev) => prev.filter((msg) => msg.id !== mensagemId))
        },
        success: 'Mensagem removida.',
      })
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
        prev.map((msg) =>
          msg.id === mensagemId
            ? {
                ...data.mensagem!,
                criadoEmFormatado: formatDateTimeShort(data.mensagem!.criadoEm),
              }
            : msg,
        ),
      ),
    )
    setEditandoId(null)
    toast.success(body.destacada !== undefined ? 'Destaque atualizado.' : 'Mensagem editada.')
  }

  return (
    <div className={glass ? 'text-white' : undefined}>
      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <input
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          required
          maxLength={800}
          disabled={enviando}
          placeholder="Escreva uma mensagem para o grupo"
          className={
            glass
              ? 'w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-zinc-400 disabled:opacity-60'
              : 'w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] disabled:opacity-60'
          }
        />
        <m.button
          type="submit"
          disabled={enviando || !conteudo.trim()}
          whileTap={{ scale: 0.96 }}
          transition={springSnappy}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[rgb(var(--color-primary))] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar
        </m.button>
      </form>

      <AnimatePresence>
        {erro && (
          <m.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="mb-3 text-sm text-red-300"
          >
            {erro}
          </m.p>
        )}
      </AnimatePresence>

      {mensagens.length === 0 ? (
        <MotionEmptyState
          icon={
            <MessageSquare
              className={`mb-2 h-6 w-6 ${glass ? 'text-zinc-400' : 'text-[rgb(var(--foreground-muted))]'}`}
            />
          }
          title="Sem mensagens ainda"
          description="Seja o primeiro a falar com a torcida nesta sala."
          className={`py-6 text-center ${glass ? 'text-zinc-300' : ''}`}
        />
      ) : (
        <div ref={listRef} className={listClassName}>
          <AnimatePresence mode="popLayout" initial={false}>
            {mensagens.map((mensagem) => {
              const temporaria = isMensagemTemporaria(mensagem.id)
              return (
                <m.div
                  key={mensagem.id}
                  layout
                  variants={fadeUp}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
                  className={`rounded-xl border p-3 ${
                    mensagem.destacada
                      ? 'border-amber-400/40 bg-amber-400/10'
                      : glass
                        ? 'border-white/10 bg-white/10'
                        : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]'
                  } ${temporaria ? 'opacity-80' : ''}`}
                >
                  <div className="flex gap-3">
                    <Avatar
                      nome={mensagem.autor.id === currentUserId ? 'Você' : (mensagem.autor.nome ?? 'Membro')}
                      avatarUrl={mensagem.autor.avatarUrl}
                      size="sm"
                      className="mt-0.5 ring-1 ring-[rgb(var(--border))]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <div
                          className={`text-xs ${glass ? 'text-zinc-300' : 'text-[rgb(var(--foreground-muted))]'}`}
                          suppressHydrationWarning
                        >
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
                              className={`rounded p-1 ${glass ? 'text-zinc-300 hover:bg-white/10' : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]'}`}
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
                              className={`rounded p-1 ${glass ? 'text-zinc-300 hover:bg-white/10' : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]'}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Excluir"
                              onClick={() => void moderar(mensagem.id, {}, true)}
                              className="rounded p-1 text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <AnimatePresence mode="wait">
                        {editandoId === mensagem.id ? (
                          <m.form
                            key="edit"
                            variants={collapsePanel}
                            initial="hidden"
                            animate="show"
                            exit="exit"
                            transition={springSnappy}
                            className="flex gap-2 overflow-hidden"
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
                          </m.form>
                        ) : (
                          <m.p
                            key="view"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`whitespace-pre-wrap text-sm ${glass ? 'text-zinc-50' : 'text-[rgb(var(--foreground))]'}`}
                          >
                            {mensagem.conteudo}
                          </m.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </m.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
