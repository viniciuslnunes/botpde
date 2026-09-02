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
  Info,
  AlertTriangle,
  Siren,
  Megaphone,
  Newspaper,
  type LucideIcon,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  formatNomeTorcida,
  FORUM_CORPO_MAX,
  ARTIGO_TITULO_MAX,
  ARTIGO_CORPO_MAX,
  tituloDeConteudoForum,
} from '@torcida/types'
import {
  publicarPost,
  publicarEnquete,
  publicarPostEvento,
  publicarPostCanal,
  publicarPostNacional,
  type PublicarPostState,
} from '@/app/portal/comunidade/actions'
import {
  criarTopicoComposerAction,
  publicarArtigoComposerAction,
  type ArtigoComposerState,
} from '@/app/portal/comunidade/praca-actions'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import {
  publicarComunicadoComposer,
  atualizarComunicadoComposer,
  type ComunicadoComposerState,
} from '@/app/admin/comunidade/actions'
import type { EventoComposerItem } from '@/lib/eventos'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { FileDropOverlay, useFileDragOver } from '@/components/media/file-drop-overlay'
import { firstSocialUrlInText, detectEmbedProvider, EMBED_HOSTS, ensureSocialEmbedInMidias, classifyMedia } from '@/lib/social-embed'
import { emitirPostPublicado, criarPreviewOtimista, novoIdOtimista } from '@/lib/feed-live-refresh'
import { Avatar } from './avatar'
import { EmojiPicker } from './emoji-picker'
import { StickerPicker } from './sticker-picker'
import { MentionPicker, detectarMencaoAtiva, type MencaoSelecionada } from './mention-picker'
import { AnchoredPopover } from './anchored-popover'
import { ComposerMentionHighlight } from './composer-mention-highlight'
import { ExpandableText } from './expandable-text'
import { PostMedia } from './post-media'
import {
  paraTextoLegivel,
  podarMencoes,
  serializarMencoes,
  type MencaoParsed,
} from '@/lib/comunidade-social'
import { menuItemStagger, popoverPanel, springGentle, springSnappy } from '@/lib/motion-presets'
import { useUnsavedChanges, useOptionalUnsavedChangesContext } from '@/lib/unsaved-changes'
import { useConfirmDialog } from '@/lib/confirm-action'
import { useMediaQuery } from '@/lib/use-media-query'

const INITIAL_STATE: PublicarPostState = {}
const INITIAL_COMUNICADO_STATE: ComunicadoComposerState = {}
const INITIAL_ARTIGO_STATE: ArtigoComposerState = {}
const MAX_ANEXOS = 10
const MAX_IMG_MB = 10
const MAX_VIDEO_MB = 100

type Prioridade = 'NORMAL' | 'IMPORTANTE' | 'URGENTE'

const PRIORIDADE_OPCOES: Array<{
  value: Prioridade
  label: string
  descricao: string
  Icon: LucideIcon
}> = [
  { value: 'NORMAL', label: 'Normal', descricao: 'Aviso do dia a dia', Icon: Info },
  { value: 'IMPORTANTE', label: 'Importante', descricao: 'Merece destaque', Icon: AlertTriangle },
  { value: 'URGENTE', label: 'Urgente', descricao: 'Notifica a torcida na hora', Icon: Siren },
]

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

export interface CanalComposerAlvo {
  conversaId: string
  /** Nome do canal — usado no placeholder ("Publicar em ..."). */
  nome: string | null
}

export interface ComunicadoEdicaoAlvo {
  id: string
  titulo: string
  corpo: string
  prioridade: Prioridade
  midiaUrls: string[]
  /** Chamado após salvar com sucesso — fecha o modo de edição no chamador. */
  onSalvo?: () => void
  /** Chamado ao cancelar (com confirmação de descarte se houver alteração). */
  onCancelar?: () => void
}

