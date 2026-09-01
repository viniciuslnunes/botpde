'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Flag,
  ImagePlus,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Send,
  Smile,
  Sticker as StickerIcon,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import { formatNomeTorcida, hrefDepartamentoDoCanal } from '@torcida/types'
import { useConfirmAction } from '@/lib/confirm-action'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { FileDropOverlay, useFileDragOver } from '@/components/media/file-drop-overlay'
import {
  tituloConversa,
  type ContatoDto,
  type InboxItemDto,
  type MembroConversaDto,
  type MensagemDto,
} from '@/lib/mensageria-client'
import {
  clearMensagemDraft,
  getMensagemDraft,
  setMensagemDraft,
} from '@/lib/mensagem-draft-store'
import { formatRelative } from '@/lib/format-datetime'
import {
  fadeUp,
  collapsePanel,
  springSnappy,
  springGentle,
  staggerContainer,
  menuItemStagger,
  popoverPanel,
} from '@/lib/motion-presets'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { useVisibleBackoffInterval } from '@/lib/use-visible-interval'
import { useConversaStream } from '@/lib/use-mensagem-stream'
import { useMensagemListWindow } from '@/lib/use-mensagem-list-window'
import { Avatar } from './avatar'
import { EmojiPicker } from './emoji-picker'
import { StickerPicker } from './sticker-picker'
import { PostMedia } from './post-media'
import { ensureSocialEmbedInMidias, midiasComEmbedDoTexto, stripEmbeddedSocialUrls } from '@/lib/social-embed'
import { isConversaGrupoLike } from '@/lib/canais-shared'
import { useUnsavedChanges, useUnsavedChangesContext } from '@/lib/unsaved-changes'
import { ComunidadePrefetchLink } from './comunidade-prefetch-link'
import { PedidoTicketBanner } from './pedido-ticket-banner'
import { CanalDepartamentoAvatarField } from '@/app/portal/departamentos/_components/canal-departamento-avatar-field'
import { useLatestRef } from '@/lib/use-latest-ref'

interface MensagemThreadProps {
  conversa: InboxItemDto
  currentUserId: string
  onBack: () => void
  onLida: (conversaId: string) => void
  onSaiu: (conversaId: string) => void
  /** Sempre mostra voltar (ex.: painel embutido da comunidade, onde a lista some). */
  showBackButton?: boolean
  /** Oculta a barra de scroll (scroll por roda/trackpad/toque continua). */
  hideScrollbar?: boolean
  /** Quando false, pausa SSE/polling da thread. */
  active?: boolean
  /** Atualiza preview da inbox sem esperar SSE/polling. */
  onMensagemEnviada?: (preview: { conteudo: string; criadoEm: string }) => void
  /** Após aprovar/recusar solicitação de mensagem. */
  onSolicitacaoResolvida?: () => void
  /** Atualiza avatar do canal (depto/área) na inbox. */
  onAvatarChange?: (conversaId: string, avatarUrl: string | null) => void
}

function isTemp(id: string): boolean {
  return id.startsWith('temp-')
}

