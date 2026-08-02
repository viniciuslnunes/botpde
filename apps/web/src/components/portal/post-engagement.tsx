'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Heart, Flag, MessageCircle, Send, Loader2, Repeat2, Bookmark } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  comentarPost,
  denunciarPost,
  listarComentariosPost,
  reagirPost,
  repostarPost,
  salvarPost,
  removerPostSalvo,
  type ComentarioPostItem,
} from '@/app/portal/comunidade/actions'
import { MentionPicker, detectarMencaoAtiva, type MencaoSelecionada } from './mention-picker'
import {
  paraTextoLegivel,
  podarMencoes,
  serializarMencoes,
  type MencaoParsed,
  type TipoReacaoSocial,
} from '@/lib/comunidade-social'
import type { TargetAndTransition, Transition } from 'motion/react'
import {
  bookmarkDrop,
  collapsePanel,
  heartBurst,
  menuItemStagger,
  reactionPop,
  shareSpin,
  springGentle,
  springSnappy,
} from '@/lib/motion-presets'
import { Avatar } from './avatar'
import { ComentarioMenu } from './comentario-menu'
import { PostConteudoRich } from './post-conteudo-rich'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface PostEngagementProps {
  postId: string
  totalReacoes: number
  totalComentarios: number
  minhaReacao: TipoReacaoSocial | null
  currentUser: CurrentUser
  /** Autor do post — esconde denúncia (servidor também rejeita). */
  isAuthor?: boolean
  isRepost?: boolean
  salvoInicial?: boolean
}

function EngajamentoBtn({
  children,
  active,
  className,
  onClick,
  disabled,
  activeTransition = reactionPop,
  activeAnimate,
  ...rest
}: {
  children: React.ReactNode
  active?: boolean
  className: string
  onClick?: () => void
  disabled?: boolean
  /** Transição usada ao ativar (default: bounce genérico `reactionPop`). */
  activeTransition?: Transition
  /** Keyframes de ativação (default: `scale: [1, 1.08, 1]`). */
  activeAnimate?: TargetAndTransition
  'aria-label'?: string
  'aria-pressed'?: boolean
  'aria-expanded'?: boolean
}) {
  return (
    <m.button
      type="button"
      whileTap={{ scale: 0.9 }}
      animate={active ? (activeAnimate ?? { scale: [1, 1.08, 1] }) : { scale: 1, y: 0 }}
      transition={active ? activeTransition : springSnappy}
      onClick={onClick}
      disabled={disabled}
      className={className}
      {...rest}
    >
      {children}
    </m.button>
  )
}

