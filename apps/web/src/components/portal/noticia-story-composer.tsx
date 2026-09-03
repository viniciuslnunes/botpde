'use client'

import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type TextareaHTMLAttributes,
} from 'react'
import { useRouter } from 'next/navigation'
import { m } from 'motion/react'
import { ChevronDown, ChevronUp, ImageIcon, Link2, Loader2, Newspaper, Play, Type, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  ARTIGO_BLOCO_LEGENDA_MAX,
  ARTIGO_BLOCO_TEXTO_MAX,
  ARTIGO_BLOCOS_MAX,
  ARTIGO_RESUMO_MAX,
  ARTIGO_TITULO_MAX,
  flattenArtigoBlocos,
  formatNomeTorcida,
  parseArtigoBlocos,
} from '@torcida/types'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { FileDropOverlay, useFileDragOver } from '@/components/media/file-drop-overlay'
import {
  detectEmbedProvider,
  EMBED_HOSTS,
  fatiarTextoEmBlocosHistoria,
  toAbsoluteSocialUrl,
} from '@/lib/social-embed'
import { Avatar } from '@/components/portal/avatar'
import { NoticiaArtigoLeitura } from '@/components/portal/noticia-artigo-corpo'
import {
  publicarArtigoHistoriaAction,
  type ArtigoComposerState,
} from '@/app/portal/comunidade/praca-actions'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { AppButton } from '@/components/ui/button'

const MAX_IMG_MB = 10
const MAX_VIDEO_MB = 100
const MAX_MIDIA = 10

const INITIAL: ArtigoComposerState = {}

const CAMPO =
  'w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2.5 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))]'
const TOOL =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-primary-fg))]'

type BlocoTexto = { id: string; tipo: 'texto'; texto: string }
type BlocoMidia = {
  id: string
  tipo: 'imagem' | 'video'
  url: string | null
  localUrl: string | null
  legenda: string
  progress: number
  error: string | null
}
type BlocoEmbed = { id: string; tipo: 'embed'; url: string }
type BlocoDraft = BlocoTexto | BlocoMidia | BlocoEmbed

function novoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function primeiroNome(nome: string | null) {
  return nome?.trim().split(/\s+/)[0] || 'você'
}

function blocosParaEnvio(blocos: BlocoDraft[]) {
  const mapped = blocos
    .map((b) => {
      if (b.tipo === 'texto') {
        const texto = b.texto.trim()
        return texto ? { tipo: 'texto' as const, texto } : null
      }
      if (b.tipo === 'embed') {
        const url = toAbsoluteSocialUrl(b.url) ?? b.url.trim()
        return url ? { tipo: 'embed' as const, url } : null
      }
      if (!b.url) return null
      const legenda = b.legenda.trim()
      return legenda ? { tipo: b.tipo, url: b.url, legenda } : { tipo: b.tipo, url: b.url }
    })
    .filter((b): b is NonNullable<typeof b> => b != null)

  const out: typeof mapped = []
  for (const b of mapped) {
    if (b.tipo === 'texto') {
      const fatias = fatiarTextoEmBlocosHistoria(b.texto)
      if (fatias.length > 0) out.push(...fatias)
    } else {
      out.push(b)
    }
  }
  return out
}

function AutoGrowTextarea({
  value,
  className,
  minRows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={minRows}
      className={`${CAMPO} resize-none overflow-hidden [field-sizing:content] ${className ?? ''}`}
    />
  )
}

function blocoEmbedHost(url: string) {
  const abs = toAbsoluteSocialUrl(url) ?? url
  const provider = detectEmbedProvider(abs)
  return provider ? EMBED_HOSTS[provider] : null
}