interface FeedComposerProps {
  userId: string
  userName: string | null
  userAvatar: string | null
  tenantId: string
  tenantNome: string
  perfilPrivado?: boolean
  eventos?: EventoComposerItem[]
  /** Quando true, só permite posts PUBLICO (torcedor aguardando aprovação / global). */
  somentePublico?: boolean
  /** Quando definido, substitui o composer por aviso (ex.: cadastro pendente). */
  bloqueioPublicacao?: string | null
  /** Deep-link da Agenda — abre modo evento com este id pré-selecionado. */
  eventoIdInicial?: string
  /**
   * Quando definido, publica no mural de um canal em vez do feed pessoal:
   * mesmo componente (mídia, menções, emoji), sem alcance/enquete/evento —
   * visibilidade fica presa aos membros do canal.
   */
  canal?: CanalComposerAlvo
  /**
   * Comunidade Nacional (torcedor global / aba Nacional): mesmo composer
   * (mídia, vídeo, menções, emoji, stickers), sempre PUBLICO no tenant
   * sintético do clube — sem alcance/enquete/evento. Mutuamente exclusivo
   * com `canal` e `comunicado`.
   */
  nacional?: boolean
  /**
   * Fórum (CN, torcida ou unidade): o mesmo composer do feed, mas publica
   * `ForumTopico` em vez de Post. Sem alcance/enquete/evento. Mutuamente
   * exclusivo com `canal` / `nacional` / `comunicado` / `noticia`.
   */
  forum?: EscopoComunidade
  /** UGC entra na fila; o botão e a prévia avisam. */
  forumFilaAprovacao?: boolean
  /**
   * Praça de notícias: o mesmo composer de comunicado (título, mídia, prévia),
   * sem prioridade. Publica `ArtigoPortal` no canal oficial da torcida/unidade
   * ou em canal verificado de portal. Mutuamente exclusivo com os outros modos.
   */
  noticia?: EscopoComunidade
  /** Cargo/sede/depto do autor — prepend otimista no feed. */
  autorBadges?: {
    cargoNome: string | null
    departamentoNome: string | null
    sedeNome: string | null
    sedeTipo?: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO' | null
  }
  /**
   * Quando `true`, publica um Comunicado oficial (admin) em vez de post de
   * membro: mesmo composer (mídia, menções, emoji), com campo de Título e
   * seletor de Prioridade no lugar de Enquete/Evento/Visibilidade, mais uma
   * prévia fiel de como o comunicado vai aparecer no feed. Passe um
   * `ComunicadoEdicaoAlvo` para editar um comunicado existente (composer
   * abre pré-preenchido, já expandido, chamando `atualizarComunicadoComposer`
   * em vez de publicar um novo). Mutuamente exclusivo com `canal` / `nacional`.
   */
  comunicado?: boolean | ComunicadoEdicaoAlvo
}

export function FeedComposer({
  userId,
  userName,
  userAvatar,
  tenantId,
  tenantNome,
  perfilPrivado = false,
  eventos = [],
  bloqueioPublicacao = null,
  somentePublico = false,
  eventoIdInicial,
  canal,
  nacional = false,
  forum,
  forumFilaAprovacao = false,
  autorBadges,
  comunicado = false,
  noticia,
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
      tenantId={tenantId}
      tenantNome={tenantNome}
      perfilPrivado={perfilPrivado}
      eventos={eventos}
      somentePublico={somentePublico || nacional}
      eventoIdInicial={eventoIdInicial}
      canal={canal}
      nacional={nacional}
      forum={forum}
      forumFilaAprovacao={forumFilaAprovacao}
      autorBadges={autorBadges}
      comunicado={comunicado}
      noticia={noticia}
    />
  )
}

