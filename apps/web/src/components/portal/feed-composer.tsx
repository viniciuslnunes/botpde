'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import {
  ImagePlus,
  Smile,
  Send,
  X,
  Loader2,
  Link2,
  Sticker as StickerIcon,
  Play,
  BarChart3,
  AtSign,
  CalendarDays,
  Plus,
  ChevronDown,
  Check,
  Globe2,
  Users,
  Lock,
  type LucideIcon,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import { publicarPost, publicarEnquete, publicarPostEvento, type PublicarPostState } from '@/app/portal/comunidade/actions'
import type { EventoComposerItem } from '@/lib/eventos'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { firstSocialUrlInText, detectEmbedProvider, EMBED_HOSTS } from '@/lib/social-embed'
import { emitirPostPublicado } from '@/lib/feed-live-refresh'
import { Avatar } from './avatar'
import { EmojiPicker } from './emoji-picker'
import { StickerPicker } from './sticker-picker'
import { MentionPicker, detectarMencaoAtiva, type MencaoSelecionada } from './mention-picker'
import {
  paraTextoLegivel,
  podarMencoes,
  serializarMencoes,
  type MencaoParsed,
} from '@/lib/comunidade-social'
import { menuItemStagger, popoverPanel, springGentle, springSnappy } from '@/lib/motion-presets'
import { useUnsavedChanges } from '@/lib/unsaved-changes'
import { useConfirmDialog } from '@/lib/confirm-action'

const INITIAL_STATE: PublicarPostState = {}
const MAX_ANEXOS = 10
const MAX_IMG_MB = 10
const MAX_VIDEO_MB = 100

type VisibilidadePost = 'PUBLICO' | 'TENANT' | 'PRIVADO'

const VISIBILIDADE_OPCOES: Array<{
  value: VisibilidadePost
  label: string
  descricao: string
  Icon: LucideIcon
}> = [
  {
    value: 'PUBLICO',
    label: 'Público',
    descricao: 'Comunidade e torcedores do clube',
    Icon: Globe2,
  },
  {
    value: 'TENANT',
    label: 'Só torcida',
    descricao: 'Membros da organizada',
    Icon: Users,
  },
  {
    value: 'PRIVADO',
    label: 'Só seguidores',
    descricao: 'Quem te segue com aprovação',
    Icon: Lock,
  },
]

interface FeedComposerProps {
  userId: string
  userName: string | null
  userAvatar: string | null
  perfilPrivado?: boolean
  eventos?: EventoComposerItem[]
  /** Quando true, só permite posts PUBLICO (torcedor aguardando aprovação / global). */
  somentePublico?: boolean
  /** Quando definido, substitui o composer por aviso (ex.: cadastro pendente). */
  bloqueioPublicacao?: string | null
  /** Deep-link da Agenda — abre modo evento com este id pré-selecionado. */
  eventoIdInicial?: string
}

export function FeedComposer({
  userId,
  userName,
  userAvatar,
  perfilPrivado = false,
  eventos = [],
  bloqueioPublicacao = null,
  somentePublico = false,
  eventoIdInicial,
}: FeedComposerProps) {
  if (bloqueioPublicacao) {
    return (
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-5 text-center text-sm text-[rgb(var(--foreground-muted))]">
        {bloqueioPublicacao}
      </div>
    )
  }

  return (
    <FeedComposerActive
      userId={userId}
      userName={userName}
      userAvatar={userAvatar}
      perfilPrivado={perfilPrivado}
      eventos={eventos}
      somentePublico={somentePublico}
      eventoIdInicial={eventoIdInicial}
    />
  )
}