/** Temp otimista já ecoado pelo servidor (SSE/poll) — evita duplicar até o POST confirmar. */
function tempEcoado(temp: MensagemDto, servidor: MensagemDto[]): boolean {
  const t0 = new Date(temp.criadoEm).getTime()
  return servidor.some(
    (n) =>
      n.autor.id === temp.autor.id &&
      n.conteudo === temp.conteudo &&
      Math.abs(new Date(n.criadoEm).getTime() - t0) < 60_000,
  )
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

function primeiraDoServidor(lista: MensagemDto[]): string | null {
  const server = lista.filter((m) => !isTemp(m.id))
  return server[0]?.criadoEm ?? null
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
  showBackButton = false,
  hideScrollbar = false,
  active = true,
  onMensagemEnviada,
  onSolicitacaoResolvida,
  onAvatarChange,
}: MensagemThreadProps) {
  const confirmAction = useConfirmAction()
  const [mensagens, setMensagens] = useState<MensagemDto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)
  const [hasMoreHistorico, setHasMoreHistorico] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState(() => getMensagemDraft(conversa.id))
  const [medias, setMedias] = useState<MediaItem[]>([])
  const [enviando, setEnviando] = useState(false)
  const [processandoSolicitacao, setProcessandoSolicitacao] = useState(false)
  const [anexoMenuOpen, setAnexoMenuOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [denunciandoId, setDenunciandoId] = useState<string | null>(null)
  const [motivoDenuncia, setMotivoDenuncia] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoTexto, setEditandoTexto] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [painelMembros, setPainelMembros] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [novasPendentes, setNovasPendentes] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const anexoMenuRef = useRef<HTMLDivElement>(null)
  const lastCriadoEmRef = useRef<string | null>(null)
  const oldestCriadoEmRef = useRef<string | null>(null)
  const nearBottomRef = useRef(true)
  const prependingRef = useRef(false)
  const historicoSentinelRef = useRef<HTMLDivElement>(null)
  const carregandoHistoricoRef = useRef(false)
  const textoRef = useLatestRef(texto)

  const [ticketFechado, setTicketFechado] = useState(false)
  const conversaId = conversa.id
  const getScrollElement = useCallback(() => listRef.current, [])
  const listWindow = useMensagemListWindow(mensagens.length, getScrollElement)
  const uploadPendente = medias.some((m) => m.url === null && !m.error)
  const podeEnviar =
    !enviando && !uploadPendente && (texto.trim().length > 0 || medias.some((m) => Boolean(m.url)))
  const conversaBloqueada =
    conversa.solicitacaoRecebida || conversa.aguardandoAprovacao || ticketFechado
  const onTicketStatus = useCallback((status: 'ABERTO' | 'ATENDENDO' | 'FECHADO' | null) => {
    setTicketFechado(status === 'FECHADO')
  }, [])
  const { confirmDiscard } = useUnsavedChangesContext()

  const draftChanges = useMemo(() => {
    const list: string[] = []
    if (texto.trim()) list.push('Mensagem não enviada')
    if (medias.length > 0) list.push(`Anexos (${medias.length})`)
    return list
  }, [texto, medias.length])

  const fileDrag = useFileDragOver(!conversaBloqueada)

  useUnsavedChanges({
    id: `mensagem-draft-${conversaId}`,
    title: 'Mensagem',
    isDirty: draftChanges.length > 0,
    changes: draftChanges,
  })

  async function handleBack() {
    const ok = await confirmDiscard()
    if (!ok) return
    clearMensagemDraft(conversaId)
    textoRef.current = ''
    onBack()
  }

  const scrollToBottom = useCallback((force = false) => {
    const el = listRef.current
    if (!el) return
    if (!force && !nearBottomRef.current) return
    el.scrollTop = el.scrollHeight
    nearBottomRef.current = true
    setAtBottom(true)
    setNovasPendentes(0)
  }, [])

  const atualizarPosicaoScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 96
    nearBottomRef.current = near
    setAtBottom((prev) => (prev === near ? prev : near))
    if (near) setNovasPendentes(0)
  }, [])

  const ajustarAlturaInput = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, 128) // max-h-32
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > 128 ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    if (prependingRef.current) {
      prependingRef.current = false
      return
    }
    scrollToBottom()
  }, [mensagens, scrollToBottom])

  useEffect(() => {
    ajustarAlturaInput()
  }, [texto, ajustarAlturaInput])

  useEffect(() => {
    nearBottomRef.current = true
    setAtBottom(true)
    setNovasPendentes(0)
    setHasMoreHistorico(false)
    setCarregandoHistorico(false)
    carregandoHistoricoRef.current = false
    setEditandoId(null)
    setEditandoTexto('')
    setDenunciandoId(null)
    setMotivoDenuncia('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [conversaId])

  // Persiste rascunho ao sair da conversa (troca de thread remonta o componente).
  useEffect(() => {
    return () => {
      setMensagemDraft(conversaId, textoRef.current)
    }
  }, [conversaId, textoRef])

  useEffect(() => {
    if (!anexoMenuOpen) return
    function onDown(e: MouseEvent) {
      if (anexoMenuRef.current && !anexoMenuRef.current.contains(e.target as Node)) {
        setAnexoMenuOpen(false)
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAnexoMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [anexoMenuOpen])

  // Revoga blob URLs ao desmontar / trocar conversa (evita leak de memória).
  const mediasRef = useLatestRef(medias)
  useEffect(() => {
    return () => {
      // Lê no cleanup de propósito: revoga os blobs que existem no desmonte,
      // não os que existiam na montagem. Copiar para uma const no setup (o que
      // a regra sugere) vazaria tudo que foi anexado depois.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ver acima
      for (const m of mediasRef.current) {
        if (m.localUrl.startsWith('blob:')) URL.revokeObjectURL(m.localUrl)
      }
    }
  }, [conversaId, mediasRef])

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
        const data = (await res.json()) as { mensagens?: MensagemDto[]; hasMore?: boolean }
        if (!data.mensagens) return false
        const novas = data.mensagens
        const deOutros = !full
          ? novas.filter((m) => m.autor.id !== currentUserId).length
          : 0
        setMensagens((prev) => {
          const base = full ? novas : [...prev.filter((m) => !isTemp(m.id)), ...novas]
          const dedup = new Map<string, MensagemDto>()
          for (const m of base) dedup.set(m.id, m)
          const servidor = [...dedup.values()]
          const pendentes = prev
            .filter((m) => isTemp(m.id))
            .filter((temp) => !tempEcoado(temp, servidor))
          const merged = ordenar([...servidor, ...pendentes])
          const last = ultimaDoServidor(merged)
          const first = primeiraDoServidor(merged)
          if (last) lastCriadoEmRef.current = last
          if (full && first) oldestCriadoEmRef.current = first
          return merged
        })
        if (full) setHasMoreHistorico(Boolean(data.hasMore))
        if (deOutros > 0 && !nearBottomRef.current) {
          setNovasPendentes((n) => n + deOutros)
        }
        // Incremental: marca lida só quando chega mensagem nova (abertura já marca 1×).
        if (!full && novas.length > 0) marcarLida()
        return novas.length > 0
      } catch {
        // polling silencioso
      } finally {
        if (full) setCarregando(false)
      }
      return false
    },
    [conversaId, currentUserId, marcarLida],
  )

  const carregarHistorico = useCallback(async () => {
    if (!hasMoreHistorico || carregandoHistoricoRef.current) return
    const before = oldestCriadoEmRef.current
    if (!before) return

    const el = listRef.current
    const prevHeight = el?.scrollHeight ?? 0
    const prevTop = el?.scrollTop ?? 0

    carregandoHistoricoRef.current = true
    setCarregandoHistorico(true)
    try {
      const res = await fetch(
        `/api/conversas/${conversaId}/mensagens?before=${encodeURIComponent(before)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return
      const data = (await res.json()) as { mensagens?: MensagemDto[]; hasMore?: boolean }
      if (!data.mensagens || data.mensagens.length === 0) {
        setHasMoreHistorico(false)
        return
      }
      prependingRef.current = true
      setMensagens((prev) => {
        const dedup = new Map<string, MensagemDto>()
        for (const m of data.mensagens!) dedup.set(m.id, m)
        for (const m of prev) dedup.set(m.id, m)
        const merged = ordenar([...dedup.values()])
        const first = primeiraDoServidor(merged)
        if (first) oldestCriadoEmRef.current = first
        return merged
      })
      setHasMoreHistorico(Boolean(data.hasMore))
      requestAnimationFrame(() => {
        const list = listRef.current
        if (!list) return
        list.scrollTop = prevTop + (list.scrollHeight - prevHeight)
      })
    } finally {
      carregandoHistoricoRef.current = false
      setCarregandoHistorico(false)
    }
  }, [conversaId, hasMoreHistorico])

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
    oldestCriadoEmRef.current = null
    void carregarRef.current(true).then(() => marcarLidaRef.current())
  }, [conversaId])

  // SSE + polling incremental com backoff. Sem full reload periódico (caro e redundante com SSE).
  const { reset: resetPoll } = useVisibleBackoffInterval(
    () => carregarRef.current(false),
    15_000,
    90_000,
    active,
  )
  const pollResetRef = useLatestRef(resetPoll)
  useConversaStream(
    conversaId,
    () => {
      pollResetRef.current()
      void carregarRef.current(false)
    },
    active,
  )

  const carregarHistoricoRef = useRef(carregarHistorico)
  useEffect(() => {
    carregarHistoricoRef.current = carregarHistorico
  }, [carregarHistorico])

  // Infinite scroll no topo — carrega histórico ao chegar perto do início.
  useEffect(() => {
    if (!hasMoreHistorico || carregando || !active) return
    const sentinel = historicoSentinelRef.current
    const root = listRef.current
    if (!sentinel || !root) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void carregarHistoricoRef.current()
        }
      },
      { root, rootMargin: '80px 0px 0px 0px', threshold: 0 },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [hasMoreHistorico, carregando, active, mensagens.length])

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

  function fecharAnexos() {
    setAnexoMenuOpen(false)
  }

  function abrirEmoji() {
    fecharAnexos()
    setStickerOpen(false)
    setEmojiOpen(true)
  }

  function abrirSticker() {
    fecharAnexos()
    setEmojiOpen(false)
    setStickerOpen(true)
  }

  function abrirImagem() {
    fecharAnexos()
    setEmojiOpen(false)
    setStickerOpen(false)
    fileInputRef.current?.click()
  }

  function removerMedia(id: string) {
    setMedias((prev) => {
      const alvo = prev.find((m) => m.id === id)
      if (alvo?.localUrl.startsWith('blob:')) URL.revokeObjectURL(alvo.localUrl)
      return prev.filter((m) => m.id !== id)
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
      void uploadMediaToCloudinary(file, undefined, 'mensagem', undefined, conversaId)
        .then((url) => setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, url } : m))))
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : 'Falha no upload'
          setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, error: msg } : m)))
          toast.error(msg)
        })
    }
  }

  async function responderSolicitacao(acao: 'aprovar' | 'rejeitar') {
    setProcessandoSolicitacao(true)
    try {
      const res = await fetch(`/api/conversas/${conversaId}/solicitacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erro ao processar solicitação.')
      if (acao === 'aprovar') {
        toast.success('Solicitação aprovada. A conversa está liberada.')
      } else {
        toast.success('Solicitação recusada.')
        onSaiu(conversaId)
        onBack()
      }
      onSolicitacaoResolvida?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao processar solicitação.')
    } finally {
      setProcessandoSolicitacao(false)
    }
  }

  async function enviar(event: React.FormEvent) {
    event.preventDefault()
    const conteudo = texto.trim()
    const midiasProntas = medias.filter((m) => m.url)
    const midias = midiasProntas.map((m) => m.url as string)
    const midiasFinais = midiasComEmbedDoTexto(conteudo, midias)
    if ((!conteudo && midiasFinais.length === 0) || enviando || uploadPendente) return

    const tempId = `temp-${Date.now()}`
    const criadoEm = new Date().toISOString()
    const otimista: MensagemDto = {
      id: tempId,
      conversaId,
      conteudo,
      midiaUrls: midiasFinais,
      respostaAId: null,
      editadaEm: null,
      removida: false,
      criadoEm,
      autor: { id: currentUserId, nome: 'Você', avatarUrl: null },
    }
    const snapshotMedias = medias
    setTexto('')
    clearMensagemDraft(conversaId)
    setMedias([])
    setEnviando(true)
    nearBottomRef.current = true
    setAtBottom(true)
    setNovasPendentes(0)
    setMensagens((prev) => ordenar([...prev, otimista]))
    onMensagemEnviada?.({ conteudo, criadoEm })
    pollResetRef.current()

    try {
      const res = await fetch(`/api/conversas/${conversaId}/mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo, midias: midiasFinais }),
      })
      const data = (await res.json()) as { mensagem?: MensagemDto; error?: string }
      if (!res.ok || !data.mensagem) throw new Error(data.error ?? 'Erro ao enviar.')
      for (const m of snapshotMedias) {
        if (m.localUrl.startsWith('blob:')) URL.revokeObjectURL(m.localUrl)
      }
      setMensagens((prev) => {
        const dedup = new Map<string, MensagemDto>()
        for (const m of prev) {
          if (m.id !== tempId) dedup.set(m.id, m)
        }
        dedup.set(data.mensagem!.id, data.mensagem!)
        const next = ordenar([...dedup.values()])
        const last = ultimaDoServidor(next)
        if (last) lastCriadoEmRef.current = last
        return next
      })
    } catch (error) {
      setMensagens((prev) => prev.filter((m) => m.id !== tempId))
      setTexto(conteudo)
      setMedias(snapshotMedias)
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar mensagem.')
    } finally {
      setEnviando(false)
    }
  }

  async function removerMensagem(mensagemId: string) {
    await confirmAction({
      titulo: 'Remover esta mensagem?',
      descricao: 'A mensagem deixa de aparecer para os participantes.',
      labelConfirmar: 'Remover',
      variante: 'destructive',
      cancelled: false,
      run: async () => {
        const res = await fetch(`/api/conversas/${conversaId}/mensagens/${mensagemId}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error('Não foi possível remover a mensagem.')
        setMensagens((prev) =>
          prev.map((m) =>
            m.id === mensagemId ? { ...m, removida: true, conteudo: '', midiaUrls: [] } : m,
          ),
        )
        if (editandoId === mensagemId) {
          setEditandoId(null)
          setEditandoTexto('')
        }
      },
      success: 'Mensagem removida.',
    })
  }

  async function editarMensagem(mensagemId: string) {
    const conteudo = editandoTexto.trim()
    if (!conteudo) {
      toast.error('Mensagem vazia.')
      return
    }
    if (salvandoEdicao) return
    setSalvandoEdicao(true)
    try {
      const res = await fetch(`/api/conversas/${conversaId}/mensagens/${mensagemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo }),
      })
      const data = (await res.json()) as { mensagem?: MensagemDto; error?: string }
      if (!res.ok || !data.mensagem) throw new Error(data.error ?? 'Erro ao editar.')
      setMensagens((prev) => prev.map((m) => (m.id === mensagemId ? data.mensagem! : m)))
      setEditandoId(null)
      setEditandoTexto('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao editar mensagem.')
    } finally {
      setSalvandoEdicao(false)
    }
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
  const hrefDepartamento = hrefDepartamentoDoCanal(conversa)

  return (
    // `div` estável: no embutido a lista some ao abrir — animar opacity na
    // montagem deixava a thread invisível se o collapse do painel interferisse.
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={fileDrag.onDragEnter}
      onDragOver={fileDrag.onDragOver}
      onDragLeave={fileDrag.onDragLeave}
      onDrop={(e) => {
        const files = fileDrag.finishDrop(e)
        if (files.length) addFiles(files)
      }}
    >
      <FileDropOverlay active={fileDrag.active} />
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
        <button
          type="button"
          onClick={() => void handleBack()}
          aria-label="Voltar às conversas"
          className={[
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            showBackButton ? '' : 'md:hidden',
          ].join(' ')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {conversa.tipo === 'DIRETA' && conversa.outroMembro ? (
          <ComunidadePrefetchLink href={`/portal/comunidade/perfil/${conversa.outroMembro.id}`}>
            <Avatar nome={titulo} avatarUrl={conversa.outroMembro.avatarUrl} size="sm" />
          </ComunidadePrefetchLink>
        ) : hrefDepartamento ? (
          <ComunidadePrefetchLink href={hrefDepartamento} aria-label="Abrir departamento">
            <Avatar nome={titulo} avatarUrl={conversa.avatarUrl} size="sm" />
          </ComunidadePrefetchLink>
        ) : (
          <Avatar nome={titulo} avatarUrl={conversa.avatarUrl} size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{titulo}</p>
          {isConversaGrupoLike(conversa.tipo) && (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              {conversa.totalMembros} participantes
            </p>
          )}
        </div>
        {hrefDepartamento && (
          <ComunidadePrefetchLink
            href={hrefDepartamento}
            aria-label="Abrir departamento"
            title="Abrir departamento"
            className="app-touch-target flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            <Building2 className="h-4 w-4" aria-hidden />
          </ComunidadePrefetchLink>
        )}
        {isConversaGrupoLike(conversa.tipo) && (
          <button
            type="button"
            onClick={() => setPainelMembros((v) => !v)}
            aria-label="Participantes do grupo"
            className={[
              'app-touch-target flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
              painelMembros
                ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            <Users className="h-4 w-4" />
          </button>
        )}
      </div>

      <PedidoTicketBanner conversaId={conversaId} onStatus={onTicketStatus} />

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
              ehCanalDepartamento={conversa.ehCanalDepartamento}
              canalNome={titulo}
              canalAvatarUrl={conversa.avatarUrl}
              onSaiu={() => onSaiu(conversaId)}
              onAvatarChange={(url) => onAvatarChange?.(conversaId, url)}
            />
          </m.div>
        </AnimatePresence>
      )}

      {conversa.solicitacaoRecebida && (
        <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3">
          <p className="text-sm font-medium text-[rgb(var(--foreground))]">
            {tituloConversa(conversa)} quer conversar com você
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
            Aprove para liberar o canal de mensagens. Ao recusar, esta pessoa não poderá enviar nova solicitação.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={processandoSolicitacao}
              onClick={() => void responderSolicitacao('aprovar')}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-semibold text-primary-on hover:opacity-90 disabled:opacity-60"
            >
              {processandoSolicitacao ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aprovar'}
            </button>
            <button
              type="button"
              disabled={processandoSolicitacao}
              onClick={() => void responderSolicitacao('rejeitar')}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))] disabled:opacity-60"
            >
              Recusar
            </button>
          </div>
        </div>
      )}

      {conversa.aguardandoAprovacao && (
        <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 text-xs text-[rgb(var(--foreground-muted))]">
          {conversa.tipo === 'DIRETA'
            ? `Sua solicitação foi enviada. Aguarde ${tituloConversa(conversa)} aprovar para continuar a conversa.`
            : 'Seu pedido de entrada foi enviado. Aguarde a aprovação para enviar mensagens neste canal.'}
        </div>
      )}

      {/* Mensagens */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={atualizarPosicaoScroll}
          className={[
            'h-full space-y-3 overflow-y-auto px-4 py-4',
            hideScrollbar ? 'app-scrollbar-none' : '',
          ].join(' ')}
        >
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
            <>
              {(hasMoreHistorico || carregandoHistorico) && (
                <div ref={historicoSentinelRef} className="flex justify-center py-2">
                  {carregandoHistorico ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--foreground-muted))]" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => void carregarHistorico()}
                      className="rounded-lg px-3 py-1 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--color-primary)_/_0.08)]"
                    >
                      Carregar mensagens anteriores
                    </button>
                  )}
                </div>
              )}
              {listWindow.enabled && listWindow.virtualItems ? (
                <div
                  className="relative w-full"
                  style={{ height: listWindow.totalSize }}
                >
                  {listWindow.virtualItems.map((vi) => {
                    const msg = mensagens[vi.index]
                    if (!msg) return null
                    return (
                      <div
                        key={msg.id}
                        data-index={vi.index}
                        ref={listWindow.measureElement}
                        className="absolute left-0 top-0 w-full pb-3"
                        style={{ transform: `translateY(${vi.start}px)` }}
                      >
                        <MensagemBubble
                          msg={msg}
                          conversaTipo={conversa.tipo}
                          currentUserId={currentUserId}
                          denunciandoId={denunciandoId}
                          motivoDenuncia={motivoDenuncia}
                          editandoId={editandoId}
                          editandoTexto={editandoTexto}
                          salvandoEdicao={salvandoEdicao}
                          animate={false}
                          onDenunciandoId={setDenunciandoId}
                          onMotivoDenuncia={setMotivoDenuncia}
                          onEditandoId={setEditandoId}
                          onEditandoTexto={setEditandoTexto}
                          onRemover={() => void removerMensagem(msg.id)}
                          onEditar={() => void editarMensagem(msg.id)}
                          onDenunciar={() => void denunciar(msg.id)}
                        />
                      </div>
                    )
                  })}
                </div>
              ) : (
                mensagens.map((msg) => (
                  <MensagemBubble
                    key={msg.id}
                    msg={msg}
                    conversaTipo={conversa.tipo}
                    currentUserId={currentUserId}
                    denunciandoId={denunciandoId}
                    motivoDenuncia={motivoDenuncia}
                    editandoId={editandoId}
                    editandoTexto={editandoTexto}
                    salvandoEdicao={salvandoEdicao}
                    animate
                    onDenunciandoId={setDenunciandoId}
                    onMotivoDenuncia={setMotivoDenuncia}
                    onEditandoId={setEditandoId}
                    onEditandoTexto={setEditandoTexto}
                    onRemover={() => void removerMensagem(msg.id)}
                    onEditar={() => void editarMensagem(msg.id)}
                    onDenunciar={() => void denunciar(msg.id)}
                  />
                ))
              )}
            </>
          )}
        </div>

        <AnimatePresence>
          {novasPendentes > 0 && !atBottom && (
            <m.button
              key="novas-msgs"
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={springSnappy}
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[rgb(var(--color-primary))] px-3.5 py-1.5 text-xs font-semibold text-[rgb(var(--color-primary-on))] shadow-lg ring-1 ring-inset ring-[rgb(var(--color-primary-fg)_/_0.35)] hover:opacity-90"
            >
              {novasPendentes > 99 ? '99+' : novasPendentes}{' '}
              {novasPendentes === 1 ? 'nova' : 'novas'}
              <ChevronDown className="h-3.5 w-3.5" />
            </m.button>
          )}
        </AnimatePresence>
      </div>

      {/* Composer */}
      {!conversaBloqueada && (
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
                    onClick={() => removerMedia(media.id)}
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
          <div ref={anexoMenuRef} className="relative shrink-0">
            <m.button
              type="button"
              onClick={() => {
                setAnexoMenuOpen((v) => !v)
                setEmojiOpen(false)
                setStickerOpen(false)
              }}
              aria-label="Anexar"
              aria-expanded={anexoMenuOpen}
              whileTap={{ scale: 0.92 }}
              transition={springSnappy}
              className={[
                'flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-primary-fg))]',
                anexoMenuOpen || emojiOpen || stickerOpen
                  ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                  : '',
              ].join(' ')}
            >
              <m.span
                animate={{ rotate: anexoMenuOpen ? 45 : 0 }}
                transition={springSnappy}
                className="inline-flex"
              >
                <Plus className="h-5 w-5" />
              </m.span>
            </m.button>

            <AnimatePresence>
              {anexoMenuOpen && (
                <m.div
                  key="anexo-menu"
                  role="menu"
                  aria-label="Opções de anexo"
                  variants={popoverPanel}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  transition={springGentle}
                  className="card-soft absolute bottom-full left-0 z-30 mb-2 min-w-[11rem] overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-xl"
                >
                  <m.button
                    type="button"
                    role="menuitem"
                    custom={0}
                    variants={menuItemStagger}
                    initial="hidden"
                    animate="show"
                    onClick={abrirEmoji}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <Smile className="h-4 w-4 shrink-0" />
                    Emoji
                  </m.button>
                  <m.button
                    type="button"
                    role="menuitem"
                    custom={1}
                    variants={menuItemStagger}
                    initial="hidden"
                    animate="show"
                    onClick={abrirSticker}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <StickerIcon className="h-4 w-4 shrink-0" />
                    Sticker
                  </m.button>
                  <m.button
                    type="button"
                    role="menuitem"
                    custom={2}
                    variants={menuItemStagger}
                    initial="hidden"
                    animate="show"
                    onClick={abrirImagem}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    <ImagePlus className="h-4 w-4 shrink-0" />
                    Imagem ou vídeo
                  </m.button>
                </m.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {emojiOpen && (
                <EmojiPicker
                  key="emoji"
                  onSelect={insertEmoji}
                  onClose={() => setEmojiOpen(false)}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {stickerOpen && (
                <StickerPicker
                  key="sticker"
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
            placeholder="Escreva"
            className="max-h-32 min-h-[36px] flex-1 resize-none overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
          />
          <m.button
            type="submit"
            disabled={!podeEnviar}
            whileTap={{ scale: 0.94 }}
            transition={springSnappy}
            aria-label="Enviar mensagem"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {enviando || uploadPendente ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </m.button>
        </div>
      </form>
      )}
      {ticketFechado && (
        <div className="border-t border-[rgb(var(--border))] px-4 py-3 text-center text-xs text-[rgb(var(--foreground-muted))]">
          Ticket fechado — histórico preservado, sem novas mensagens.
        </div>
      )}
    </div>
  )
}

function MensagemBubble({
  msg,
  conversaTipo,
  currentUserId,
  denunciandoId,
  motivoDenuncia,
  editandoId,
  editandoTexto,
  salvandoEdicao,
  animate,
  onDenunciandoId,
  onMotivoDenuncia,
  onEditandoId,
  onEditandoTexto,
  onRemover,
  onEditar,
  onDenunciar,
}: {
  msg: MensagemDto
  conversaTipo: InboxItemDto['tipo']
  currentUserId: string
  denunciandoId: string | null
  motivoDenuncia: string
  editandoId: string | null
  editandoTexto: string
  salvandoEdicao: boolean
  animate: boolean
  onDenunciandoId: (id: string | null) => void
  onMotivoDenuncia: (v: string) => void
  onEditandoId: (id: string | null) => void
  onEditandoTexto: (v: string) => void
  onRemover: () => void
  onEditar: () => void
  onDenunciar: () => void
}) {
  const minha = msg.autor.id === currentUserId
  const midias = ensureSocialEmbedInMidias(msg.conteudo, msg.midiaUrls)
  const conteudoVisivel = stripEmbeddedSocialUrls(msg.conteudo, midias)
  const editando = editandoId === msg.id
  const Wrapper = animate ? m.div : 'div'
  // Sem `layout`: LazyMotion do portal usa `domAnimation` (sem layout animations).
  const motionProps = animate
    ? {
        variants: fadeUp,
        initial: 'hidden' as const,
        animate: 'show' as const,
      }
    : {}

  return (
    <Wrapper
      {...motionProps}
      className={['group flex gap-2', minha ? 'justify-end' : 'justify-start'].join(' ')}
    >
      {!minha && (
        <ComunidadePrefetchLink href={`/portal/comunidade/perfil/${msg.autor.id}`} className="shrink-0">
          <Avatar nome={msg.autor.nome} avatarUrl={msg.autor.avatarUrl} size="sm" />
        </ComunidadePrefetchLink>
      )}
      <div className={['min-w-0 max-w-[80%] sm:max-w-[65%]', minha ? 'items-end' : 'items-start'].join(' ')}>
        <div
          className={[
            'rounded-2xl px-3.5 py-2',
            minha
              ? 'rounded-br-md bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))] ring-1 ring-inset ring-[rgb(var(--color-primary-fg)_/_0.35)]'
              : 'rounded-bl-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))]',
          ].join(' ')}
        >
          {isConversaGrupoLike(conversaTipo) && !minha && (
            <p className="mb-0.5 truncate text-xs font-semibold text-[rgb(var(--color-primary-fg))]">
              {msg.autor.nome ?? 'Membro'}
            </p>
          )}
          {msg.removida ? (
            <p className="text-sm italic opacity-70">Mensagem removida</p>
          ) : editando ? (
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                onEditar()
              }}
            >
              <textarea
                value={editandoTexto}
                onChange={(e) => onEditandoTexto(e.target.value)}
                maxLength={2000}
                rows={2}
                autoFocus
                disabled={salvandoEdicao}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    onEditandoId(null)
                    onEditandoTexto('')
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onEditar()
                  }
                }}
                className={[
                  'w-full resize-none rounded-lg border px-2 py-1.5 text-sm outline-none',
                  minha
                    ? 'border-[rgb(var(--color-primary-on)_/_0.35)] bg-[rgb(var(--color-primary-on)_/_0.12)] text-[rgb(var(--color-primary-on))] placeholder:text-[rgb(var(--color-primary-on)_/_0.55)]'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]',
                ].join(' ')}
              />
              {midias.length > 0 && <PostMedia urls={midias} />}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={salvandoEdicao}
                  onClick={() => {
                    onEditandoId(null)
                    onEditandoTexto('')
                  }}
                  className={[
                    'text-xs font-medium opacity-80 hover:opacity-100',
                    minha ? 'text-[rgb(var(--color-primary-on))]' : 'text-[rgb(var(--foreground-muted))]',
                  ].join(' ')}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEdicao || !editandoTexto.trim()}
                  className={[
                    'text-xs font-semibold disabled:opacity-50',
                    minha ? 'text-[rgb(var(--color-primary-on))]' : 'text-[rgb(var(--color-primary-fg))]',
                  ].join(' ')}
                >
                  {salvandoEdicao ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {conteudoVisivel ? (
                <p className="whitespace-pre-wrap break-words text-sm">{conteudoVisivel}</p>
              ) : null}
              {midias.length > 0 && <PostMedia urls={midias} />}
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
          {!isTemp(msg.id) && !msg.removida && !editando && (
            <span className="hidden gap-1 group-hover:flex">
              {minha ? (
                <>
                  <button
                    type="button"
                    title="Editar mensagem"
                    onClick={() => {
                      onDenunciandoId(null)
                      onEditandoId(msg.id)
                      onEditandoTexto(msg.conteudo)
                    }}
                    className="rounded p-0.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    title="Remover mensagem"
                    onClick={onRemover}
                    className="rounded p-0.5 text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  title="Denunciar mensagem"
                  onClick={() => {
                    onEditandoId(null)
                    onEditandoTexto('')
                    onDenunciandoId(denunciandoId === msg.id ? null : msg.id)
                    onMotivoDenuncia('')
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
                onDenunciar()
              }}
            >
              <input
                value={motivoDenuncia}
                onChange={(e) => onMotivoDenuncia(e.target.value)}
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
    </Wrapper>
  )
}

function PainelMembros({
  conversaId,
  currentUserId,
  isAdmin,
  ehCanalDepartamento,
  canalNome,
  canalAvatarUrl,
  onSaiu,
  onAvatarChange,
}: {
  conversaId: string
  currentUserId: string
  isAdmin: boolean
  ehCanalDepartamento: boolean
  canalNome: string
  canalAvatarUrl: string | null
  onSaiu: () => void
  onAvatarChange?: (url: string | null) => void
}) {
  const confirmAction = useConfirmAction()
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
      const res = await fetch(
        `/api/conversas/contatos?q=${encodeURIComponent(busca)}&para=grupo`,
        {
          cache: 'no-store',
        },
      )
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
    const ok = await confirmAction({
      titulo: sair ? 'Sair deste grupo?' : 'Remover este membro?',
      descricao: sair
        ? 'Você deixa de participar desta conversa.'
        : 'A pessoa sai do grupo e perde o acesso ao chat.',
      labelConfirmar: sair ? 'Sair' : 'Remover',
      variante: 'destructive',
      cancelled: false,
      run: async () => {
        const res = await fetch(`/api/conversas/${conversaId}/membros`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sair ? {} : { userId }),
        })
        const data = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Erro ao remover.')
        if (sair) {
          onSaiu()
          return
        }
        setVersaoMembros((v) => v + 1)
      },
      success: sair ? 'Você saiu do grupo.' : 'Membro removido.',
    })
    void ok
  }

  async function transferirAdmin(userId: string) {
    await confirmAction({
      titulo: 'Transferir a administração?',
      descricao: 'Este membro passa a ser o admin do grupo.',
      labelConfirmar: 'Transferir',
      cancelled: false,
      run: async () => {
        const res = await fetch(`/api/conversas/${conversaId}/membros`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        })
        const data = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Erro ao transferir.')
        setVersaoMembros((v) => v + 1)
      },
      success: 'Administração transferida.',
    })
  }

  const jaNoGrupo = new Set(membros.map((m) => m.userId))

  return (
    <div className="max-h-64 space-y-2 overflow-y-auto border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3">
      {isAdmin && ehCanalDepartamento ? (
        <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Foto do canal
          </p>
          <CanalDepartamentoAvatarField
            conversaId={conversaId}
            nome={canalNome}
            avatarUrl={canalAvatarUrl}
            compact
            onAvatarChange={onAvatarChange}
          />
        </div>
      ) : null}
      <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
        <AnimatePresence mode="popLayout">
          {membros.map((membro, i) => (
            <m.div
              key={membro.userId}
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
                <span className="rounded-full bg-[rgb(var(--color-primary)_/_0.14)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[rgb(var(--color-primary-fg))]">
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
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--color-primary)_/_0.08)]"
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
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--color-primary)_/_0.08)]"
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
              placeholder="Buscar na rede ou na torcida"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-sm text-[rgb(var(--foreground))]"
            />
            {resultados.filter((c) => !jaNoGrupo.has(c.id)).length === 0 && (
              <p className="px-1 py-1 text-xs text-[rgb(var(--foreground-muted))]">
                {busca.trim()
                  ? 'Ninguém na sua rede ou torcida com esse nome.'
                  : 'Só entram pessoas da sua rede ou associadas à torcida.'}
              </p>
            )}            <m.div variants={staggerContainer} initial="hidden" animate="show">
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
                        {formatNomeTorcida(c.tenantNome)}
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
