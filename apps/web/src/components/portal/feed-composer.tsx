'use client'

import { useActionState, useRef, useState } from 'react'
import { ImagePlus, Smile, Send, X, Loader2, Link2, Sticker as StickerIcon, Play } from 'lucide-react'
import { toast } from '@torcida/ui'
import { publicarPost, type PublicarPostState } from '@/app/portal/comunidade/actions'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { firstSocialUrlInText, detectEmbedProvider, EMBED_HOSTS } from '@/lib/social-embed'
import { Avatar } from './avatar'
import { EmojiPicker } from './emoji-picker'
import { StickerPicker } from './sticker-picker'

const INITIAL_STATE: PublicarPostState = {}
const MAX_ANEXOS = 10
const MAX_IMG_MB = 10
const MAX_VIDEO_MB = 100

interface FeedComposerProps {
  userName: string | null
  userAvatar: string | null
  perfilPrivado?: boolean
}

export function FeedComposer({ userName, userAvatar, perfilPrivado = true }: FeedComposerProps) {
  const [state, action, pending] = useActionState<PublicarPostState, FormData>(
    publicarPost,
    INITIAL_STATE,
  )

  return (
    <form
      action={action}
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-4"
    >
      {/* Remonta (limpa) a cada publicação bem-sucedida via token */}
      <ComposerBody
        key={state.token ?? 'novo'}
        userName={userName}
        userAvatar={userAvatar}
        perfilPrivado={perfilPrivado}
        pending={pending}
        serverError={state.message ?? state.errors?.conteudo?.[0] ?? state.errors?.midias?.[0]}
      />
    </form>
  )
}

type MediaKind = 'image' | 'video' | 'sticker'

interface MediaItem {
  id: string
  kind: MediaKind
  localUrl: string
  url: string | null
  progress: number
  error: string | null
}

