'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { AtSign, ImagePlus, Loader2, Play, Smile, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import { editarPost } from '@/app/portal/comunidade/actions'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { FileDropOverlay, useFileDragOver } from '@/components/media/file-drop-overlay'
import {
  classifyMedia,
  ensureSocialEmbedInMidias,
  firstSocialUrlInText,
  isSocialUrl,
  stripEmbeddedSocialUrls,
} from '@/lib/social-embed'
import {
  paraTextoLegivel,
  podarMencoes,
  serializarMencoes,
  type MencaoParsed,
} from '@/lib/comunidade-social'
import { springGentle, springSnappy } from '@/lib/motion-presets'
import { useConfirmDialog } from '@/lib/confirm-action'
import { ComposerMentionHighlight } from './composer-mention-highlight'
import { EmojiPicker } from './emoji-picker'
import { ExpandableText } from './expandable-text'
import { MentionPicker, detectarMencaoAtiva, type MencaoSelecionada } from './mention-picker'
import { PostMedia } from './post-media'
import { AppButton } from '@/components/ui/button'

const MAX_ANEXOS = 10
const MAX_IMG_MB = 10
const MAX_VIDEO_MB = 100
const MAX_CARACTERES = 3000

type MediaKind = 'image' | 'video' | 'sticker'

interface EditMedia {
  id: string
  kind: MediaKind
  /** URL para prévia (objectURL enquanto sobe; Cloudinary depois). */
  localUrl: string
  /** URL definitiva — `null` enquanto o upload não termina. */
  url: string | null
  progress: number
  error: string | null
}

interface PostEditContextValue {
  editando: boolean
  pending: boolean
  texto: string
  mencoes: MencaoParsed[]
  medias: EditMedia[]
  enviando: boolean
  podeSalvar: boolean
  embedNoTexto: string | null
  /** Conteúdo após salvar — enquanto `null`, vale o que veio do servidor. */
  conteudoAtual: string | null
  midiasAtuais: string[] | null
  textareaRef: RefObject<HTMLTextAreaElement | null>
  campoRef: RefObject<HTMLDivElement | null>
  mencaoQuery: string | null
  escopoMencao?: 'nacional'
  abrirEdicao: () => void
  cancelar: () => void
  salvar: () => void
  alterarTexto: (valor: string, cursor?: number) => void
  fecharMencao: () => void
  selecionarMencao: (m: MencaoSelecionada) => void
  inserirEmoji: (emoji: string) => void
  inserirArroba: () => void
  adicionarArquivos: (files: FileList | File[]) => void
  removerMedia: (id: string) => void
  removerEmbedDoTexto: () => void
}

const PostEditContext = createContext<PostEditContextValue | null>(null)

function usePostEdit(): PostEditContextValue | null {
  return useContext(PostEditContext)
}

function midiasParaEstado(urls: string[]): EditMedia[] {
  return classifyMedia(urls).media.map((item) => ({
    id: item.url,
    kind: item.type,
    localUrl: item.url,
    url: item.url,
    progress: 100,
    error: null,
  }))
}

interface PostEditProviderProps {
  postId: string
  /** Conteúdo cru do post (com menções serializadas). */
  conteudo: string
  /** `post.midiaUrls` cru — embeds sociais são derivados do texto. */
  midiaUrls: string[]
  /** Só o autor edita; para os demais o provider é inerte. */
  podeEditar: boolean
  /** Comunidade Nacional — typeahead de menção no escopo do clube. */
  escopoMencao?: 'nacional'
  /** Fórum: persiste no tópico em vez de `editarPost`. */
  salvarFn?: (id: string, conteudo: string, midias: string[]) => Promise<void>
  children: ReactNode
}

/**
 * Estado da edição inline de uma publicação. O texto é editado onde o texto
 * está (`PostEditableTexto`) e os anexos onde os anexos estão
 * (`PostEditableMidia`) — o menu do post só dispara `abrirEdicao`.
 */