function FeedComposerActive({
  userId,
  userName,
  userAvatar,
  tenantId,
  tenantNome,
  perfilPrivado = false,
  eventos = [],
  somentePublico = false,
  eventoIdInicial,
  canal,
  nacional = false,
  forum,
  forumFilaAprovacao = false,
  autorBadges,
  comunicado = false,
  noticia,
}: Omit<FeedComposerProps, 'bloqueioPublicacao'>) {
  const router = useRouter()
  const optimisticIdRef = useRef<string | null>(null)
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
  const [canalState, canalAction, canalPending] = useActionState<PublicarPostState, FormData>(
    publicarPostCanal,
    INITIAL_STATE,
  )
  const [nacionalState, nacionalAction, nacionalPending] = useActionState<
    PublicarPostState,
    FormData
  >(publicarPostNacional, INITIAL_STATE)
  const [forumState, forumAction, forumPending] = useActionState<PublicarPostState, FormData>(
    criarTopicoComposerAction,
    INITIAL_STATE,
  )
  const [noticiaState, noticiaAction, noticiaPending] = useActionState<
    ArtigoComposerState,
    FormData
  >(publicarArtigoComposerAction, INITIAL_ARTIGO_STATE)
  const comunicadoEdicao = typeof comunicado === 'object' ? comunicado : null
  const [comunicadoState, comunicadoAction, comunicadoPending] = useActionState<
    ComunicadoComposerState,
    FormData
  >(
    comunicadoEdicao
      ? atualizarComunicadoComposer.bind(null, comunicadoEdicao.id)
      : publicarComunicadoComposer,
    INITIAL_COMUNICADO_STATE,
  )

  const token = comunicado
    ? (comunicadoState.token ?? 'novo')
    : noticia
      ? (noticiaState.token ?? 'novo')
      : forum
      ? (forumState.token ?? 'novo')
      : canal
      ? (canalState.token ?? 'novo')
      : nacional
        ? (nacionalState.token ?? 'novo')
        : (postState.token ?? pollState.token ?? eventState.token ?? 'novo')
  const state = comunicado
    ? comunicadoState
    : noticia
      ? noticiaState
      : forum
      ? forumState
      : canal
      ? canalState
      : nacional
        ? nacionalState
        : postState.token || postState.success
          ? postState
          : pollState.token || pollState.success
            ? pollState
            : eventState

  function registrarPrependOtimista(opts: {
    conteudo: string
    midiaUrls: string[]
    visibilidade: VisibilidadePost
  }) {
    const id = novoIdOtimista()
    optimisticIdRef.current = id
    emitirPostPublicado({
      preview: criarPreviewOtimista({
        id,
        tenantId,
        conteudo: opts.conteudo,
        midiaUrls: opts.midiaUrls,
        visibilidade: opts.visibilidade,
        autor: {
          id: userId,
          nome: userName,
          avatarUrl: userAvatar,
          sedeNome: autorBadges?.sedeNome ?? null,
          sedeTipo: autorBadges?.sedeTipo ?? null,
          cargoNome: autorBadges?.cargoNome ?? null,
          departamentoNome: autorBadges?.departamentoNome ?? null,
        },
        tenantNome: formatNomeTorcida(tenantNome),
      }),
      filtroAlvo: canal ? 'canal' : 'descobrir',
    })
  }

  // Feed infinite: confirma o prepend otimista com id real da action.
  useEffect(() => {
    const preview = canal
      ? canalState.preview
      : nacional
        ? nacionalState.preview
        : (postState.preview ?? pollState.preview ?? eventState.preview)
    const success = canal
      ? canalState.success
      : nacional
        ? nacionalState.success
        : postState.success || pollState.success || eventState.success
    const falhou = canal
      ? Boolean(canalState.message && !canalState.success)
      : nacional
        ? Boolean(nacionalState.message && !nacionalState.success)
        : Boolean(
            (postState.message && !postState.success) ||
              (pollState.message && !pollState.success) ||
              (eventState.message && !eventState.success),
          )

    if (success && preview) {
      emitirPostPublicado({
        preview,
        substituirId: optimisticIdRef.current ?? undefined,
        filtroAlvo: canal ? 'canal' : 'descobrir',
      })
      optimisticIdRef.current = null
      return
    }

    if (falhou && optimisticIdRef.current) {
      emitirPostPublicado({ removerId: optimisticIdRef.current })
      optimisticIdRef.current = null
    }
  }, [
    canal,
    nacional,
    canalState.success,
    canalState.message,
    canalState.token,
    canalState.preview,
    nacionalState.success,
    nacionalState.message,
    nacionalState.token,
    nacionalState.preview,
    postState.success,
    postState.message,
    postState.token,
    postState.preview,
    pollState.success,
    pollState.message,
    pollState.token,
    pollState.preview,
    eventState.success,
    eventState.message,
    eventState.token,
    eventState.preview,
  ])

  useEffect(() => {
    if (!comunicado || !comunicadoState.success) return
    if (comunicadoEdicao) {
      toast.success('Comunicado atualizado.')
      comunicadoEdicao.onSalvo?.()
      router.refresh()
    } else {
      toast.success('Comunicado publicado.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comunicado, comunicadoState.success, comunicadoState.token])

  useEffect(() => {
    if (!noticia || !noticiaState.success || !noticiaState.artigoId) return
    toast.success('Notícia publicada.')
    router.push(`/portal/comunidade/noticias/${noticiaState.artigoId}?escopo=${noticia}`)
  }, [noticia, noticiaState.artigoId, noticiaState.success, noticiaState.token, router])

  useEffect(() => {
    if (!forum || !forumState.success || !forumState.topicoId) return
    toast.success(
      forumState.pendente
        ? 'Tópico enviado para aprovação.'
        : 'Tópico publicado.',
    )
    router.push(`/portal/comunidade/forum/${forumState.topicoId}?escopo=${forum}`)
  }, [forum, forumState.pendente, forumState.success, forumState.token, forumState.topicoId, router])

  return (
    <div id="feed-composer" className="scroll-mt-24">
    <ComposerBody
      key={token}
      userId={userId}
      userName={userName}
      userAvatar={userAvatar}
      tenantNome={tenantNome}
      perfilPrivado={perfilPrivado}
      postAction={postAction}
      pollAction={pollAction}
      eventAction={eventAction}
      canalAction={canalAction}
      nacionalAction={nacionalAction}
      forumAction={forumAction}
      comunicadoAction={comunicadoAction}
      noticiaAction={noticiaAction}
      postPending={postPending}
      pollPending={pollPending}
      eventPending={eventPending}
      canalPending={canalPending}
      nacionalPending={nacionalPending}
      forumPending={forumPending}
      comunicadoPending={comunicadoPending}
      noticiaPending={noticiaPending}
      eventos={eventos}
      somentePublico={somentePublico}
      eventoIdInicial={eventoIdInicial}
      canal={canal}
      nacional={nacional}
      forum={forum}
      forumFilaAprovacao={forumFilaAprovacao}
      comunicado={comunicado}
      noticia={noticia}
      onPrependOtimista={registrarPrependOtimista}
      serverError={
        state.message ??
        state.errors?.conteudo?.[0] ??
        state.errors?.midias?.[0] ??
        state.errors?.opcoes?.[0] ??
        state.errors?.eventoId?.[0] ??
        state.errors?.titulo?.[0] ??
        state.errors?.corpo?.[0]
      }
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

function ForumComposerPreview({
  userName,
  userAvatar,
  texto,
  midias,
  fila,
}: {
  userName: string | null
  userAvatar: string | null
  texto: string
  midias: string[]
  fila: boolean
}) {
  const titulo = tituloDeConteudoForum(texto)
  const vazio = !texto.trim() && midias.length === 0
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Prévia — como o tópico aparece
      </p>
      {vazio ? (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-8 text-center text-xs text-[rgb(var(--foreground-muted))]">
          Escreva à esquerda. Foto, vídeo e texto aparecem aqui na hora.
        </p>
      ) : (
        <article className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
          <div className="flex items-center gap-2.5">
            <Avatar nome={userName} avatarUrl={userAvatar} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                {userName ?? 'Você'}
              </p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">agora</p>
            </div>
          </div>
          {titulo ? (
            <h3 className="mt-3 text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</h3>
          ) : null}
          {texto.trim() ? (
            <ExpandableText
              conteudo={texto.trim()}
              lines={6}
              className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
            />
          ) : null}
          {midias.length > 0 ? <PostMedia urls={midias} caption={texto} /> : null}
        </article>
      )}
      {fila ? (
        <p className="mt-2 text-[11px] text-[rgb(var(--foreground-muted))]">
          Entra na fila de aprovação deste canal antes de aparecer no ranking.
        </p>
      ) : null}
    </div>
  )
}

function ComposerBody({
  userId,
  userName,
  userAvatar,
  tenantNome,
  perfilPrivado,
  postAction,
  pollAction,
  eventAction,
  canalAction,
  nacionalAction,
  forumAction,
  comunicadoAction,
  noticiaAction,
  postPending,
  pollPending,
  eventPending,
  canalPending,
  nacionalPending,
  forumPending,
  comunicadoPending,
  noticiaPending,
  serverError,
  eventos,
  somentePublico = false,
  eventoIdInicial,
  canal,
  nacional = false,
  forum,
  forumFilaAprovacao = false,
  comunicado = false,
  noticia,
  onPrependOtimista,
}: {
  userId: string
  userName: string | null
  userAvatar: string | null
  tenantNome: string
  perfilPrivado: boolean
  postAction: (payload: FormData) => void
  pollAction: (payload: FormData) => void
  eventAction: (payload: FormData) => void
  canalAction: (payload: FormData) => void
  nacionalAction: (payload: FormData) => void
  forumAction: (payload: FormData) => void
  comunicadoAction: (payload: FormData) => void
  noticiaAction: (payload: FormData) => void
  postPending: boolean
  pollPending: boolean
  eventPending: boolean
  canalPending: boolean
  nacionalPending: boolean
  forumPending: boolean
  comunicadoPending: boolean
  noticiaPending: boolean
  serverError?: string
  eventos: EventoComposerItem[]
  somentePublico?: boolean
  eventoIdInicial?: string
  canal?: CanalComposerAlvo
  nacional?: boolean
  forum?: EscopoComunidade
  forumFilaAprovacao?: boolean
  comunicado?: boolean | ComunicadoEdicaoAlvo
  noticia?: EscopoComunidade
  onPrependOtimista: (opts: {
    conteudo: string
    midiaUrls: string[]
    visibilidade: VisibilidadePost
  }) => void
}) {
  const comunicadoEdicao = typeof comunicado === 'object' ? comunicado : null
  const editorial = Boolean(comunicado) || Boolean(noticia)
  /** Enquete/evento/alcance só no feed da torcida — canal, CN, fórum e editorial não. */
  const ferramentasTorcida = !canal && !comunicado && !nacional && !forum && !noticia
  const eventoPreselecionado =
    eventoIdInicial && eventos.some((e) => e.id === eventoIdInicial)
      ? eventoIdInicial
      : undefined

  const [expanded, setExpanded] = useState(
    Boolean(forum) || Boolean(eventoPreselecionado) || Boolean(comunicadoEdicao),
  )
  const [modoEnquete, setModoEnquete] = useState(false)
  const [modoEvento, setModoEvento] = useState(Boolean(eventoPreselecionado))
  const [eventoId, setEventoId] = useState(
    eventoPreselecionado ?? eventos[0]?.id ?? '',
  )
  const [texto, setTexto] = useState(comunicadoEdicao?.corpo ?? '')
  const [titulo, setTitulo] = useState(comunicadoEdicao?.titulo ?? '')
  const [prioridade, setPrioridade] = useState<Prioridade>(comunicadoEdicao?.prioridade ?? 'NORMAL')
  const [mencoes, setMencoes] = useState<MencaoParsed[]>([])
  const [opcoes, setOpcoes] = useState(['', ''])
  const [mencaoQuery, setMencaoQuery] = useState<string | null>(null)
  const [visibilidade, setVisibilidade] = useState<VisibilidadePost>(
    somentePublico ? 'PUBLICO' : perfilPrivado ? 'PRIVADO' : 'PUBLICO',
  )
  const [alcanceOpen, setAlcanceOpen] = useState(false)
  const [medias, setMedias] = useState<MediaItem[]>(() => {
    if (!comunicadoEdicao) return []
    return classifyMedia(comunicadoEdicao.midiaUrls).media.map((m) => ({
      id: m.url,
      kind: m.type,
      localUrl: m.url,
      url: m.url,
      progress: 100,
      error: null,
    }))
  })
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [embedDispensado, setEmbedDispensado] = useState(false)
  const [extrasOpen, setExtrasOpen] = useState(false)
  const fileDrag = useFileDragOver(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composerFieldRef = useRef<HTMLDivElement>(null)
  const emojiDesktopRef = useRef<HTMLDivElement>(null)
  const stickerDesktopRef = useRef<HTMLDivElement>(null)
  const extrasRef = useRef<HTMLDivElement>(null)
  const alcanceRef = useRef<HTMLDivElement>(null)
  // O gatilho "+" só existe abaixo de `sm` (o container é `sm:hidden`). Antes
  // isso era medido lendo o DOM no render (`getClientRects()` da ref), que é
  // acesso a ref durante o render e ainda erra no primeiro paint. A condição
  // real é a media query — mesmo breakpoint do Tailwind.
  const extrasVisivel = useMediaQuery('(max-width: 639px)')
  const [, startTransition] = useTransition()
  const router = useRouter()
  const confirmDialog = useConfirmDialog()
  const unsavedChangesCtx = useOptionalUnsavedChangesContext()

  async function handleCancelar() {
    if (comunicadoEdicao) {
      const ok = unsavedChangesCtx ? await unsavedChangesCtx.confirmDiscard() : true
      if (ok) comunicadoEdicao.onCancelar?.()
      return
    }
    if (forum) {
      router.push(`/portal/comunidade/forum?escopo=${forum}&aba=topicos`)
      return
    }
    setExpanded(false)
  }

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
  const pending = comunicado
    ? comunicadoPending
    : noticia
      ? noticiaPending
      : forum
      ? forumPending
      : canal
      ? canalPending
      : nacional
        ? nacionalPending
        : modoEnquete
          ? pollPending
          : modoEvento
            ? eventPending
            : postPending
  const anexos = medias.filter((m) => m.url).map((m) => m.url as string)
  const finalMidias = embedDispensado
    ? anexos
    : ensureSocialEmbedInMidias(texto, [...anexos, ...(embedUrl ? [embedUrl] : [])])
  const opcoesValidas = opcoes.map((o) => o.trim()).filter(Boolean)
  const podePublicar = editorial
    ? titulo.trim().length > 0 && texto.trim().length > 0 && !enviando && !pending
    : modoEnquete
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

  const opcaoPrioridadeAtual =
    PRIORIDADE_OPCOES.find((opcao) => opcao.value === prioridade) ?? PRIORIDADE_OPCOES[0]!
  const PrioridadeIcon = opcaoPrioridadeAtual.Icon

  const popoverAberto =
    alcanceOpen || emojiOpen || stickerOpen || extrasOpen || mencaoQuery !== null

  const composerChanges = useMemo(() => {
    const list: string[] = []
    if (comunicadoEdicao) {
      if (titulo.trim() !== comunicadoEdicao.titulo.trim()) list.push('Título')
      if (texto.trim() !== comunicadoEdicao.corpo.trim()) list.push('Texto')
      if (prioridade !== comunicadoEdicao.prioridade) list.push('Prioridade')
      if (anexos.join(',') !== comunicadoEdicao.midiaUrls.join(',')) list.push('Anexos')
      return list
    }
    if (comunicado && titulo.trim()) list.push('Título')
    if (noticia && titulo.trim()) list.push('Título')
    if (texto.trim()) list.push('Texto')
    if (medias.length > 0) list.push(`Anexos (${medias.length})`)
    if (modoEnquete) list.push('Enquete')
    if (modoEvento) list.push('Evento')
    return list
  }, [comunicado, comunicadoEdicao, noticia, titulo, texto, prioridade, anexos, medias.length, modoEnquete, modoEvento])

  useUnsavedChanges({
    id: comunicadoEdicao ? `comunicado-editar-${comunicadoEdicao.id}` : 'feed-composer',
    title: comunicadoEdicao ? 'Editar comunicado' : 'Nova publicação',
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
    // Estado React (não só o hidden) — evita midias vazias se o DOM estiver stale.
    fd.set('midias', JSON.stringify(finalMidias))

    if (forum) {
      fd.set('escopo', forum)
      startTransition(() => {
        forumAction(fd)
      })
      return
    }

    if (noticia) {
      fd.set('titulo', titulo.trim())
      fd.set('escopo', noticia)
      startTransition(() => {
        noticiaAction(fd)
      })
      return
    }

    if (comunicado) {
      fd.set('titulo', titulo.trim())
      fd.set('prioridade', prioridade)
      startTransition(() => {
        comunicadoAction(fd)
      })
      return
    }

    onPrependOtimista({
      conteudo: serializarMencoes(texto, mencoes),
      midiaUrls: finalMidias,
      visibilidade: visibilidadeEfetiva,
    })
    startTransition(() => {
      if (canal) {
        canalAction(fd)
      } else if (nacional) {
        nacionalAction(fd)
      } else if (modoEnquete) {
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
  // `media=video` (vindo de /videos) abre o seletor de arquivo após expandir.
  useEffect(() => {
    function onCompose(preferVideo = false) {
      setExpanded(true)
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        if (preferVideo) {
          window.setTimeout(() => fileInputRef.current?.click(), 120)
        }
      })
    }
    function onComposeEvent() {
      onCompose(false)
    }
    window.addEventListener('comunidade:compose', onComposeEvent)
    const params = new URLSearchParams(window.location.search)
    if (params.get('compose') === '1') {
      onCompose(params.get('media') === 'video')
    }
    return () => window.removeEventListener('comunidade:compose', onComposeEvent)
  }, [])

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node
      const inPortal =
        target instanceof Element && Boolean(target.closest('[data-anchored-popover]'))
      if (!extrasRef.current?.contains(target) && !inPortal) setExtrasOpen(false)
      if (!alcanceRef.current?.contains(target) && !inPortal) setAlcanceOpen(false)
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
      // Layout projection desalinha o overlay absoluto durante o arraste.
      layout={!fileDrag.active}
      onSubmit={submit}
      onDragEnter={fileDrag.onDragEnter}
      onDragOver={fileDrag.onDragOver}
      onDragLeave={fileDrag.onDragLeave}
      onDrop={(e) => {
        const files = fileDrag.finishDrop(e)
        if (files.length) {
          setExpanded(true)
          addFiles(files)
        }
      }}
      className={[
        'card-soft relative min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:p-4',
        (forum && expanded) || popoverAberto ? 'overflow-visible' : 'overflow-hidden',
      ].join(' ')}
    >
      <FileDropOverlay active={fileDrag.active} />
      <input type="hidden" name="midias" value={JSON.stringify(finalMidias)} />
      {forum ? <input type="hidden" name="escopo" value={forum} /> : null}
      {noticia ? <input type="hidden" name="escopo" value={noticia} /> : null}
      {canal ? (
        <input type="hidden" name="conversaId" value={canal.conversaId} />
      ) : editorial ? null : (
        <input type="hidden" name="visibilidade" value={visibilidadeEfetiva} />
      )}
      {modoEnquete && (
        <input type="hidden" name="opcoes" value={JSON.stringify(opcoesValidas)} />
      )}
      {modoEvento && <input type="hidden" name="eventoId" value={eventoId} />}

      <div
        className={
          forum && expanded
            ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:items-start lg:gap-5'
            : undefined
        }
      >
      <div className="min-w-0">
      <div className="flex items-start gap-3">
        <Avatar nome={userName} avatarUrl={userAvatar} size="md" />
        <div ref={composerFieldRef} className="relative min-w-0 flex-1 space-y-2">
          {editorial && expanded && (
            <input
              type="text"
              name="titulo"
              required
              maxLength={noticia ? ARTIGO_TITULO_MAX : 150}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={noticia ? 'Título da notícia' : 'Título do comunicado'}
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2.5 text-sm font-semibold text-[rgb(var(--foreground))] outline-none transition-colors placeholder:font-normal placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))]"
            />
          )}
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
                {comunicado
                  ? 'Novo comunicado oficial…'
                  : noticia
                    ? 'Nova notícia…'
                    : forum
                    ? `Comece um tópico, ${firstName}…`
                    : canal
                    ? `Publicar em ${canal.nome ?? 'canal'}…`
                    : `No que você tá pensando, ${firstName}?`}
              </m.button>
            ) : (
              <m.div
                key="composer-textarea"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={springGentle}
                className="relative isolate rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] transition-colors focus-within:border-[rgb(var(--primary))]"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-normal text-[rgb(var(--foreground))]"
                >
                  <ComposerMentionHighlight texto={texto} mencoes={mencoes} />
                </div>
                <textarea
                  ref={textareaRef}
                  name="conteudo"
                  required
                  maxLength={forum ? FORUM_CORPO_MAX : noticia ? ARTIGO_CORPO_MAX : 3000}
                  rows={forum ? 6 : 3}
                  value={texto}
                  onChange={(e) => handleTextoChange(e.target.value, e.target.selectionStart)}
                  onKeyUp={(e) => handleTextoChange(texto, e.currentTarget.selectionStart)}
                  onScroll={(e) => {
                    const mirror = e.currentTarget.previousElementSibling as HTMLElement | null
                    if (mirror) {
                      mirror.scrollTop = e.currentTarget.scrollTop
                      mirror.scrollLeft = e.currentTarget.scrollLeft
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
                  placeholder={
                    comunicado
                      ? 'Escreva o comunicado oficial para a torcida…'
                      : noticia
                        ? 'Escreva a notícia — a prévia aparece abaixo'
                      : forum
                        ? `Comece um tópico, ${firstName}… Use @ para mencionar e # para hashtags`
                        : canal
                        ? `Publicar em ${canal.nome ?? 'canal'}… Use @ para mencionar e # para hashtags`
                        : `No que você tá pensando, ${firstName}? Use @ para mencionar e # para hashtags`
                  }
                  className="relative z-[1] w-full resize-none bg-transparent px-3.5 py-2.5 text-sm leading-normal text-transparent caret-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))]"
                />
              </m.div>
            )}
          </AnimatePresence>
          {mencaoQuery !== null && expanded && (
            <MentionPicker
              query={mencaoQuery}
              onSelect={inserirMencao}
              onClose={() => setMencaoQuery(null)}
              escopo={forum === 'nacional' || nacional ? 'nacional' : undefined}
              anchorRef={composerFieldRef}
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
            className={[
              popoverAberto ? 'overflow-visible' : 'overflow-hidden',
              popoverAberto ? 'relative z-20' : '',
            ].join(' ')}
          >
          {/* Prévia dos anexos */}
          {medias.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
              <AnimatePresence initial={false}>
                {medias.map((media) => (
                  <m.div
                    key={media.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={springSnappy}
                    className="relative h-20 w-20 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
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
                        className={media.kind === 'sticker' ? 'h-full w-full object-contain p-1.5' : 'h-full w-full object-cover'}
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
                      onClick={() => removeMedia(media.id)}
                      aria-label="Remover anexo"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </m.div>
                ))}
              </AnimatePresence>
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

          {editorial && (
            <div className="mt-3 ml-[52px]">
              <p className="mb-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                {noticia ? 'Prévia — como vai aparecer nas notícias' : 'Prévia — como vai aparecer no feed'}
              </p>
              {titulo.trim() || texto.trim() || anexos.length > 0 || (embedUrl && !embedDispensado) ? (
                <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar nome={tenantNome} avatarUrl={null} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                        {formatNomeTorcida(tenantNome)}
                      </p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">agora</p>
                    </div>
                  </div>
                  {anexos.length > 0 || (embedUrl && !embedDispensado) ? (
                    <PostMedia urls={finalMidias} caption={texto} />
                  ) : null}
                  {titulo.trim() ? (
                    <h3 className="mt-3 text-sm font-semibold text-[rgb(var(--foreground))]">
                      {titulo.trim()}
                    </h3>
                  ) : null}
                  {(texto.trim() || (!titulo.trim() && anexos.length === 0)) && (
                    <ExpandableText
                      text={
                        texto.trim() ||
                        (noticia
                          ? 'O texto da notícia aparece aqui.'
                          : 'O texto do comunicado aparece aqui.')
                      }
                      lines={8}
                      className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[rgb(var(--foreground))]"
                    />
                  )}
                  {userName ? (
                    <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">{userName}</p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-4 text-center text-xs text-[rgb(var(--foreground-muted))]">
                  A prévia aparece aqui conforme você escreve.
                </p>
              )}
            </div>
          )}

          {forum && (
            <div className="mt-3 lg:hidden">
              <ForumComposerPreview
                userName={userName}
                userAvatar={userAvatar}
                texto={texto}
                midias={finalMidias}
                fila={forumFilaAprovacao}
              />
            </div>
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
                  <div ref={emojiDesktopRef} className="relative">
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
                  </div>
                  <div ref={stickerDesktopRef} className="relative">
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
                  </div>
                  {ferramentasTorcida && (
                    <button
                      type="button"
                      onClick={toggleEnquete}
                      aria-label="Criar enquete"
                      title="Enquete"
                      className={modoEnquete ? toolBtnActiveClass : toolBtnClass}
                    >
                      <BarChart3 className="h-5 w-5" />
                    </button>
                  )}
                  {ferramentasTorcida && eventos.length > 0 && (
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
                      <AnchoredPopover
                        open
                        anchorRef={extrasRef}
                        placement="top-start"
                        offset={8}
                        minWidth={176}
                        zIndex={60}
                      >
                        <m.div
                          key="extras-menu"
                          variants={popoverPanel}
                          initial="hidden"
                          animate="show"
                          exit="exit"
                          transition={springGentle}
                          className="card-soft min-w-[11rem] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
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
                          {ferramentasTorcida && (
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
                          )}
                          {ferramentasTorcida && eventos.length > 0 && (
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
                            custom={ferramentasTorcida && eventos.length > 0 ? 4 : 3}
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
                      </AnchoredPopover>
                    )}
                  </AnimatePresence>
                </div>

                {/* Pickers únicos — portal; âncora = trigger visível (desktop vs + mobile) */}
                {emojiOpen && (
                  <EmojiPicker
                    anchorRef={
                      extrasVisivel
                        ? extrasRef
                        : emojiDesktopRef
                    }
                    onSelect={(e) => insertEmoji(e)}
                    onClose={() => setEmojiOpen(false)}
                  />
                )}
                {stickerOpen && (
                  <StickerPicker
                    anchorRef={
                      extrasVisivel
                        ? extrasRef
                        : stickerDesktopRef
                    }
                    onSelect={addSticker}
                    onClose={() => setStickerOpen(false)}
                  />
                )}

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
              {comunicado ? (
                <div ref={alcanceRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setAlcanceOpen((v) => !v)
                      setExtrasOpen(false)
                      setEmojiOpen(false)
                      setStickerOpen(false)
                    }}
                    aria-label="Prioridade do comunicado"
                    aria-expanded={alcanceOpen}
                    aria-haspopup="listbox"
                    className={[
                      'inline-flex h-9 max-w-[13rem] items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] py-0 pl-2.5 pr-2 text-sm font-medium text-[rgb(var(--foreground))] outline-none transition-[border-color,box-shadow,background-color]',
                      'hover:border-[rgb(var(--foreground-muted)_/_0.45)] focus:border-[rgb(var(--color-primary))] focus:ring-2 focus:ring-[rgb(var(--color-primary)_/_0.25)]',
                      alcanceOpen ? 'border-[rgb(var(--color-primary))] ring-2 ring-[rgb(var(--color-primary)_/_0.25)]' : '',
                    ].join(' ')}
                  >
                    <PrioridadeIcon
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]"
                    />
                    <span className="min-w-0 truncate">{opcaoPrioridadeAtual.label}</span>
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
                      <AnchoredPopover
                        open
                        anchorRef={alcanceRef}
                        placement="bottom-end"
                        offset={8}
                        minWidth={248}
                        zIndex={60}
                      >
                        <m.div
                          key="prioridade-menu"
                          role="listbox"
                          aria-label="Prioridade do comunicado"
                          variants={popoverPanel}
                          initial="hidden"
                          animate="show"
                          exit="exit"
                          transition={springGentle}
                          className="card-soft min-w-[15.5rem] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
                        >
                          {PRIORIDADE_OPCOES.map((opcao, index) => {
                            const selecionada = opcao.value === prioridade
                            const Icon = opcao.Icon
                            return (
                              <m.button
                                key={opcao.value}
                                type="button"
                                role="option"
                                aria-selected={selecionada}
                                custom={index}
                                variants={menuItemStagger}
                                initial="hidden"
                                animate="show"
                                onClick={() => {
                                  setPrioridade(opcao.value)
                                  setAlcanceOpen(false)
                                }}
                                className={[
                                  'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[rgb(var(--background-subtle))]',
                                  selecionada ? 'bg-[rgb(var(--color-primary)_/_0.08)]' : '',
                                ].join(' ')}
                              >
                                <Icon
                                  aria-hidden
                                  className={[
                                    'mt-0.5 h-4 w-4 shrink-0',
                                    selecionada
                                      ? 'text-[rgb(var(--color-primary-fg))]'
                                      : 'text-[rgb(var(--foreground-muted))]',
                                  ].join(' ')}
                                />
                                <span className="min-w-0 flex-1">
                                  <span
                                    className={[
                                      'block text-sm font-medium',
                                      selecionada
                                        ? 'text-[rgb(var(--color-primary-fg))]'
                                        : 'text-[rgb(var(--foreground))]',
                                    ].join(' ')}
                                  >
                                    {opcao.label}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                                    {opcao.descricao}
                                  </span>
                                </span>
                                {selecionada && (
                                  <Check
                                    aria-hidden
                                    className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]"
                                  />
                                )}
                              </m.button>
                            )
                          })}
                        </m.div>
                      </AnchoredPopover>
                    )}
                  </AnimatePresence>
                </div>
              ) : canal ? (
                <span className="mr-auto text-xs text-[rgb(var(--foreground-muted))] sm:mr-0">
                  Visível para membros do canal
                </span>
              ) : nacional || somentePublico ? (
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
                      <AnchoredPopover
                        open
                        anchorRef={alcanceRef}
                        placement="bottom-end"
                        offset={8}
                        minWidth={248}
                        zIndex={60}
                      >
                        <m.div
                          key="alcance-menu"
                          role="listbox"
                          aria-label="Visibilidade do post"
                          variants={popoverPanel}
                          initial="hidden"
                          animate="show"
                          exit="exit"
                          transition={springGentle}
                          className="card-soft min-w-[15.5rem] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
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
                      </AnchoredPopover>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleCancelar()}
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!podePublicar}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[rgb(var(--color-primary))] px-3 text-sm font-semibold text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 disabled:opacity-50 sm:px-4"
              >
                {pending || enviando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : comunicado || noticia ? (
                  comunicado ? (
                    <Megaphone className="h-4 w-4" />
                  ) : (
                    <Newspaper className="h-4 w-4" />
                  )
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="max-sm:sr-only">
                  {enviando
                    ? 'Enviando…'
                    : pending
                      ? comunicadoEdicao
                        ? 'Salvando…'
                        : 'Publicando…'
                      : comunicadoEdicao
                        ? 'Salvar alterações'
                        : comunicado
                          ? 'Publicar comunicado'
                          : noticia
                            ? 'Publicar notícia'
                          : forum
                            ? forumFilaAprovacao
                              ? 'Enviar tópico'
                              : 'Publicar tópico'
                          : modoEnquete
                            ? 'Publicar enquete'
                            : modoEvento
                              ? 'Publicar evento'
                              : 'Publicar'}
                </span>
              </button>
            </div>
          </div>
          </m.div>
        )}
      </AnimatePresence>
      </div>
      {forum && expanded ? (
        <aside className="mt-4 hidden min-w-0 lg:sticky lg:top-24 lg:mt-0 lg:block">
          <ForumComposerPreview
            userName={userName}
            userAvatar={userAvatar}
            texto={texto}
            midias={finalMidias}
            fila={forumFilaAprovacao}
          />
        </aside>
      ) : null}
      </div>
    </m.form>
  )
}
