'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  ArrowLeft,
  Flag,
  ImagePlus,
  Loader2,
  LogOut,
  Send,
  Smile,
  Sticker as StickerIcon,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import {
  tituloConversa,
  type ContatoDto,
  type InboxItemDto,
  type MembroConversaDto,
  type MensagemDto,
} from '@/lib/mensageria-client'
import { formatRelative } from '@/lib/format-datetime'
import { fadeUp, collapsePanel, springSnappy, staggerContainer, menuItemStagger } from '@/lib/motion-presets'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { useVisibleInterval, useVisibleBackoffInterval } from '@/lib/use-visible-interval'
import { useConversaStream } from '@/lib/use-mensagem-stream'
import { Avatar } from './avatar'
import { EmojiPicker } from './emoji-picker'
import { StickerPicker } from './sticker-picker'
import { PostMedia } from './post-media'
import { isConversaGrupoLike } from '@/lib/canais-shared'
import { useUnsavedChanges, useUnsavedChangesContext } from '@/lib/unsaved-changes'

interface MensagemThreadProps {
  conversa: InboxItemDto
  currentUserId: string
  onBack: () => void
  onLida: (conversaId: string) => void
  onSaiu: (conversaId: string) => void
}

function isTemp(id: string): boolean {
  return id.startsWith('temp-')
}