export function PostEditProvider({
  postId,
  conteudo,
  midiaUrls,
  podeEditar,
  escopoMencao,
  salvarFn,
  children,
}: PostEditProviderProps) {
  const router = useRouter()
  const confirmDialog = useConfirmDialog()
  const [editando, setEditando] = useState(false)
  const [pending, startTransition] = useTransition()
  const [conteudoAtual, setConteudoAtual] = useState<string | null>(null)
  const [midiasAtuais, setMidiasAtuais] = useState<string[] | null>(null)
  const inicial = useMemo(
    () => paraTextoLegivel(conteudoAtual ?? conteudo),
    [conteudoAtual, conteudo],
  )
  const [texto, setTexto] = useState(inicial.texto)
  const [mencoes, setMencoes] = useState<MencaoParsed[]>(inicial.mencoes)
  const [medias, setMedias] = useState<EditMedia[]>([])
  const [mencaoQuery, setMencaoQuery] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const campoRef = useRef<HTMLDivElement | null>(null)
  const objectUrlsRef = useRef<string[]>([])

  const anexosBase = useMemo(
    () => (midiasAtuais ?? midiaUrls).filter((url) => !isSocialUrl(url)),
    [midiasAtuais, midiaUrls],
  )

  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  const abrirEdicao = useCallback(() => {
    const next = paraTextoLegivel(conteudoAtual ?? conteudo)
    setTexto(next.texto)
    setMencoes(next.mencoes)
    setMedias(midiasParaEstado(anexosBase))
    setMencaoQuery(null)
    setEditando(true)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = el.value.length
    })
  }, [anexosBase, conteudo, conteudoAtual])

  const anexos = useMemo(
    () => medias.filter((m) => m.url).map((m) => m.url as string),
    [medias],
  )
  const enviando = medias.some((m) => m.url === null && !m.error)
  const textoBase = inicial.texto
  const dirty =
    texto.trim() !== textoBase.trim() || anexos.join(',') !== anexosBase.join(',')
  const podeSalvar = texto.trim().length > 0 && !enviando && !pending
  const embedNoTexto = firstSocialUrlInText(texto)

  const fecharEdicao = useCallback(() => {
    setEditando(false)
    setMencaoQuery(null)
  }, [])

  const cancelar = useCallback(() => {
    if (!dirty) {
      fecharEdicao()
      return
    }
    void confirmDialog({
      titulo: 'Descartar alterações?',
      descricao: 'O texto e os anexos voltam a como estavam antes da edição.',
      labelConfirmar: 'Descartar',
      labelCancelar: 'Continuar editando',
      variante: 'destructive',
      cancelled: false,
      execute: async () => {
        fecharEdicao()
      },
    })
  }, [confirmDialog, dirty, fecharEdicao])

  const salvar = useCallback(() => {
    if (!podeSalvar) return
    const conteudoNovo = serializarMencoes(texto, mencoes)
    const anexosNovos = [...anexos]
    startTransition(async () => {
      try {
        if (salvarFn) await salvarFn(postId, conteudoNovo, anexosNovos)
        else await editarPost(postId, conteudoNovo, anexosNovos)
        setConteudoAtual(conteudoNovo)
        setMidiasAtuais(ensureSocialEmbedInMidias(conteudoNovo, anexosNovos))
        setEditando(false)
        setMencaoQuery(null)
        toast.success('Publicação atualizada.')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível editar.')
      }
    })
  }, [anexos, mencoes, podeSalvar, postId, router, salvarFn, texto])

  const alterarTexto = useCallback((valor: string, cursor?: number) => {
    const { texto: legivel, mencoes: coladas } = paraTextoLegivel(valor)
    setTexto(legivel)
    setMencoes((prev) => {
      const merged = [...prev]
      for (const nova of coladas) {
        if (!merged.some((x) => x.userId === nova.userId)) merged.push(nova)
      }
      return podarMencoes(legivel, merged)
    })
    const pos = cursor ?? legivel.length
    setMencaoQuery(detectarMencaoAtiva(legivel, Math.min(pos, legivel.length)))
  }, [])

  const selecionarMencao = useCallback(
    (selecionada: MencaoSelecionada) => {
      const el = textareaRef.current
      const trecho = selecionada.texto
      if (!el) {
        setTexto((t) => t + trecho)
        setMencoes((prev) => [
          ...prev.filter((m) => m.userId !== selecionada.userId),
          { nome: selecionada.nome, userId: selecionada.userId },
        ])
        setMencaoQuery(null)
        return
      }
      const cursor = el.selectionStart ?? texto.length
      const query = detectarMencaoAtiva(texto, cursor)
      if (!query) return
      const antes = texto.slice(0, cursor - query.length - 1)
      const depois = texto.slice(cursor)
      setTexto(antes + trecho + depois)
      setMencoes((prev) => [
        ...prev.filter((m) => m.userId !== selecionada.userId),
        { nome: selecionada.nome, userId: selecionada.userId },
      ])
      setMencaoQuery(null)
      requestAnimationFrame(() => {
        el.focus()
        const pos = antes.length + trecho.length
        el.selectionStart = el.selectionEnd = pos
      })
    },
    [texto],
  )

  const inserirEmoji = useCallback(
    (emoji: string) => {
      const el = textareaRef.current
      if (!el) {
        setTexto((t) => t + emoji)
        return
      }
      const start = el.selectionStart ?? texto.length
      const end = el.selectionEnd ?? texto.length
      setTexto(texto.slice(0, start) + emoji + texto.slice(end))
      requestAnimationFrame(() => {
        el.focus()
        el.selectionStart = el.selectionEnd = start + emoji.length
      })
    },
    [texto],
  )

  const inserirArroba = useCallback(() => {
    const el = textareaRef.current
    if (!el) {
      alterarTexto(texto + '@')
      return
    }
    const pos = el.selectionStart ?? texto.length
    alterarTexto(texto.slice(0, pos) + '@' + texto.slice(pos), pos + 1)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = pos + 1
    })
  }, [alterarTexto, texto])

  const adicionarArquivos = useCallback(
    (files: FileList | File[]) => {
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
        const localUrl = URL.createObjectURL(file)
        objectUrlsRef.current.push(localUrl)
        setMedias((prev) => [
          ...prev,
          { id, kind: isVideo ? 'video' : 'image', localUrl, url: null, progress: 0, error: null },
        ])
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
    },
    [medias.length],
  )

  const removerMedia = useCallback((id: string) => {
    setMedias((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const removerEmbedDoTexto = useCallback(() => {
    const url = firstSocialUrlInText(texto)
    if (!url) return
    alterarTexto(stripEmbeddedSocialUrls(texto, [url]))
  }, [alterarTexto, texto])

  const value: PostEditContextValue = {
    editando,
    pending,
    texto,
    mencoes,
    medias,
    enviando,
    podeSalvar,
    embedNoTexto,
    conteudoAtual,
    midiasAtuais,
    textareaRef,
    campoRef,
    mencaoQuery,
    escopoMencao,
    abrirEdicao,
    cancelar,
    salvar,
    alterarTexto,
    fecharMencao: () => setMencaoQuery(null),
    selecionarMencao,
    inserirEmoji,
    inserirArroba,
    adicionarArquivos,
    removerMedia,
    removerEmbedDoTexto,
  }

  if (!podeEditar) return <>{children}</>

  return <PostEditContext.Provider value={value}>{children}</PostEditContext.Provider>
}

/** Botão "Editar" do menu do post — só aparece quando há contexto de edição. */
export function usePostEditActions(): { abrirEdicao: () => void } | null {
  const ctx = usePostEdit()
  if (!ctx) return null
  return { abrirEdicao: ctx.abrirEdicao }
}

/**
 * Slot do texto do post: exibe o texto publicado, o editor no lugar dele
 * durante a edição, e o texto novo logo após salvar (sem esperar o RSC).
 */
export function PostEditableTexto({ children }: { children: ReactNode }) {
  const ctx = usePostEdit()
  if (!ctx) return <>{children}</>

  if (ctx.editando) return <PostTextoEditor ctx={ctx} />

  if (ctx.conteudoAtual != null) {
    const visivel = stripEmbeddedSocialUrls(ctx.conteudoAtual, ctx.midiasAtuais ?? [])
    if (!visivel) return null
    return (
      <ExpandableText
        conteudo={visivel}
        lines={8}
        className="whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
      />
    )
  }

  return <>{children}</>
}

function PostTextoEditor({ ctx }: { ctx: PostEditContextValue }) {
  const { texto, mencoes, textareaRef, campoRef } = ctx

  // Cresce com o conteúdo — o campo ocupa exatamente o espaço do texto do post.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [texto, textareaRef])

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
      ref={campoRef}
      className="relative isolate mt-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] transition-colors focus-within:border-[rgb(var(--primary))]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-3 py-2.5 text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
      >
        <ComposerMentionHighlight texto={texto} mencoes={mencoes} />
      </div>
      <textarea
        ref={textareaRef}
        value={texto}
        rows={1}
        maxLength={MAX_CARACTERES}
        aria-label="Editar texto da publicação"
        onChange={(e) => ctx.alterarTexto(e.target.value, e.target.selectionStart)}
        onKeyUp={(e) => ctx.alterarTexto(texto, e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            if (ctx.mencaoQuery !== null) ctx.fecharMencao()
            else ctx.cancelar()
            return
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            ctx.salvar()
          }
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files).filter(
            (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
          )
          if (files.length) {
            e.preventDefault()
            ctx.adicionarArquivos(files)
          }
        }}
        className="relative z-[1] block w-full resize-none overflow-hidden bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-transparent caret-[rgb(var(--foreground))] outline-none"
      />
      {ctx.mencaoQuery !== null && (
        <MentionPicker
          query={ctx.mencaoQuery}
          onSelect={ctx.selecionarMencao}
          onClose={ctx.fecharMencao}
          escopo={ctx.escopoMencao}
          anchorRef={campoRef}
        />
      )}
    </m.div>
  )
}

/**
 * Slot da mídia do post: durante a edição vira a grade de anexos (remover /
 * adicionar) com a barra de ações da edição.
 */
export function PostEditableMidia({ children }: { children: ReactNode }) {
  const ctx = usePostEdit()
  if (!ctx) return <>{children}</>

  if (ctx.editando) return <PostMidiaEditor ctx={ctx} />

  if (ctx.midiasAtuais != null) {
    if (ctx.midiasAtuais.length === 0) return null
    const legivel = paraTextoLegivel(ctx.conteudoAtual ?? '').texto
    return <PostMedia urls={ctx.midiasAtuais} caption={legivel} />
  }

  return <>{children}</>
}

function PostMidiaEditor({ ctx }: { ctx: PostEditContextValue }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const fileDrag = useFileDragOver(true)
  const restante = MAX_CARACTERES - ctx.texto.length

  const toolBtn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-primary-fg))]'

  return (
    <m.div
      layout
      transition={springGentle}
      onDragEnter={fileDrag.onDragEnter}
      onDragOver={fileDrag.onDragOver}
      onDragLeave={fileDrag.onDragLeave}
      onDrop={(e) => {
        const files = fileDrag.finishDrop(e)
        if (files.length) ctx.adicionarArquivos(files)
      }}
      className="relative mt-3"
    >
      <FileDropOverlay active={fileDrag.active} label="Solte para anexar" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) ctx.adicionarArquivos(e.target.files)
          e.target.value = ''
        }}
      />

      {ctx.medias.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {ctx.medias.map((media) => (
              <m.div
                key={media.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={springSnappy}
                className="relative h-24 w-24 overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
              >
                {media.kind === 'video' ? (
                  <>
                    <video src={media.localUrl} muted playsInline className="h-full w-full object-cover" />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <Play className="h-6 w-6 fill-white text-white drop-shadow" />
                    </div>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.localUrl}
                    alt=""
                    className={
                      media.kind === 'sticker'
                        ? 'h-full w-full object-contain p-1.5'
                        : 'h-full w-full object-cover'
                    }
                  />
                )}
                {media.url === null && !media.error && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
                      <m.div
                        className="h-full bg-white"
                        initial={false}
                        animate={{ width: `${media.progress}%` }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                      />
                    </div>
                  </>
                )}
                {media.error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-600/70 px-1 text-center text-[10px] font-medium text-white">
                    Falhou
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => ctx.removerMedia(media.id)}
                  aria-label="Remover anexo"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </m.div>
            ))}
          </AnimatePresence>
          {ctx.medias.length < MAX_ANEXOS && (
            <AppButton
              variant="none"
              icon={ImagePlus}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--primary))] hover:text-[rgb(var(--color-primary-fg))]"
            >
              <span className="text-[11px] font-medium">Adicionar</span>
            </AppButton>
          )}
        </div>
      )}

      {ctx.embedNoTexto && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[rgb(var(--foreground))]">Link incorporado</p>
            <p className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">
              {ctx.embedNoTexto}
            </p>
          </div>
          <button
            type="button"
            onClick={ctx.removerEmbedDoTexto}
            aria-label="Remover link incorporado"
            className="rounded p-1 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--surface))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[rgb(var(--border))] pt-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Adicionar foto ou vídeo"
            title="Foto ou vídeo"
            className={toolBtn}
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <div ref={emojiRef} className="relative">
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              aria-label="Emojis"
              aria-expanded={emojiOpen}
              className={toolBtn}
            >
              <Smile className="h-5 w-5" />
            </button>
            {emojiOpen && (
              <EmojiPicker
                onSelect={(emoji) => ctx.inserirEmoji(emoji)}
                onClose={() => setEmojiOpen(false)}
                anchorRef={emojiRef}
              />
            )}
          </div>
          <button
            type="button"
            onClick={ctx.inserirArroba}
            aria-label="Mencionar membro"
            title="Mencionar"
            className={toolBtn}
          >
            <AtSign className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {restante <= 200 && (
            <span
              className={[
                'text-xs tabular-nums',
                restante < 0 ? 'text-red-600' : 'text-[rgb(var(--foreground-muted))]',
              ].join(' ')}
            >
              {restante}
            </span>
          )}
          <m.button
            type="button"
            onClick={ctx.cancelar}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Cancelar
          </m.button>
          <m.button
            type="button"
            onClick={ctx.salvar}
            disabled={!ctx.podeSalvar}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3.5 py-1.5 text-xs font-semibold text-primary-on transition-opacity disabled:opacity-60"
          >
            {ctx.pending || ctx.enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {ctx.enviando ? 'Enviando anexos…' : ctx.pending ? 'Salvando…' : 'Salvar'}
          </m.button>
        </div>
      </div>
    </m.div>
  )
}