function BlocoExtra({
  bloco,
  index,
  total,
  onMover,
  onRemover,
  onTexto,
  onEmbed,
  onLegenda,
}: {
  bloco: BlocoDraft
  index: number
  total: number
  onMover: (id: string, dir: -1 | 1) => void
  onRemover: (id: string) => void
  onTexto: (id: string, texto: string) => void
  onEmbed: (id: string, url: string) => void
  onLegenda: (id: string, legenda: string) => void
}) {
  const embedHost = bloco.tipo === 'embed' ? blocoEmbedHost(bloco.url) : null
  return (
    <div className="flex items-start gap-1">
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={() => onMover(bloco.id, -1)}
          disabled={index === 0}
          aria-label="Subir bloco"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-30"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMover(bloco.id, 1)}
          disabled={index === total - 1}
          aria-label="Descer bloco"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-30"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        {bloco.tipo === 'texto' ? (
          <AutoGrowTextarea
            value={bloco.texto}
            onChange={(e) => onTexto(bloco.id, e.target.value)}
            maxLength={ARTIGO_BLOCO_TEXTO_MAX}
            minRows={2}
            placeholder="Continua o texto…"
          />
        ) : null}
        {bloco.tipo === 'embed' ? (
          <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2">
            <Link2 className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
            <input
              type="url"
              value={bloco.url}
              onChange={(e) => onEmbed(bloco.id, e.target.value)}
              placeholder="Link do YouTube, Instagram, X ou TikTok"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[rgb(var(--foreground-muted))]"
            />
            {embedHost ? (
              <span className="shrink-0 text-[11px] text-[rgb(var(--foreground-muted))]">{embedHost}</span>
            ) : null}
          </div>
        ) : null}
        {(bloco.tipo === 'imagem' || bloco.tipo === 'video') && (
          <div className="flex items-start gap-2">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
              {bloco.tipo === 'video' ? (
                <>
                  <video
                    src={bloco.localUrl ?? bloco.url ?? undefined}
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Play className="h-6 w-6 fill-white text-white drop-shadow" />
                  </div>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bloco.localUrl ?? bloco.url ?? ''} alt="" className="h-full w-full object-cover" />
              )}
              {bloco.url == null && !bloco.error ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              ) : null}
              {bloco.error ? (
                <div className="absolute inset-0 flex items-center justify-center bg-red-600/70 px-1 text-center text-[10px] font-medium text-white">
                  Falhou
                </div>
              ) : null}
            </div>
            <input
              type="text"
              value={bloco.legenda}
              onChange={(e) => onLegenda(bloco.id, e.target.value)}
              maxLength={ARTIGO_BLOCO_LEGENDA_MAX}
              placeholder="Legenda (opcional)"
              className={`${CAMPO} min-w-0 flex-1`}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemover(bloco.id)}
        aria-label="Remover"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function NoticiaStoryComposer({
  escopo,
  userName,
  userAvatar,
  tenantNome,
  fecharHref,
  focoVideo = false,
}: {
  escopo: EscopoComunidade
  userName: string | null
  userAvatar: string | null
  tenantNome: string
  fecharHref: string
  focoVideo?: boolean
}) {
  const router = useRouter()
  const fileDrag = useFileDragOver()
  const fotoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const focoVideoDisparado = useRef(false)
  const [titulo, setTitulo] = useState('')
  const [resumo, setResumo] = useState('')
  const [blocos, setBlocos] = useState<BlocoDraft[]>([{ id: novoId(), tipo: 'texto', texto: '' }])
  const [state, action, pending] = useActionState(publicarArtigoHistoriaAction, INITIAL)

  const enviando = blocos.some((b) => b.tipo !== 'texto' && b.tipo !== 'embed' && !b.url && !b.error)
  const payload = blocosParaEnvio(blocos)
  const podePublicar = titulo.trim().length >= 3 && payload.length > 0 && !pending && !enviando
  const primeiroTexto = blocos.find((b) => b.tipo === 'texto')
  const extras = blocos.filter((b) => b.id !== primeiroTexto?.id)

  const tokenSincronizado = state.token ?? 'novo'
  const [tokenVisto, setTokenVisto] = useState(tokenSincronizado)
  if (tokenSincronizado !== tokenVisto) {
    setTokenVisto(tokenSincronizado)
    if (state.success) {
      setTitulo('')
      setResumo('')
      setBlocos([{ id: novoId(), tipo: 'texto', texto: '' }])
    }
  }

  useEffect(() => {
    if (!focoVideo || focoVideoDisparado.current) return
    focoVideoDisparado.current = true
    videoRef.current?.click()
  }, [focoVideo])

  useEffect(() => {
    if (!state.success) return
    toast.success('Notícia publicada')
    router.replace(fecharHref)
    router.refresh()
  }, [fecharHref, router, state.success, state.token])

  function atualizarTexto(id: string, texto: string) {
    setBlocos((prev) => prev.map((b) => (b.id === id && b.tipo === 'texto' ? { ...b, texto } : b)))
  }

  function addTexto() {
    if (blocos.length >= ARTIGO_BLOCOS_MAX) return
    setBlocos((prev) => [...prev, { id: novoId(), tipo: 'texto', texto: '' }])
  }

  function addEmbed() {
    if (blocos.length >= ARTIGO_BLOCOS_MAX) return
    setBlocos((prev) => [...prev, { id: novoId(), tipo: 'embed', url: '' }])
  }

  function addFiles(files: FileList | File[], prefer?: 'imagem' | 'video') {
    const arr = Array.from(files).filter((f) =>
      prefer === 'video'
        ? f.type.startsWith('video/')
        : prefer === 'imagem'
          ? f.type.startsWith('image/')
          : f.type.startsWith('image/') || f.type.startsWith('video/'),
    )
    if (arr.length === 0) return
    const midiasAgora = blocos.filter((b) => b.tipo === 'imagem' || b.tipo === 'video').length
    const espaco = Math.min(MAX_MIDIA - midiasAgora, ARTIGO_BLOCOS_MAX - blocos.length)
    if (espaco <= 0) {
      toast.error(`Máximo de ${MAX_MIDIA} fotos e vídeos na notícia.`)
      return
    }
    for (const file of arr.slice(0, espaco)) {
      const isVideo = file.type.startsWith('video/')
      const limiteMB = isVideo ? MAX_VIDEO_MB : MAX_IMG_MB
      if (file.size > limiteMB * 1024 * 1024) {
        toast.error(`"${file.name}" passa de ${limiteMB}MB.`)
        continue
      }
      const id = novoId()
      const item: BlocoMidia = {
        id,
        tipo: isVideo ? 'video' : 'imagem',
        localUrl: URL.createObjectURL(file),
        url: null,
        legenda: '',
        progress: 0,
        error: null,
      }
      setBlocos((prev) => [...prev, item])
      void uploadMediaToCloudinary(file, (pct) =>
        setBlocos((prev) =>
          prev.map((b) =>
            b.id === id && b.tipo !== 'texto' && b.tipo !== 'embed' ? { ...b, progress: pct } : b,
          ),
        ),
      )
        .then((url) =>
          setBlocos((prev) =>
            prev.map((b) =>
              b.id === id && b.tipo !== 'texto' && b.tipo !== 'embed' ? { ...b, url, progress: 100 } : b,
            ),
          ),
        )
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : 'Falha no upload'
          setBlocos((prev) =>
            prev.map((b) =>
              b.id === id && b.tipo !== 'texto' && b.tipo !== 'embed' ? { ...b, error: msg } : b,
            ),
          )
          toast.error(msg)
        })
    }
  }

  function mover(id: string, dir: -1 | 1) {
    setBlocos((prev) => {
      const i = prev.findIndex((b) => b.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(i, 1)
      next.splice(j, 0, item)
      return next
    })
  }

  function remover(id: string) {
    setBlocos((prev) => {
      const alvo = prev.find((b) => b.id === id)
      if (alvo && (alvo.tipo === 'imagem' || alvo.tipo === 'video') && alvo.localUrl) {
        URL.revokeObjectURL(alvo.localUrl)
      }
      const next = prev.filter((b) => b.id !== id)
      return next.length > 0 ? next : [{ id: novoId(), tipo: 'texto', texto: '' }]
    })
  }

  function cancelar() {
    setTitulo('')
    setResumo('')
    setBlocos([{ id: novoId(), tipo: 'texto', texto: '' }])
    router.replace(fecharHref)
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!podePublicar) return
    const fd = new FormData()
    fd.set('escopo', escopo)
    fd.set('titulo', titulo.trim())
    if (resumo.trim()) fd.set('resumo', resumo.trim())
    fd.set('blocos', JSON.stringify(payload))
    action(fd)
  }

  const previewBlocos = parseArtigoBlocos(payload)
  const previewFlat = flattenArtigoBlocos(previewBlocos)
  const temPrevia = Boolean(titulo.trim() || resumo.trim() || previewBlocos.length > 0)

  return (
    <m.form
      layout={!fileDrag.active}
      onSubmit={submit}
      onDragEnter={fileDrag.onDragEnter}
      onDragOver={fileDrag.onDragOver}
      onDragLeave={fileDrag.onDragLeave}
      onDrop={(e) => {
        const files = fileDrag.finishDrop(e)
        if (files.length) addFiles(files)
      }}
      className="card-soft relative min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-4"
    >
      <FileDropOverlay active={fileDrag.active} />
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files, 'imagem')
          e.target.value = ''
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files, 'video')
          e.target.value = ''
        }}
      />

      <div className="flex items-start gap-3">
        <Avatar nome={userName} avatarUrl={userAvatar} size="md" />
        <div className="relative min-w-0 flex-1 space-y-2">
          <input
            type="text"
            required
            autoFocus
            maxLength={ARTIGO_TITULO_MAX}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título da notícia"
            className={`${CAMPO} font-semibold placeholder:font-normal`}
          />
          <input
            type="text"
            maxLength={ARTIGO_RESUMO_MAX}
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
            placeholder="Linha fina — o resumo abaixo do título"
            className={CAMPO}
          />
          {primeiroTexto ? (
            <AutoGrowTextarea
              value={primeiroTexto.texto}
              onChange={(e) => atualizarTexto(primeiroTexto.id, e.target.value)}
              maxLength={ARTIGO_BLOCO_TEXTO_MAX}
              minRows={3}
              placeholder={`Escreva a notícia, ${primeiroNome(userName)}… Encaixa foto, vídeo ou um post depois.`}
            />
          ) : null}
        </div>
      </div>

      {extras.length > 0 ? (
        <div className="mt-3 space-y-2 pl-[52px]">
          {extras.map((bloco) => (
            <BlocoExtra
              key={bloco.id}
              bloco={bloco}
              index={blocos.findIndex((b) => b.id === bloco.id)}
              total={blocos.length}
              onMover={mover}
              onRemover={remover}
              onTexto={atualizarTexto}
              onEmbed={(id, url) =>
                setBlocos((prev) =>
                  prev.map((b) => (b.id === id && b.tipo === 'embed' ? { ...b, url } : b)),
                )
              }
              onLegenda={(id, legenda) =>
                setBlocos((prev) =>
                  prev.map((b) =>
                    b.id === id && (b.tipo === 'imagem' || b.tipo === 'video') ? { ...b, legenda } : b,
                  ),
                )
              }
            />
          ))}
        </div>
      ) : null}

      {state.message ? (
        <p className="mt-2 ml-[52px] rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1 pl-[52px]">
        <button type="button" onClick={addTexto} aria-label="Adicionar texto" title="Texto" className={TOOL}>
          <Type className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => fotoRef.current?.click()}
          aria-label="Adicionar foto"
          title="Foto"
          className={TOOL}
        >
          <ImageIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => videoRef.current?.click()}
          aria-label="Adicionar vídeo"
          title="Vídeo"
          className={TOOL}
        >
          <Video className="h-5 w-5" />
        </button>
        <button type="button" onClick={addEmbed} aria-label="Adicionar embed" title="Embed" className={TOOL}>
          <Link2 className="h-5 w-5" />
        </button>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <AppButton
            variant="none"
            icon={X}
            type="button"
            onClick={cancelar}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            Cancelar
          </AppButton>
          <AppButton
            variant="primary"
            icon={Newspaper}
            loading={pending || enviando}
            type="submit"
            disabled={!podePublicar}
            className="h-9 shrink-0 gap-1.5 rounded-lg px-3 text-sm font-semibold sm:px-4"
          >
            <span className="max-sm:sr-only">
              {enviando ? 'Enviando…' : pending ? 'Publicando…' : 'Publicar notícia'}
            </span>
          </AppButton>
        </div>
      </div>

      <div className="mt-3 ml-[52px]">
        <p className="mb-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Prévia — como vai aparecer na leitura
        </p>
        {temPrevia ? (
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
            <div className="mb-3 flex items-center gap-2.5">
              <Avatar nome={tenantNome} avatarUrl={null} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                  {formatNomeTorcida(tenantNome)}
                </p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">agora</p>
              </div>
            </div>
            <NoticiaArtigoLeitura
              compact
              titulo={titulo.trim() || 'Título da notícia'}
              resumo={resumo.trim() || previewFlat.resumo}
              autorNome={userName}
              publicadoEm={new Date()}
              origem="OFICIAL"
              blocos={previewBlocos}
            />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-4 text-center text-xs text-[rgb(var(--foreground-muted))]">
            A prévia aparece aqui conforme você escreve.
          </p>
        )}
      </div>
    </m.form>
  )
}