export function PostEngagement({
  postId,
  totalReacoes,
  totalComentarios,
  minhaReacao,
  currentUser,
  isAuthor = false,
  isRepost = false,
  salvoInicial = false,
}: PostEngagementProps) {
  const [reacao, setReacao] = useState<TipoReacaoSocial | null>(minhaReacao)
  const [salvo, setSalvo] = useState(salvoInicial)
  const [mencaoQuery, setMencaoQuery] = useState<string | null>(null)
  const [totalR, setTotalR] = useState(totalReacoes)
  const [totalC, setTotalC] = useState(totalComentarios)
  const [comentarios, setComentarios] = useState<ComentarioPostItem[]>([])
  const [comentariosAbertos, setComentariosAbertos] = useState(false)
  const [carregandoComentarios, setCarregandoComentarios] = useState(false)
  const [comentario, setComentario] = useState('')
  const [mencoesComentario, setMencoesComentario] = useState<MencaoParsed[]>([])
  const [denunciando, setDenunciando] = useState(false)
  const [denunciado, setDenunciado] = useState(false)
  const [repostando, setRepostando] = useState(false)
  const [compartilhado, setCompartilhado] = useState(false)
  const [justLiked, setJustLiked] = useState(false)
  const [comentarioRepost, setComentarioRepost] = useState('')
  const [motivo, setMotivo] = useState('')
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const comentarioCampoRef = useRef<HTMLDivElement>(null)
  const comentariosCarregadosRef = useRef(false)

  const carregarComentarios = useCallback(async () => {
    if (comentariosCarregadosRef.current) return
    setCarregandoComentarios(true)
    try {
      const lista = await listarComentariosPost(postId)
      setComentarios(lista)
      comentariosCarregadosRef.current = true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível carregar comentários.')
    } finally {
      setCarregandoComentarios(false)
    }
  }, [postId])

  function handleReacao(tipo: TipoReacaoSocial) {
    const anterior = reacao
    const totalAnterior = totalR
    if (anterior === tipo) {
      setReacao(null)
      setTotalR((n) => Math.max(0, n - 1))
    } else {
      setReacao(tipo)
      if (anterior === null) setTotalR((n) => n + 1)
      if (tipo === 'CURTIR') setJustLiked(true)
    }
    startTransition(async () => {
      try {
        const { minhaReacao } = await reagirPost(postId, tipo)
        setReacao(minhaReacao)
      } catch (e) {
        setReacao(anterior)
        setTotalR(totalAnterior)
        toast.error(e instanceof Error ? e.message : 'Não foi possível reagir.')
      }
    })
  }

  function abrirComentarios() {
    const abrir = !comentariosAbertos
    setComentariosAbertos(abrir)
    if (abrir) {
      void carregarComentarios()
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  function enviarComentario(e: React.FormEvent) {
    e.preventDefault()
    const persistido = serializarMencoes(comentario, mencoesComentario).trim()
    if (!persistido || pending) return
    const tempId = `tmp-${Date.now()}`
    const otimista: ComentarioPostItem = {
      id: tempId,
      conteudo: persistido,
      criadoEm: new Date().toISOString(),
      autor: {
        id: currentUser.id,
        nome: currentUser.nome,
        avatarUrl: currentUser.avatarUrl,
      },
    }
    setComentarios((prev) => [...prev, otimista])
    setTotalC((n) => n + 1)
    setComentario('')
    setMencoesComentario([])
    setMencaoQuery(null)
    setComentariosAbertos(true)
    startTransition(async () => {
      try {
        const salvoComentario = await comentarPost(postId, persistido)
        setComentarios((prev) => prev.map((c) => (c.id === tempId ? salvoComentario : c)))
        comentariosCarregadosRef.current = true
      } catch (err) {
        setComentarios((prev) => prev.filter((c) => c.id !== tempId))
        setTotalC((n) => Math.max(0, n - 1))
        const { texto, mencoes } = paraTextoLegivel(persistido)
        setComentario(texto)
        setMencoesComentario(mencoes)
        toast.error(err instanceof Error ? err.message : 'Não foi possível comentar.')
      }
    })
  }

  function enviarDenuncia(e: React.FormEvent) {
    e.preventDefault()
    if (denunciado || isAuthor) return
    const texto = motivo.trim()
    if (texto.length < 5) {
      toast.error('Descreva o motivo com pelo menos 5 caracteres.')
      return
    }
    startTransition(async () => {
      try {
        const result = await denunciarPost(postId, texto)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        setDenunciando(false)
        setDenunciado(true)
        setMotivo('')
        toast.success('Denúncia enviada. A moderação vai analisar.')
      } catch {
        toast.error('Não foi possível denunciar.')
      }
    })
  }

  function toggleSalvar() {
    const eraSalvo = salvo
    setSalvo(!eraSalvo)
    startTransition(async () => {
      try {
        if (eraSalvo) {
          await removerPostSalvo(postId)
          toast.success('Removido dos salvos.')
        } else {
          await salvarPost(postId)
          toast.success('Publicação salva.')
        }
      } catch (err) {
        setSalvo(eraSalvo)
        toast.error(err instanceof Error ? err.message : 'Não foi possível salvar.')
      }
    })
  }

  function handleComentarioChange(value: string, cursor?: number) {
    const { texto: legivel, mencoes: coladas } = paraTextoLegivel(value)
    setComentario(legivel)
    setMencoesComentario((prev) => {
      const merged = [...prev]
      for (const m of coladas) {
        if (!merged.some((x) => x.userId === m.userId)) merged.push(m)
      }
      return podarMencoes(legivel, merged)
    })
    const pos = cursor ?? legivel.length
    setMencaoQuery(detectarMencaoAtiva(legivel, Math.min(pos, legivel.length)))
  }

  function inserirMencaoComentario(selecionada: MencaoSelecionada) {
    const el = inputRef.current
    const trecho = selecionada.texto
    if (!el) {
      setComentario((t) => t + trecho)
      setMencoesComentario((prev) => [
        ...prev.filter((m) => m.userId !== selecionada.userId),
        { nome: selecionada.nome, userId: selecionada.userId },
      ])
      setMencaoQuery(null)
      return
    }
    const cursor = el.selectionStart ?? comentario.length
    const query = detectarMencaoAtiva(comentario, cursor)
    if (!query) return
    const antes = comentario.slice(0, cursor - query.length - 1)
    const depois = comentario.slice(cursor)
    const next = antes + trecho + depois
    setComentario(next)
    setMencoesComentario((prev) => [
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

  function enviarRepost(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    startTransition(async () => {
      try {
        await repostarPost(postId, comentarioRepost.trim() || undefined)
        setRepostando(false)
        setCompartilhado(true)
        setComentarioRepost('')
        toast.success('Publicação compartilhada!')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível compartilhar.')
      }
    })
  }

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50'

  const mostrarSecaoComentarios =
    comentariosAbertos || comentarios.length > 0 || carregandoComentarios

  return (
    <div className="mt-3">
      <AnimatePresence>
        {(totalR > 0 || totalC > 0) && (
          <m.div
            key="contagens"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
            className="flex items-center gap-3 pb-2 text-xs text-[rgb(var(--foreground-muted))]"
          >
            {totalR > 0 && (
              <m.span layout className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5 fill-[rgb(var(--color-primary-fg))] text-[rgb(var(--color-primary-fg))]" />
                <AnimatePresence mode="popLayout" initial={false}>
                  <m.span
                    key={totalR}
                    className="inline-flex"
                    initial={{ opacity: 0, scale: 0.6, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.6, y: 6 }}
                    transition={springSnappy}
                  >
                    {totalR}
                  </m.span>
                </AnimatePresence>
              </m.span>
            )}
            {totalC > 0 && (
              <m.span layout className="inline-flex items-center gap-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  <m.span
                    key={totalC}
                    className="inline-flex"
                    initial={{ opacity: 0, scale: 0.6, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.6, y: 6 }}
                    transition={springSnappy}
                  >
                    {totalC}
                  </m.span>
                </AnimatePresence>
                comentário{totalC === 1 ? '' : 's'}
              </m.span>
            )}
          </m.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-1 border-t border-[rgb(var(--border))] pt-2">
        <EngajamentoBtn
          disabled={pending}
          active={reacao === 'CURTIR'}
          onClick={() => handleReacao('CURTIR')}
          aria-pressed={reacao === 'CURTIR'}
          aria-label={reacao === 'CURTIR' ? 'Curtido' : 'Curtir'}
          className={[
            btnBase,
            reacao === 'CURTIR'
              ? 'text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <span className="relative inline-flex">
            <AnimatePresence>
              {justLiked && (
                <m.span
                  className="pointer-events-none absolute inset-0 rounded-full bg-[rgb(var(--color-primary-fg)_/_0.35)]"
                  variants={heartBurst}
                  initial="hidden"
                  animate="show"
                  exit="hidden"
                  onAnimationComplete={() => setJustLiked(false)}
                />
              )}
            </AnimatePresence>
            <Heart className={['h-4 w-4', reacao === 'CURTIR' ? 'fill-current' : ''].join(' ')} />
          </span>
          {reacao === 'CURTIR' ? 'Curtido' : 'Curtir'}
        </EngajamentoBtn>
        <EngajamentoBtn
          active={comentariosAbertos}
          onClick={abrirComentarios}
          aria-expanded={comentariosAbertos}
          aria-label={comentariosAbertos ? 'Ocultar comentários' : 'Ver comentários'}
          className={[
            btnBase,
            comentariosAbertos
              ? 'text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <MessageCircle className="h-4 w-4" />
          {comentariosAbertos ? 'Ocultar comentários' : 'Ver comentários'}
        </EngajamentoBtn>
        {!isRepost && (
          <EngajamentoBtn
            active={repostando || compartilhado}
            onClick={() => setRepostando((v) => !v)}
            aria-pressed={compartilhado}
            aria-label={compartilhado ? 'Compartilhado' : 'Compartilhar'}
            className={[
              btnBase,
              repostando || compartilhado
                ? 'text-[rgb(var(--color-primary-fg))]'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            <m.span
              className="inline-flex"
              animate={{ rotate: compartilhado ? 360 : 0 }}
              transition={shareSpin}
            >
              <Repeat2 className="h-4 w-4" />
            </m.span>
            {compartilhado ? 'Compartilhado' : 'Compartilhar'}
          </EngajamentoBtn>
        )}
        <EngajamentoBtn
          active={salvo}
          activeTransition={bookmarkDrop}
          activeAnimate={{ scale: [1, 1.15, 1], y: [0, -3, 0] }}
          onClick={toggleSalvar}
          aria-pressed={salvo}
          aria-label={salvo ? 'Salvo' : 'Salvar'}
          className={[
            btnBase,
            salvo
              ? 'text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <Bookmark className={['h-4 w-4', salvo ? 'fill-current' : ''].join(' ')} />
          {salvo ? 'Salvo' : 'Salvar'}
        </EngajamentoBtn>
        {!isAuthor && (
          <EngajamentoBtn
            onClick={() => {
              if (denunciado) return
              setDenunciando((v) => !v)
            }}
            aria-label={denunciado ? 'Denúncia enviada' : 'Denunciar publicação'}
            aria-pressed={denunciado}
            className={[
              btnBase,
              'ml-auto',
              denunciado
                ? 'text-red-600'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-red-600',
            ].join(' ')}
          >
            <Flag className={['h-4 w-4', denunciado ? 'fill-current' : ''].join(' ')} />
          </EngajamentoBtn>
        )}
      </div>

      <AnimatePresence initial={false}>
        {repostando && (
          <m.form
            key="repost-form"
            onSubmit={enviarRepost}
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            className="mt-2 flex min-w-0 flex-col gap-2 overflow-hidden sm:flex-row sm:items-center"
          >
            <input
              value={comentarioRepost}
              onChange={(e) => setComentarioRepost(e.target.value)}
              maxLength={500}
              placeholder="Adicione um comentário (opcional)…"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2.5 text-base sm:h-9 sm:py-0 sm:text-sm"
            />
            <m.button
              type="submit"
              disabled={pending}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              className="shrink-0 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-1.5 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
            >
              Compartilhar
            </m.button>
          </m.form>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {denunciando && !denunciado && (
          <m.form
            key="denuncia-form"
            onSubmit={enviarDenuncia}
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            className="mt-2 flex min-w-0 flex-col gap-2 overflow-hidden sm:flex-row sm:items-center"
          >
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              placeholder="Por que está denunciando?"
              className="h-9 min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm text-[rgb(var(--foreground))] outline-none focus:border-red-500"
            />
            <m.button
              type="submit"
              disabled={pending}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Enviar
            </m.button>
          </m.form>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {mostrarSecaoComentarios && (
          <m.div
            key="comentarios"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            className="mt-3 space-y-3 overflow-hidden"
          >
            {carregandoComentarios && comentarios.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando comentários…
              </div>
            )}

            <m.div
              layout
              className="space-y-3"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}
              initial="hidden"
              animate="show"
            >
              {comentarios.map((c, i) => {
                const proprio = c.autor.id === currentUser.id
                const autorLabel = proprio ? 'Você' : (c.autor.nome ?? 'Membro')
                const conteudo = (
                  <PostConteudoRich
                    conteudo={c.conteudo}
                    className="text-sm text-[rgb(var(--foreground))]"
                  />
                )
                return (
                  <m.div
                    key={c.id}
                    custom={i}
                    variants={menuItemStagger}
                    className="flex items-start gap-2"
                  >
                    <Avatar nome={c.autor.nome} avatarUrl={c.autor.avatarUrl} size="xs" />
                    {proprio && !c.id.startsWith('tmp-') ? (
                      <ComentarioMenu
                        comentarioId={c.id}
                        conteudoInicial={c.conteudo}
                        autorLabel={autorLabel}
                        onEditado={(next) => {
                          setComentarios((prev) =>
                            prev.map((item) => (item.id === c.id ? { ...item, conteudo: next } : item)),
                          )
                        }}
                        onExcluido={() => {
                          setComentarios((prev) => prev.filter((item) => item.id !== c.id))
                          setTotalC((n) => Math.max(0, n - 1))
                        }}
                      >
                        {conteudo}
                      </ComentarioMenu>
                    ) : (
                      <div className="min-w-0 flex-1 rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2">
                        <p className="text-xs font-semibold text-[rgb(var(--foreground))]">{autorLabel}</p>
                        {conteudo}
                      </div>
                    )}
                  </m.div>
                )
              })}
            </m.div>

            {comentariosAbertos && (
              <form onSubmit={enviarComentario} className="flex items-center gap-2">
                <Avatar nome={currentUser.nome} avatarUrl={currentUser.avatarUrl} size="xs" />
                <div ref={comentarioCampoRef} className="relative min-w-0 flex-1">
                  <input
                    ref={inputRef}
                    value={comentario}
                    onChange={(e) => handleComentarioChange(e.target.value, e.target.selectionStart ?? undefined)}
                    onKeyUp={(e) => handleComentarioChange(comentario, e.currentTarget.selectionStart ?? undefined)}
                    maxLength={500}
                    placeholder="Escreva um comentário… use @ para mencionar"
                    className="h-9 w-full rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
                  />
                  {mencaoQuery !== null && (
                    <MentionPicker
                      query={mencaoQuery}
                      onSelect={inserirMencaoComentario}
                      onClose={() => setMencaoQuery(null)}
                      anchorRef={comentarioCampoRef}
                    />
                  )}
                </div>
                <m.button
                  type="submit"
                  disabled={pending || !comentario.trim()}
                  whileTap={{ scale: 0.9 }}
                  transition={springSnappy}
                  aria-label="Enviar comentário"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </m.button>
              </form>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