function FeedComposerActive({
  userId,
  userName,
  userAvatar,
  perfilPrivado = false,
  eventos = [],
  somentePublico = false,
  eventoIdInicial,
}: Omit<FeedComposerProps, 'bloqueioPublicacao'>) {
  const [postState, postAction, postPending] = useActionState<PublicarPostState, FormData>(
    publicarPost,
    INITIAL_STATE,
  )
  const [pollState, pollAction, pollPending] = useActionState<PublicarPostState, FormData>(
    publicarEnquete,
    INITIAL_STATE,
  )
  const [eventState, eventAction, eventPending] = useActionState<PublicarPostState, FormData>(
    publicarPostEvento,
    INITIAL_STATE,
  )

  const token = postState.token ?? pollState.token ?? eventState.token ?? 'novo'
  const state = postState.token || postState.success
    ? postState
    : pollState.token || pollState.success
      ? pollState
      : eventState

  // Feed infinite: prepend otimista com preview da action (sem esperar refetch).
  useEffect(() => {
    const preview = postState.preview ?? pollState.preview ?? eventState.preview
    if (postState.success || pollState.success || eventState.success) {
      emitirPostPublicado(preview ? { preview } : undefined)
    }
  }, [
    postState.success,
    postState.token,
    postState.preview,
    pollState.success,
    pollState.token,
    pollState.preview,
    eventState.success,
    eventState.token,
    eventState.preview,
  ])

  return (
    <div id="feed-composer" className="scroll-mt-24">
    <ComposerBody
      key={token}
      userId={userId}
      userName={userName}
      userAvatar={userAvatar}
      perfilPrivado={perfilPrivado}
      postAction={postAction}
      pollAction={pollAction}
      eventAction={eventAction}
      postPending={postPending}
      pollPending={pollPending}
      eventPending={eventPending}
      eventos={eventos}
      somentePublico={somentePublico}
      eventoIdInicial={eventoIdInicial}
      serverError={state.message ?? state.errors?.conteudo?.[0] ?? state.errors?.midias?.[0] ?? state.errors?.opcoes?.[0] ?? state.errors?.eventoId?.[0]}
    />
    </div>
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
  userId,
  userName,
  userAvatar,
  perfilPrivado,
  postAction,
  pollAction,
  eventAction,
  postPending,
  pollPending,
  eventPending,
  serverError,
  eventos,
  somentePublico = false,
  eventoIdInicial,
}: {
  userId: string
  userName: string | null
  userAvatar: string | null
  perfilPrivado: boolean
  postAction: (payload: FormData) => void
  pollAction: (payload: FormData) => void
  eventAction: (payload: FormData) => void
  postPending: boolean
  pollPending: boolean
  eventPending: boolean
  serverError?: string
  eventos: EventoComposerItem[]
  somentePublico?: boolean
  eventoIdInicial?: string
}) {
  const eventoPreselecionado =
    eventoIdInicial && eventos.some((e) => e.id === eventoIdInicial)
      ? eventoIdInicial
      : undefined

  const [expanded, setExpanded] = useState(Boolean(eventoPreselecionado))
  const [modoEnquete, setModoEnquete] = useState(false)
  const [modoEvento, setModoEvento] = useState(Boolean(eventoPreselecionado))
  const [eventoId, setEventoId] = useState(
    eventoPreselecionado ?? eventos[0]?.id ?? '',
  )
  const [texto, setTexto] = useState('')
  const [mencoes, setMencoes] = useState<MencaoParsed[]>([])
  const [opcoes, setOpcoes] = useState(['', ''])
  const [mencaoQuery, setMencaoQuery] = useState<string | null>(null)
  const [visibilidade, setVisibilidade] = useState<VisibilidadePost>(
    somentePublico ? 'PUBLICO' : perfilPrivado ? 'PRIVADO' : 'PUBLICO',
  )
  const [alcanceOpen, setAlcanceOpen] = useState(false)
  const [medias, setMedias] = useState<MediaItem[]>([])
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [embedDispensado, setEmbedDispensado] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [extrasOpen, setExtrasOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const extrasRef = useRef<HTMLDivElement>(null)
  const alcanceRef = useRef<HTMLDivElement>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const confirmDialog = useConfirmDialog()

  useEffect(() => {
    if (!eventoPreselecionado) return
    const el = document.getElementById('feed-composer')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = window.setTimeout(() => textareaRef.current?.focus(), 350)
    return () => window.clearTimeout(t)
  }, [eventoPreselecionado])

  const firstName = userName?.split(' ')[0] ?? 'torcedor'
  const embedUrl = embedDispensado ? null : firstSocialUrlInText(texto)
  const embedProvider = embedUrl ? detectEmbedProvider(embedUrl) : null
  const enviando = medias.some((m) => m.url === null && !m.error)
  const pending = modoEnquete ? pollPending : modoEvento ? eventPending : postPending
  const finalMidias = [
    ...medias.filter((m) => m.url).map((m) => m.url as string),
    ...(embedUrl ? [embedUrl] : []),
  ]
  const opcoesValidas = opcoes.map((o) => o.trim()).filter(Boolean)
  const podePublicar = modoEnquete
    ? texto.trim().length > 0 && opcoesValidas.length >= 2 && !pending
    : modoEvento
      ? texto.trim().length > 0 && eventoId.length > 0 && !pending
      : texto.trim().length > 0 && !enviando && !pending

  // Perfil privado: Público fica listado, mas bloqueado (modal para alterar privacidade).
  const visibilidadeEfetiva: VisibilidadePost =
    !somentePublico && perfilPrivado && visibilidade === 'PUBLICO' ? 'PRIVADO' : visibilidade
  const opcaoVisibilidadeAtual =
    VISIBILIDADE_OPCOES.find((opcao) => opcao.value === visibilidadeEfetiva) ??
    VISIBILIDADE_OPCOES[VISIBILIDADE_OPCOES.length - 1]!
  const AlcanceIcon = opcaoVisibilidadeAtual.Icon

  const composerChanges = useMemo(() => {
    const list: string[] = []
    if (texto.trim()) list.push('Texto')
    if (medias.length > 0) list.push(`Anexos (${medias.length})`)
    if (modoEnquete) list.push('Enquete')
    if (modoEvento) list.push('Evento')
    return list
  }, [texto, medias.length, modoEnquete, modoEvento])

  useUnsavedChanges({
    id: 'feed-composer',
    title: 'Nova publicação',
    isDirty: composerChanges.length > 0,
    changes: composerChanges,
  })

  function handleTextoChange(value: string, cursor?: number) {
    const { texto: legivel, mencoes: coladas } = paraTextoLegivel(value)
    setTexto(legivel)
    setMencoes((prev) => {
      const merged = [...prev]
      for (const m of coladas) {
        if (!merged.some((x) => x.userId === m.userId)) merged.push(m)
      }
      return podarMencoes(legivel, merged)
    })
    const pos = cursor ?? legivel.length
    setMencaoQuery(detectarMencaoAtiva(legivel, Math.min(pos, legivel.length)))
  }

  function inserirMencao(selecionada: MencaoSelecionada) {
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
    const next = antes + trecho + depois
    setTexto(next)
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
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('conteudo', serializarMencoes(texto, mencoes))
    startTransition(() => {
      if (modoEnquete) {
        pollAction(fd)
      } else if (modoEvento) {
        eventAction(fd)
      } else {
        postAction(fd)
      }
    })
  }

  function open() {
    setExpanded(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  // Abre o composer a partir do FAB do dock (evento) ou de `?compose=1` na URL.
  useEffect(() => {
    function onCompose() {
      setExpanded(true)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
    window.addEventListener('comunidade:compose', onCompose)
    if (new URLSearchParams(window.location.search).get('compose') === '1') {
      onCompose()
    }
    return () => window.removeEventListener('comunidade:compose', onCompose)
  }, [])

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (!extrasRef.current?.contains(target)) setExtrasOpen(false)
      if (!alcanceRef.current?.contains(target)) setAlcanceOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function fecharExtras() {
    setExtrasOpen(false)
  }

  function escolherVisibilidade(value: VisibilidadePost) {
    setVisibilidade(value)
    setAlcanceOpen(false)
  }

  async function pedirAlterarPrivacidade() {
    setAlcanceOpen(false)
    await confirmDialog({
      titulo: 'Perfil restrito',
      descricao:
        'Seu perfil está privado, então não é possível publicar como Público. Quer abrir as configurações de privacidade agora?',
      labelConfirmar: 'Alterar privacidade',
      labelCancelar: 'Agora não',
      cancelled: false,
      execute: async () => {
        router.push(
          '/portal/comunidade/perfil/' + userId + '?aba=sobre&foco=privacidade',
        )
      },
    })
  }

  function onEscolherVisibilidade(value: VisibilidadePost) {
    if (value === 'PUBLICO' && perfilPrivado) {
      void pedirAlterarPrivacidade()
      return
    }
    escolherVisibilidade(value)
  }

  function toggleEnquete() {
    setModoEnquete((v) => !v)
    setModoEvento(false)
    setEmojiOpen(false)
    setStickerOpen(false)
    fecharExtras()
  }

  function toggleEvento() {
    setModoEvento((v) => !v)
    setModoEnquete(false)
    setEmojiOpen(false)
    setStickerOpen(false)
    if (!eventoId && eventos[0]) setEventoId(eventos[0].id)
    fecharExtras()
  }

  function inserirArroba() {
    const el = textareaRef.current
    if (el) {
      const pos = el.selectionStart ?? texto.length
      const next = texto.slice(0, pos) + '@' + texto.slice(pos)
      handleTextoChange(next, pos + 1)
      requestAnimationFrame(() => {
        el.focus()
        el.selectionStart = el.selectionEnd = pos + 1
      })
    } else {
      handleTextoChange(texto + '@')
    }
    fecharExtras()
  }

  const toolBtnClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-primary-fg))]'
  const toolBtnActiveClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-primary)_/_0.1)] text-[rgb(var(--color-primary-fg))] transition-colors'

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
    <m.form
      layout
      onSubmit={submit}
      className="card-soft min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-4"
    >
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
      <input type="hidden" name="visibilidade" value={visibilidadeEfetiva} />
      {modoEnquete && (
        <input type="hidden" name="opcoes" value={JSON.stringify(opcoesValidas)} />
      )}
      {modoEvento && <input type="hidden" name="eventoId" value={eventoId} />}

      <div className="flex items-start gap-3">
        <Avatar nome={userName} avatarUrl={userAvatar} size="md" />
        <div className="relative min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            {!expanded ? (
              <m.button
                key="composer-prompt"
                type="button"
                onClick={open}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={springSnappy}
                whileTap={{ scale: 0.99 }}
                className="h-11 w-full rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 text-left text-sm text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--border-strong))]"
              >
                No que você tá pensando, {firstName}?
              </m.button>
            ) : (
              <m.textarea
                key="composer-textarea"
                ref={textareaRef}
                name="conteudo"
                required
                maxLength={3000}
                rows={3}
                value={texto}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={springGentle}
                onChange={(e) => handleTextoChange(e.target.value, e.target.selectionStart)}
                onKeyUp={(e) => handleTextoChange(texto, e.currentTarget.selectionStart)}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files).filter(
                    (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
                  )
                  if (files.length) {
                    e.preventDefault()
                    addFiles(files)
                  }
                }}
                placeholder={`No que você tá pensando, ${firstName}? Use @ para mencionar e # para hashtags`}
                className="w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2.5 text-sm text-[rgb(var(--foreground))] outline-none transition-colors placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))]"
              />
            )}
          </AnimatePresence>
          {mencaoQuery !== null && expanded && (
            <MentionPicker
              query={mencaoQuery}
              onSelect={inserirMencao}
              onClose={() => setMencaoQuery(null)}
            />
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && modoEnquete && (
          <m.div
            key="poll-options"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springGentle}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 pl-[52px]">
          <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">Opções da enquete</p>
          {opcoes.map((op, i) => (
            <input
              key={i}
              value={op}
              onChange={(e) =>
                setOpcoes((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
              }
              maxLength={120}
              placeholder={`Opção ${i + 1}`}
              className="h-9 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
            />
          ))}
          {opcoes.length < 6 && (
            <button
              type="button"
              onClick={() => setOpcoes((prev) => [...prev, ''])}
              className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              + Adicionar opção
            </button>
          )}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {expanded && modoEvento && eventos.length > 0 && (
          <m.div
            key="event-select"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springGentle}
            className="overflow-hidden"
          >
            <div className="mt-3 pl-[52px]">
          <label className="text-xs font-medium text-[rgb(var(--foreground-muted))]">Evento vinculado</label>
          <select
            value={eventoId}
            onChange={(e) => setEventoId(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
          >
            {eventos.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.titulo}
              </option>
            ))}
          </select>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            key="composer-expanded"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springGentle}
            className="overflow-hidden"
          >
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
              <Link2 className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-t border-[rgb(var(--border))] pt-3">
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Adicionar foto ou vídeo"
                  title="Foto ou vídeo"
                  className={toolBtnClass}
                >
                  <ImagePlus className="h-5 w-5" />
                </button>

                {/* Desktop: todas as opções visíveis */}
                <div className="hidden items-center gap-1 sm:flex">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setEmojiOpen((v) => !v)
                        setStickerOpen(false)
                      }}
                      aria-label="Emojis"
                      className={toolBtnClass}
                    >
                      <Smile className="h-5 w-5" />
                    </button>
                    <AnimatePresence>
                      {emojiOpen && (
                        <EmojiPicker key="emoji" onSelect={(e) => insertEmoji(e)} onClose={() => setEmojiOpen(false)} />
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setStickerOpen((v) => !v)
                        setEmojiOpen(false)
                      }}
                      aria-label="Stickers"
                      className={toolBtnClass}
                    >
                      <StickerIcon className="h-5 w-5" />
                    </button>
                    <AnimatePresence>
                      {stickerOpen && (
                        <StickerPicker key="sticker" onSelect={addSticker} onClose={() => setStickerOpen(false)} />
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    type="button"
                    onClick={toggleEnquete}
                    aria-label="Criar enquete"
                    title="Enquete"
                    className={modoEnquete ? toolBtnActiveClass : toolBtnClass}
                  >
                    <BarChart3 className="h-5 w-5" />
                  </button>
                  {eventos.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleEvento}
                      aria-label="Vincular evento"
                      title="Evento"
                      className={modoEvento ? toolBtnActiveClass : toolBtnClass}
                    >
                      <CalendarDays className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={inserirArroba}
                    aria-label="Mencionar membro"
                    title="Mencionar"
                    className={toolBtnClass}
                  >
                    <AtSign className="h-5 w-5" />
                  </button>
                </div>

                {/* Mobile: opções extras no menu + */}
                <div ref={extrasRef} className="relative sm:hidden">
                  <m.button
                    type="button"
                    onClick={() => {
                      setExtrasOpen((v) => !v)
                      setAlcanceOpen(false)
                      setEmojiOpen(false)
                      setStickerOpen(false)
                    }}
                    aria-label="Mais opções de publicação"
                    aria-expanded={extrasOpen}
                    whileTap={{ scale: 0.92 }}
                    transition={springSnappy}
                    className={[
                      toolBtnClass,
                      extrasOpen || modoEnquete || modoEvento
                        ? 'bg-[rgb(var(--color-primary)_/_0.1)] text-[rgb(var(--color-primary-fg))]'
                        : '',
                    ].join(' ')}
                  >
                    <m.span
                      animate={{ rotate: extrasOpen ? 45 : 0 }}
                      transition={springSnappy}
                      className="inline-flex"
                    >
                      <Plus className="h-5 w-5" />
                    </m.span>
                  </m.button>

                  <AnimatePresence>
                    {extrasOpen && (
                      <m.div
                        key="extras-menu"
                        variants={popoverPanel}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        transition={springGentle}
                        className="card-soft absolute bottom-full left-0 z-20 mb-2 min-w-[11rem] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1"
                      >
                        <m.button
                          type="button"
                          custom={0}
                          variants={menuItemStagger}
                          initial="hidden"
                          animate="show"
                          onClick={() => {
                            fecharExtras()
                            setStickerOpen(false)
                            setEmojiOpen(true)
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                        >
                          <Smile className="h-4 w-4 shrink-0" />
                          Emoji
                        </m.button>
                        <m.button
                          type="button"
                          custom={1}
                          variants={menuItemStagger}
                          initial="hidden"
                          animate="show"
                          onClick={() => {
                            fecharExtras()
                            setEmojiOpen(false)
                            setStickerOpen(true)
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                        >
                          <StickerIcon className="h-4 w-4 shrink-0" />
                          Sticker
                        </m.button>
                        <m.button
                          type="button"
                          custom={2}
                          variants={menuItemStagger}
                          initial="hidden"
                          animate="show"
                          onClick={toggleEnquete}
                          className={[
                            'flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-[rgb(var(--background-subtle))]',
                            modoEnquete ? 'font-medium text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground))]',
                          ].join(' ')}
                        >
                          <BarChart3 className="h-4 w-4 shrink-0" />
                          Enquete
                        </m.button>
                        {eventos.length > 0 && (
                          <m.button
                            type="button"
                            custom={3}
                            variants={menuItemStagger}
                            initial="hidden"
                            animate="show"
                            onClick={toggleEvento}
                            className={[
                              'flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-[rgb(var(--background-subtle))]',
                              modoEvento ? 'font-medium text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground))]',
                            ].join(' ')}
                          >
                            <CalendarDays className="h-4 w-4 shrink-0" />
                            Evento
                          </m.button>
                        )}
                        <m.button
                          type="button"
                          custom={eventos.length > 0 ? 4 : 3}
                          variants={menuItemStagger}
                          initial="hidden"
                          animate="show"
                          onClick={inserirArroba}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                        >
                          <AtSign className="h-4 w-4 shrink-0" />
                          Mencionar
                        </m.button>
                      </m.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {emojiOpen && (
                      <m.div key="emoji-mobile" className="absolute bottom-full left-0 z-30 mb-2">
                        <EmojiPicker onSelect={(e) => insertEmoji(e)} onClose={() => setEmojiOpen(false)} />
                      </m.div>
                    )}
                    {stickerOpen && (
                      <m.div key="sticker-mobile" className="absolute bottom-full left-0 z-30 mb-2">
                        <StickerPicker onSelect={addSticker} onClose={() => setStickerOpen(false)} />
                      </m.div>
                    )}
                  </AnimatePresence>
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

            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              {somentePublico ? (
                <span className="mr-auto text-xs text-[rgb(var(--foreground-muted))] sm:mr-0">
                  Visível para torcedores do clube
                </span>
              ) : (
                <div ref={alcanceRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setAlcanceOpen((v) => !v)
                      setExtrasOpen(false)
                      setEmojiOpen(false)
                      setStickerOpen(false)
                    }}
                    aria-label="Visibilidade do post"
                    aria-expanded={alcanceOpen}
                    aria-haspopup="listbox"
                    className={[
                      'inline-flex h-9 max-w-[13rem] items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] py-0 pl-2.5 pr-2 text-sm font-medium text-[rgb(var(--foreground))] outline-none transition-[border-color,box-shadow,background-color]',
                      'hover:border-[rgb(var(--foreground-muted)_/_0.45)] focus:border-[rgb(var(--color-primary))] focus:ring-2 focus:ring-[rgb(var(--color-primary)_/_0.25)]',
                      alcanceOpen ? 'border-[rgb(var(--color-primary))] ring-2 ring-[rgb(var(--color-primary)_/_0.25)]' : '',
                    ].join(' ')}
                  >
                    <AlcanceIcon
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]"
                    />
                    <span className="min-w-0 truncate">{opcaoVisibilidadeAtual.label}</span>
                    <ChevronDown
                      aria-hidden
                      className={[
                        'h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))] transition-transform',
                        alcanceOpen ? 'rotate-180' : '',
                      ].join(' ')}
                    />
                  </button>
                  <AnimatePresence>
                    {alcanceOpen && (
                      <m.div
                        key="alcance-menu"
                        role="listbox"
                        aria-label="Visibilidade do post"
                        variants={popoverPanel}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        transition={springGentle}
                        className="card-soft absolute bottom-full right-0 z-30 mb-2 min-w-[15.5rem] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
                      >
                        {VISIBILIDADE_OPCOES.map((opcao, index) => {
                          const selecionada = opcao.value === visibilidadeEfetiva
                          const bloqueada = opcao.value === 'PUBLICO' && perfilPrivado
                          const Icon = opcao.Icon
                          return (
                            <m.button
                              key={opcao.value}
                              type="button"
                              role="option"
                              aria-selected={selecionada}
                              aria-disabled={bloqueada || undefined}
                              custom={index}
                              variants={menuItemStagger}
                              initial="hidden"
                              animate="show"
                              onClick={() => onEscolherVisibilidade(opcao.value)}
                              className={[
                                'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                                bloqueada
                                  ? 'cursor-pointer opacity-55 hover:bg-[rgb(var(--background-subtle))]'
                                  : 'hover:bg-[rgb(var(--background-subtle))]',
                                selecionada && !bloqueada
                                  ? 'bg-[rgb(var(--color-primary)_/_0.08)]'
                                  : '',
                              ].join(' ')}
                            >
                              <Icon
                                aria-hidden
                                className={[
                                  'mt-0.5 h-4 w-4 shrink-0',
                                  selecionada && !bloqueada
                                    ? 'text-[rgb(var(--color-primary-fg))]'
                                    : 'text-[rgb(var(--foreground-muted))]',
                                ].join(' ')}
                              />
                              <span className="min-w-0 flex-1">
                                <span
                                  className={[
                                    'block text-sm font-medium',
                                    selecionada && !bloqueada
                                      ? 'text-[rgb(var(--color-primary-fg))]'
                                      : 'text-[rgb(var(--foreground))]',
                                  ].join(' ')}
                                >
                                  {opcao.label}
                                  {bloqueada ? ' (indisponível)' : ''}
                                </span>
                                <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                                  {bloqueada
                                    ? 'Perfil privado — toque para alterar a privacidade'
                                    : opcao.descricao}
                                </span>
                              </span>
                              {selecionada && !bloqueada && (
                                <Check
                                  aria-hidden
                                  className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]"
                                />
                              )}
                              {bloqueada && (
                                <Lock
                                  aria-hidden
                                  className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]"
                                />
                              )}
                            </m.button>
                          )
                        })}
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!podePublicar}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-3 text-sm font-semibold text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 disabled:opacity-50 sm:px-4"
              >
                {pending || enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="max-sm:sr-only">
                  {enviando ? 'Enviando…' : pending ? 'Publicando…' : modoEnquete ? 'Publicar enquete' : modoEvento ? 'Publicar evento' : 'Publicar'}
                </span>
              </button>
            </div>
          </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
    </m.form>
  )
}