function ComposerBody({
  userName,
  userAvatar,
  perfilPrivado,
  pending,
  serverError,
}: {
  userName: string | null
  userAvatar: string | null
  perfilPrivado: boolean
  pending: boolean
  serverError?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [texto, setTexto] = useState('')
  const [visibilidade, setVisibilidade] = useState<'PUBLICO' | 'TENANT' | 'PRIVADO'>(
    perfilPrivado ? 'PRIVADO' : 'PUBLICO',
  )
  const [medias, setMedias] = useState<MediaItem[]>([])
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [embedDispensado, setEmbedDispensado] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const firstName = userName?.split(' ')[0] ?? 'torcedor'
  const embedUrl = embedDispensado ? null : firstSocialUrlInText(texto)
  const embedProvider = embedUrl ? detectEmbedProvider(embedUrl) : null
  const enviando = medias.some((m) => m.url === null && !m.error)
  const finalMidias = [
    ...medias.filter((m) => m.url).map((m) => m.url as string),
    ...(embedUrl ? [embedUrl] : []),
  ]
  const podePublicar = texto.trim().length > 0 && !enviando && !pending

  function open() {
    setExpanded(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current
    if (!el) {
      setTexto((t) => t + emoji)
      return
    }
    const start = el.selectionStart ?? texto.length
    const end = el.selectionEnd ?? texto.length
    const next = texto.slice(0, start) + emoji + texto.slice(end)
    setTexto(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + emoji.length
    })
  }

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    )
    if (arr.length === 0) return
    const espaco = MAX_ANEXOS - medias.length
    if (espaco <= 0) {
      toast.error(`Máximo de ${MAX_ANEXOS} anexos por publicação.`)
      return
    }
    for (const file of arr.slice(0, espaco)) {
      const isVideo = file.type.startsWith('video/')
      const limiteMB = isVideo ? MAX_VIDEO_MB : MAX_IMG_MB
      if (file.size > limiteMB * 1024 * 1024) {
        toast.error(`"${file.name}" passa de ${limiteMB}MB.`)
        continue
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const item: MediaItem = {
        id,
        kind: isVideo ? 'video' : 'image',
        localUrl: URL.createObjectURL(file),
        url: null,
        progress: 0,
        error: null,
      }
      setMedias((prev) => [...prev, item])
      void uploadMediaToCloudinary(file, (pct) =>
        setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, progress: pct } : m))),
      )
        .then((url) =>
          setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, url, progress: 100 } : m))),
        )
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : 'Falha no upload'
          setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, error: msg } : m)))
          toast.error(msg)
        })
    }
  }

  function addSticker(url: string) {
    setStickerOpen(false)
    if (medias.length >= MAX_ANEXOS) {
      toast.error(`Máximo de ${MAX_ANEXOS} anexos por publicação.`)
      return
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setMedias((prev) => [
      ...prev,
      { id, kind: 'sticker', localUrl: url, url, progress: 100, error: null },
    ])
  }

  function removeMedia(id: string) {
    setMedias((prev) => {
      const alvo = prev.find((m) => m.id === id)
      if (alvo && alvo.kind !== 'sticker') URL.revokeObjectURL(alvo.localUrl)
      return prev.filter((m) => m.id !== id)
    })
  }

  return (
    <div
      onDragOver={(e) => {
        if (!expanded) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
      }}
      className={dragOver ? 'rounded-xl outline-2 outline-dashed outline-[rgb(var(--primary))]' : ''}
    >
      <input type="hidden" name="midias" value={JSON.stringify(finalMidias)} />
      <input type="hidden" name="visibilidade" value={visibilidade} />

      <div className="flex items-start gap-3">
        <Avatar nome={userName} avatarUrl={userAvatar} size="md" />
        <div className="min-w-0 flex-1">
          {!expanded ? (
            <button
              type="button"
              onClick={open}
              className="h-11 w-full rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 text-left text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--border-strong))]"
            >
              No que você tá pensando, {firstName}?
            </button>
          ) : (
            <textarea
              ref={textareaRef}
              name="conteudo"
              required
              maxLength={3000}
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter(
                  (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
                )
                if (files.length) {
                  e.preventDefault()
                  addFiles(files)
                }
              }}
              placeholder={`No que você tá pensando, ${firstName}?`}
              className="w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2.5 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))]"
            />
          )}
        </div>
      </div>

      {expanded && (
        <>
          {/* Prévia dos anexos */}
          {medias.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
              {medias.map((m) => (
                <div
                  key={m.id}
                  className="relative h-20 w-20 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
                >
                  {m.kind === 'video' ? (
                    <>
                      <video src={m.localUrl} muted playsInline className="h-full w-full object-cover" />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <Play className="h-6 w-6 fill-white text-white drop-shadow" />
                      </div>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.localUrl}
                      alt=""
                      className={m.kind === 'sticker' ? 'h-full w-full object-contain p-1.5' : 'h-full w-full object-cover'}
                    />
                  )}
                  {m.url === null && !m.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  {m.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-600/70 px-1 text-center text-[10px] font-medium text-white">
                      Falhou
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(m.id)}
                    aria-label="Remover anexo"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Prévia do embed detectado */}
          {embedUrl && embedProvider && (
            <div className="mt-3 ml-[52px] flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2">
              <Link2 className="h-4 w-4 shrink-0 text-[rgb(var(--primary))]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[rgb(var(--foreground))]">
                  Publicação do {EMBED_HOSTS[embedProvider]}
                </p>
                <p className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">{embedUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => setEmbedDispensado(true)}
                aria-label="Não embutir este link"
                className="rounded p-1 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {serverError && (
            <p className="mt-2 ml-[52px] rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {serverError}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-[rgb(var(--border))] pt-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Adicionar foto ou vídeo"
                title="Foto ou vídeo"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--primary))]"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setEmojiOpen((v) => !v)
                    setStickerOpen(false)
                  }}
                  aria-label="Emojis"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--primary))]"
                >
                  <Smile className="h-5 w-5" />
                </button>
                {emojiOpen && (
                  <EmojiPicker onSelect={(e) => insertEmoji(e)} onClose={() => setEmojiOpen(false)} />
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setStickerOpen((v) => !v)
                    setEmojiOpen(false)
                  }}
                  aria-label="Stickers"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--primary))]"
                >
                  <StickerIcon className="h-5 w-5" />
                </button>
                {stickerOpen && (
                  <StickerPicker onSelect={addSticker} onClose={() => setStickerOpen(false)} />
                )}
              </div>
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
            </div>

            <div className="flex items-center gap-2">
              <select
                value={visibilidade}
                onChange={(e) =>
                  setVisibilidade(e.target.value as 'PUBLICO' | 'TENANT' | 'PRIVADO')
                }
                aria-label="Visibilidade do post"
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2 py-1.5 text-xs text-[rgb(var(--foreground-muted))]"
              >
                <option value="PUBLICO">Público</option>
                <option value="TENANT">Só torcida</option>
                <option value="PRIVADO">Só seguidores</option>
              </select>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!podePublicar}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending || enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {enviando ? 'Enviando…' : pending ? 'Publicando…' : 'Publicar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