function ordenar(lista: MensagemDto[]): MensagemDto[] {
  return [...lista].sort(
    (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
  )
}

function ultimaDoServidor(lista: MensagemDto[]): string | null {
  const server = lista.filter((m) => !isTemp(m.id))
  if (server.length === 0) return null
  return server[server.length - 1]?.criadoEm ?? null
}

interface MediaItem {
  id: string
  kind: 'image' | 'video' | 'sticker'
  localUrl: string
  url: string | null
  error: string | null
}

export function MensagemThread({
  conversa,
  currentUserId,
  onBack,
  onLida,
  onSaiu,
}: MensagemThreadProps) {
  const [mensagens, setMensagens] = useState<MensagemDto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [medias, setMedias] = useState<MediaItem[]>([])
  const [enviando, setEnviando] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [denunciandoId, setDenunciandoId] = useState<string | null>(null)
  const [motivoDenuncia, setMotivoDenuncia] = useState('')
  const [painelMembros, setPainelMembros] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastCriadoEmRef = useRef<string | null>(null)

  const conversaId = conversa.id
  const uploadPendente = medias.some((m) => m.url === null && !m.error)
  const { confirmDiscard } = useUnsavedChangesContext()

  const draftChanges = useMemo(() => {
    const list: string[] = []
    if (texto.trim()) list.push('Mensagem não enviada')
    if (medias.length > 0) list.push(`Anexos (${medias.length})`)
    return list
  }, [texto, medias.length])

  useUnsavedChanges({
    id: `mensagem-draft-${conversaId}`,
    title: 'Mensagem',
    isDirty: draftChanges.length > 0,
    changes: draftChanges,
  })

  async function handleBack() {
    const ok = await confirmDiscard()
    if (ok) onBack()
  }

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [mensagens, scrollToBottom])

  const marcarLida = useCallback(() => {
    void fetch(`/api/conversas/${conversaId}/ler`, { method: 'POST' }).then(() =>
      onLida(conversaId),
    )
  }, [conversaId, onLida])

  const carregar = useCallback(
    async (full: boolean): Promise<boolean> => {
      if (document.visibilityState !== 'visible') return false
      const after = lastCriadoEmRef.current
      const url =
        !full && after
          ? `/api/conversas/${conversaId}/mensagens?after=${encodeURIComponent(after)}`
          : `/api/conversas/${conversaId}/mensagens?full=1`
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) {
          if (full) setErro('Não foi possível carregar a conversa.')
          return false
        }
        const data = (await res.json()) as { mensagens?: MensagemDto[] }
        if (!data.mensagens) return false
        const novas = data.mensagens
        setMensagens((prev) => {
          const pendentes = prev.filter((m) => isTemp(m.id))
          const base = full ? novas : [...prev.filter((m) => !isTemp(m.id)), ...novas]
          const dedup = new Map<string, MensagemDto>()
          for (const m of base) dedup.set(m.id, m)
          const merged = ordenar([...dedup.values(), ...pendentes])
          const last = ultimaDoServidor(merged)
          if (last) lastCriadoEmRef.current = last
          return merged
        })
        if (novas.length > 0) marcarLida()
        return novas.length > 0
      } catch {
        // polling silencioso
      } finally {
        if (full) setCarregando(false)
      }
      return false
    },
    [conversaId, marcarLida],
  )

  const carregarRef = useRef(carregar)
  const marcarLidaRef = useRef(marcarLida)

  useEffect(() => {
    carregarRef.current = carregar
    marcarLidaRef.current = marcarLida
  }, [carregar, marcarLida])

  // Só reexecuta ao trocar de conversa — evita loop de loading quando onLida
  // atualiza o inbox do shell pai.
  useEffect(() => {
    lastCriadoEmRef.current = null
    void carregarRef.current(true)
    marcarLidaRef.current()
  }, [conversaId])

  useVisibleBackoffInterval(() => carregarRef.current(false), 15_000, 60_000)
  useVisibleInterval(() => void carregarRef.current(true), 60_000)
  useConversaStream(conversaId, () => {
    void carregarRef.current(false)
  })

  function insertEmoji(emoji: string) {
    const el = inputRef.current
    const start = el?.selectionStart ?? texto.length
    const end = el?.selectionEnd ?? texto.length
    setTexto((t) => t.slice(0, start) + emoji + t.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      if (el) el.selectionStart = el.selectionEnd = start + emoji.length
    })
  }

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    )
    for (const file of arr.slice(0, 4 - medias.length)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const item: MediaItem = {
        id,
        kind: file.type.startsWith('video/') ? 'video' : 'image',
        localUrl: URL.createObjectURL(file),
        url: null,
        error: null,
      }
      setMedias((prev) => [...prev, item])
      void uploadMediaToCloudinary(file)
        .then((url) => setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, url } : m))))
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : 'Falha no upload'
          setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, error: msg } : m)))
          toast.error(msg)
        })
    }
  }

  async function enviar(event: React.FormEvent) {
    event.preventDefault()
    const conteudo = texto.trim()
    const midias = medias.filter((m) => m.url).map((m) => m.url as string)
    if (!conteudo || enviando || uploadPendente) return

    const tempId = `temp-${Date.now()}`
    const otimista: MensagemDto = {
      id: tempId,
      conversaId,
      conteudo,
      midiaUrls: midias,
      respostaAId: null,
      editadaEm: null,
      removida: false,
      criadoEm: new Date().toISOString(),
      autor: { id: currentUserId, nome: 'Você', avatarUrl: null },
    }
    setTexto('')
    setMedias([])
    setEnviando(true)
    setMensagens((prev) => ordenar([...prev, otimista]))

    try {
      const res = await fetch(`/api/conversas/${conversaId}/mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo, midias }),
      })
      const data = (await res.json()) as { mensagem?: MensagemDto; error?: string }
      if (!res.ok || !data.mensagem) throw new Error(data.error ?? 'Erro ao enviar.')
      setMensagens((prev) => {
        const next = ordenar(prev.filter((m) => m.id !== tempId).concat(data.mensagem!))
        const last = ultimaDoServidor(next)
        if (last) lastCriadoEmRef.current = last
        return next
      })
    } catch (error) {
      setMensagens((prev) => prev.filter((m) => m.id !== tempId))
      setTexto(conteudo)
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar mensagem.')
    } finally {
      setEnviando(false)
    }
  }

  async function removerMensagem(mensagemId: string) {
    const res = await fetch(`/api/conversas/${conversaId}/mensagens/${mensagemId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      toast.error('Não foi possível remover a mensagem.')
      return
    }
    setMensagens((prev) =>
      prev.map((m) =>
        m.id === mensagemId ? { ...m, removida: true, conteudo: '', midiaUrls: [] } : m,
      ),
    )
  }

  async function denunciar(mensagemId: string) {
    const motivo = motivoDenuncia.trim()
    if (motivo.length < 5) {
      toast.error('Descreva o motivo (mínimo 5 caracteres).')
      return
    }
    const res = await fetch(
      `/api/conversas/${conversaId}/mensagens/${mensagemId}/denunciar`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      },
    )
    const data = (await res.json()) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? 'Erro ao denunciar.')
      return
    }
    setDenunciandoId(null)
    setMotivoDenuncia('')
    toast.success('Denúncia enviada. A moderação irá analisar.')
  }

  const titulo = tituloConversa(conversa)

  return (
    <m.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={springSnappy}
      className="flex h-full min-h-0 flex-col"
    >
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
        <button
          type="button"
          onClick={() => void handleBack()}
          aria-label="Voltar às conversas"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar
          nome={titulo}
          avatarUrl={conversa.tipo === 'DIRETA' ? conversa.outroMembro?.avatarUrl ?? null : conversa.avatarUrl}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</p>
          {isConversaGrupoLike(conversa.tipo) && (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              {conversa.totalMembros} participantes
            </p>
          )}
        </div>
        {isConversaGrupoLike(conversa.tipo) && (
          <button
            type="button"
            onClick={() => setPainelMembros((v) => !v)}
            aria-label="Participantes do grupo"
            className={[
              'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
              painelMembros
                ? 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            <Users className="h-4 w-4" />
          </button>
        )}
      </div>

      {painelMembros && isConversaGrupoLike(conversa.tipo) && (
        <AnimatePresence>
          <m.div
            key="painel-membros"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="overflow-hidden"
          >
            <PainelMembros
              conversaId={conversaId}
              currentUserId={currentUserId}
              isAdmin={conversa.meuPapel === 'ADMIN'}
              onSaiu={() => onSaiu(conversaId)}
            />
          </m.div>
        </AnimatePresence>
      )}

      {/* Mensagens */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {carregando ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--foreground-muted))]" />
          </div>
        ) : erro ? (
          <p className="py-10 text-center text-sm text-red-600 dark:text-red-400">{erro}</p>
        ) : mensagens.length === 0 ? (
          <MotionEmptyState
            title="Comece a conversa — diga um oi 👋"
            className="py-10 text-center text-sm text-[rgb(var(--foreground-muted))]"
          />
        ) : (
          mensagens.map((msg) => {
            const minha = msg.autor.id === currentUserId
            return (
              <m.div
                key={msg.id}
                layout
                variants={fadeUp}
                initial="hidden"
                animate="show"
                className={['group flex gap-2', minha ? 'justify-end' : 'justify-start'].join(' ')}
              >
                {!minha && <Avatar nome={msg.autor.nome} avatarUrl={msg.autor.avatarUrl} size="sm" />}
                <div className={['max-w-[80%] sm:max-w-[65%]', minha ? 'items-end' : 'items-start'].join(' ')}>
                  <div
                    className={[
                      'rounded-2xl px-3.5 py-2',
                      minha
                        ? 'rounded-br-md bg-[rgb(var(--primary))] text-white'
                        : 'rounded-bl-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))]',
                    ].join(' ')}
                  >
                    {isConversaGrupoLike(conversa.tipo) && !minha && (
                      <p className="mb-0.5 text-xs font-semibold text-[rgb(var(--primary))]">
                        {msg.autor.nome ?? 'Membro'}
                      </p>
                    )}
                    {msg.removida ? (
                      <p className="text-sm italic opacity-70">Mensagem removida</p>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap break-words text-sm">{msg.conteudo}</p>
                        {msg.midiaUrls.length > 0 && <PostMedia urls={msg.midiaUrls} />}
                      </>
                    )}
                  </div>
                  <div
                    className={[
                      'mt-0.5 flex items-center gap-2 text-[11px] text-[rgb(var(--foreground-muted))]',
                      minha ? 'justify-end' : 'justify-start',
                    ].join(' ')}
                  >
                    <span suppressHydrationWarning>
                      {formatRelative(new Date(msg.criadoEm))}
                      {isTemp(msg.id) && ' · enviando…'}
                      {msg.editadaEm && ' · editada'}
                    </span>
                    {!isTemp(msg.id) && !msg.removida && (
                      <span className="hidden gap-1 group-hover:flex">
                        {minha ? (
                          <button
                            type="button"
                            title="Remover mensagem"
                            onClick={() => void removerMensagem(msg.id)}
                            className="rounded p-0.5 text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Denunciar mensagem"
                            onClick={() => {
                              setDenunciandoId(denunciandoId === msg.id ? null : msg.id)
                              setMotivoDenuncia('')
                            }}
                            className="rounded p-0.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
                          >
                            <Flag className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  <AnimatePresence>
                    {denunciandoId === msg.id && (
                      <m.form
                        key="denuncia"
                        variants={collapsePanel}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        transition={springSnappy}
                        className="mt-1 flex gap-1.5 overflow-hidden"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void denunciar(msg.id)
                        }}
                      >
                        <input
                          value={motivoDenuncia}
                          onChange={(e) => setMotivoDenuncia(e.target.value)}
                          maxLength={500}
                          autoFocus
                          placeholder="Motivo da denúncia"
                          className="w-52 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2 py-1 text-xs text-[rgb(var(--foreground))]"
                        />
                        <button type="submit" className="text-xs font-semibold text-red-600 dark:text-red-400">
                          Enviar
                        </button>
                      </m.form>
                    )}
                  </AnimatePresence>
                </div>
              </m.div>
            )
          })
        )}
      </div>

      {/* Composer */}
      <form onSubmit={enviar} className="border-t border-[rgb(var(--border))] p-3">
        <AnimatePresence mode="popLayout">
          {medias.length > 0 && (
            <m.div
              key="medias"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={springSnappy}
              className="mb-2 flex flex-wrap gap-2 overflow-hidden"
            >
              {medias.map((media) => (
                <m.div
                  key={media.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={springSnappy}
                  className="relative h-14 w-14 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
                >
                  {media.kind === 'video' ? (
                    <video src={media.localUrl} muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media.localUrl} alt="" className="h-full w-full object-cover" />
                  )}
                  {media.url === null && !media.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setMedias((prev) => prev.filter((x) => x.id !== media.id))}
                    aria-label="Remover anexo"
                    className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </m.div>
              ))}
            </m.div>
          )}
        </AnimatePresence>
        <div className="flex items-end gap-1.5">
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => {
                setEmojiOpen((v) => !v)
                setStickerOpen(false)
              }}
              aria-label="Emojis"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--primary))]"
            >
              <Smile className="h-5 w-5" />
            </button>
            {emojiOpen && <EmojiPicker onSelect={insertEmoji} onClose={() => setEmojiOpen(false)} />}
          </div>
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => {
                setStickerOpen((v) => !v)
                setEmojiOpen(false)
              }}
              aria-label="Stickers"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--primary))]"
            >
              <StickerIcon className="h-5 w-5" />
            </button>
            {stickerOpen && (
              <StickerPicker
                onSelect={(url) => {
                  setStickerOpen(false)
                  setMedias((prev) => [
                    ...prev,
                    { id: `${Date.now()}`, kind: 'sticker', localUrl: url, url, error: null },
                  ])
                }}
                onClose={() => setStickerOpen(false)}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Anexar foto ou vídeo"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--primary))]"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <textarea
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter(
                (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
              )
              if (files.length) {
                e.preventDefault()
                addFiles(files)
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Escreva uma mensagem"
            className="max-h-32 min-h-[36px] flex-1 resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          />
          <m.button
            type="submit"
            disabled={enviando || uploadPendente || !texto.trim()}
            whileTap={{ scale: 0.94 }}
            transition={springSnappy}
            aria-label="Enviar mensagem"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--primary))] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {enviando || uploadPendente ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </m.button>
        </div>
      </form>
    </m.div>
  )
}

function PainelMembros({
  conversaId,
  currentUserId,
  isAdmin,
  onSaiu,
}: {
  conversaId: string
  currentUserId: string
  isAdmin: boolean
  onSaiu: () => void
}) {
  const [membros, setMembros] = useState<MembroConversaDto[]>([])
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ContatoDto[]>([])
  const [adicionando, setAdicionando] = useState(false)
  // Bump força recarregar a lista após adicionar/remover participante
  const [versaoMembros, setVersaoMembros] = useState(0)

  useEffect(() => {
    let active = true
    async function carregar() {
      const res = await fetch(`/api/conversas/${conversaId}/membros`, { cache: 'no-store' })
      if (!res.ok || !active) return
      const data = (await res.json()) as { membros?: MembroConversaDto[] }
      if (data.membros && active) setMembros(data.membros)
    }
    void carregar()
    return () => {
      active = false
    }
  }, [conversaId, versaoMembros])

  useEffect(() => {
    if (!adicionando) return
    const id = window.setTimeout(async () => {
      const res = await fetch(`/api/conversas/contatos?q=${encodeURIComponent(busca)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as { contatos?: ContatoDto[] }
      setResultados(data.contatos ?? [])
    }, 300)
    return () => window.clearTimeout(id)
  }, [busca, adicionando])

  async function adicionar(userId: string) {
    const res = await fetch(`/api/conversas/${conversaId}/membros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const data = (await res.json()) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? 'Erro ao adicionar.')
      return
    }
    setBusca('')
    setAdicionando(false)
    setVersaoMembros((v) => v + 1)
    toast.success('Participante adicionado.')
  }

  async function remover(userId: string) {
    const sair = userId === currentUserId
    const res = await fetch(`/api/conversas/${conversaId}/membros`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sair ? {} : { userId }),
    })
    const data = (await res.json()) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? 'Erro ao remover.')
      return
    }
    if (sair) {
      onSaiu()
      return
    }
    setVersaoMembros((v) => v + 1)
  }

  async function transferirAdmin(userId: string) {
    if (!window.confirm('Transferir a administração do grupo para este membro?')) return
    const res = await fetch(`/api/conversas/${conversaId}/membros`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const data = (await res.json()) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? 'Erro ao transferir.')
      return
    }
    toast.success('Administração transferida.')
    setVersaoMembros((v) => v + 1)
  }

  const jaNoGrupo = new Set(membros.map((m) => m.userId))

  return (
    <div className="max-h-64 space-y-2 overflow-y-auto border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3">
      <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
        <AnimatePresence mode="popLayout">
          {membros.map((membro, i) => (
            <m.div
              key={membro.userId}
              layout
              custom={i}
              variants={menuItemStagger}
              exit={{ opacity: 0, x: -8, transition: { duration: 0.15 } }}
              className="flex items-center gap-2"
            >
              <Avatar nome={membro.user.nome} avatarUrl={membro.user.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-[rgb(var(--foreground))]">
                {membro.user.nome ?? 'Membro'}
                {membro.userId === currentUserId && ' (você)'}
              </span>
              {membro.papel === 'ADMIN' && (
                <span className="rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[rgb(var(--primary))]">
                  Admin
                </span>
              )}
              {isAdmin && membro.userId !== currentUserId && membro.papel !== 'ADMIN' && (
                <m.button
                  type="button"
                  title="Transferir administração"
                  onClick={() => void transferirAdmin(membro.userId)}
                  whileTap={{ scale: 0.95 }}
                  transition={springSnappy}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary)_/_0.08)]"
                >
                  Tornar admin
                </m.button>
              )}
              {isAdmin && membro.userId !== currentUserId && (
                <m.button
                  type="button"
                  title="Remover do grupo"
                  onClick={() => void remover(membro.userId)}
                  whileTap={{ scale: 0.9 }}
                  transition={springSnappy}
                  className="rounded p-1 text-red-500 hover:bg-red-500/10"
                >
                  <X className="h-3.5 w-3.5" />
                </m.button>
              )}
            </m.div>
          ))}
        </AnimatePresence>
      </m.div>

      <div className="flex items-center gap-2 pt-1">
        {isAdmin && (
          <button
            type="button"
            onClick={() => setAdicionando((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary)_/_0.08)]"
          >
            <UserPlus className="h-3.5 w-3.5" /> Adicionar participante
          </button>
        )}
        <button
          type="button"
          onClick={() => void remover(currentUserId)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair do grupo
        </button>
      </div>

      {adicionando && (
        <AnimatePresence>
          <m.div
            key="add-membro"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            className="space-y-1.5 overflow-hidden pt-1"
          >
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
              placeholder="Buscar membro pelo nome"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-sm text-[rgb(var(--foreground))]"
            />
            <m.div variants={staggerContainer} initial="hidden" animate="show">
              {resultados
                .filter((c) => !jaNoGrupo.has(c.id))
                .slice(0, 6)
                .map((c, i) => (
                  <m.button
                    key={c.id}
                    custom={i}
                    variants={menuItemStagger}
                    type="button"
                    onClick={() => void adicionar(c.id)}
                    whileTap={{ scale: 0.99 }}
                    transition={springSnappy}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[rgb(var(--surface))]"
                  >
                    <Avatar nome={c.nome} avatarUrl={c.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-[rgb(var(--foreground))]">
                      {c.nome ?? 'Membro'}
                    </span>
                    {!c.mesmoTenant && (
                      <span className="truncate text-[10px] text-[rgb(var(--foreground-muted))]">
                        {c.tenantNome}
                      </span>
                    )}
                  </m.button>
                ))}
            </m.div>
          </m.div>
        </AnimatePresence>
      )}
    </div>
  )
}
