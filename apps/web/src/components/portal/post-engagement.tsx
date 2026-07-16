'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Heart, Flag, MessageCircle, Zap, Send, Loader2, Flame, CheckCircle, Repeat2, Bookmark } from 'lucide-react'
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
import type { TipoReacaoSocial } from '@/lib/comunidade-social'
import {
  collapsePanel,
  menuItemStagger,
  reactionPop,
  springGentle,
  springSnappy,
} from '@/lib/motion-presets'
import { Avatar } from './avatar'
import { PostConteudoRich } from './post-conteudo-rich'
import { MentionPicker, detectarMencaoAtiva } from './mention-picker'

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
  isRepost?: boolean
  salvoInicial?: boolean
}

function EngajamentoBtn({
  children,
  active,
  className,
  onClick,
  disabled,
  ...rest
}: {
  children: React.ReactNode
  active?: boolean
  className: string
  onClick?: () => void
  disabled?: boolean
  'aria-label'?: string
  'aria-pressed'?: boolean
  'aria-expanded'?: boolean
}) {
  return (
    <m.button
      type="button"
      whileTap={{ scale: 0.9 }}
      animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={active ? reactionPop : springSnappy}
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
  const [denunciando, setDenunciando] = useState(false)
  const [repostando, setRepostando] = useState(false)
  const [comentarioRepost, setComentarioRepost] = useState('')
  const [motivo, setMotivo] = useState('')
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
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
    if (anterior === tipo) {
      setReacao(null)
      setTotalR((n) => Math.max(0, n - 1))
    } else {
      setReacao(tipo)
      if (anterior === null) setTotalR((n) => n + 1)
    }
    startTransition(async () => {
      try {
        await reagirPost(postId, tipo)
      } catch (e) {
        setReacao(anterior)
        setTotalR(totalReacoes)
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
    const texto = comentario.trim()
    if (!texto || pending) return
    const tempId = `tmp-${Date.now()}`
    const otimista: ComentarioPostItem = {
      id: tempId,
      conteudo: texto,
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
    setComentariosAbertos(true)
    startTransition(async () => {
      try {
        const salvoComentario = await comentarPost(postId, texto)
        setComentarios((prev) => prev.map((c) => (c.id === tempId ? salvoComentario : c)))
        comentariosCarregadosRef.current = true
      } catch (err) {
        setComentarios((prev) => prev.filter((c) => c.id !== tempId))
        setTotalC((n) => Math.max(0, n - 1))
        setComentario(texto)
        toast.error(err instanceof Error ? err.message : 'Não foi possível comentar.')
      }
    })
  }

  function enviarDenuncia(e: React.FormEvent) {
    e.preventDefault()
    const texto = motivo.trim()
    if (texto.length < 5) {
      toast.error('Descreva o motivo com pelo menos 5 caracteres.')
      return
    }
    startTransition(async () => {
      try {
        await denunciarPost(postId, texto)
        setDenunciando(false)
        setMotivo('')
        toast.success('Denúncia enviada. A moderação vai analisar.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível denunciar.')
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
    setComentario(value)
    setMencaoQuery(detectarMencaoAtiva(value, cursor ?? value.length))
  }

  function inserirMencaoComentario(mencao: string) {
    const el = inputRef.current
    if (!el) {
      setComentario((t) => t + mencao)
      setMencaoQuery(null)
      return
    }
    const cursor = el.selectionStart ?? comentario.length
    const query = detectarMencaoAtiva(comentario, cursor)
    if (!query) return
    const antes = comentario.slice(0, cursor - query.length - 1)
    const depois = comentario.slice(cursor)
    const next = antes + mencao + depois
    setComentario(next)
    setMencaoQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      const pos = antes.length + mencao.length
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
                <Heart className="h-3.5 w-3.5 fill-[rgb(var(--primary))] text-[rgb(var(--primary))]" />
                {totalR}
              </m.span>
            )}
            {totalC > 0 && (
              <m.span layout>
                {totalC} comentário{totalC === 1 ? '' : 's'}
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
          className={[
            btnBase,
            reacao === 'CURTIR'
              ? 'text-[rgb(var(--primary))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <Heart className={['h-4 w-4', reacao === 'CURTIR' ? 'fill-current' : ''].join(' ')} />
          Curtir
        </EngajamentoBtn>
        <EngajamentoBtn
          disabled={pending}
          active={reacao === 'FORCA'}
          onClick={() => handleReacao('FORCA')}
          aria-pressed={reacao === 'FORCA'}
          className={[
            btnBase,
            reacao === 'FORCA'
              ? 'text-amber-500'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <Zap className={['h-4 w-4', reacao === 'FORCA' ? 'fill-current' : ''].join(' ')} />
          Força
        </EngajamentoBtn>
        <EngajamentoBtn
          disabled={pending}
          active={reacao === 'VAMOS'}
          onClick={() => handleReacao('VAMOS')}
          aria-pressed={reacao === 'VAMOS'}
          className={[
            btnBase,
            reacao === 'VAMOS'
              ? 'text-orange-500'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <Flame className={['h-4 w-4', reacao === 'VAMOS' ? 'fill-current' : ''].join(' ')} />
          Vamos!
        </EngajamentoBtn>
        <EngajamentoBtn
          disabled={pending}
          active={reacao === 'PRESENTE'}
          onClick={() => handleReacao('PRESENTE')}
          aria-pressed={reacao === 'PRESENTE'}
          className={[
            btnBase,
            reacao === 'PRESENTE'
              ? 'text-emerald-500'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <CheckCircle className={['h-4 w-4', reacao === 'PRESENTE' ? 'fill-current' : ''].join(' ')} />
          Presente
        </EngajamentoBtn>
        <EngajamentoBtn
          active={comentariosAbertos}
          onClick={abrirComentarios}
          aria-expanded={comentariosAbertos}
          className={[
            btnBase,
            comentariosAbertos
              ? 'text-[rgb(var(--primary))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <MessageCircle className="h-4 w-4" />
          Comentar
        </EngajamentoBtn>
        {!isRepost && (
          <EngajamentoBtn
            active={repostando}
            onClick={() => setRepostando((v) => !v)}
            className={[
              btnBase,
              repostando
                ? 'text-[rgb(var(--primary))]'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            <Repeat2 className="h-4 w-4" />
            Compartilhar
          </EngajamentoBtn>
        )}
        <EngajamentoBtn
          active={salvo}
          onClick={toggleSalvar}
          aria-pressed={salvo}
          className={[
            btnBase,
            salvo
              ? 'text-[rgb(var(--primary))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <Bookmark className={['h-4 w-4', salvo ? 'fill-current' : ''].join(' ')} />
          Salvar
        </EngajamentoBtn>
        <EngajamentoBtn
          onClick={() => setDenunciando((v) => !v)}
          aria-label="Denunciar publicação"
          className={[btnBase, 'ml-auto text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-red-600'].join(' ')}
        >
          <Flag className="h-4 w-4" />
        </EngajamentoBtn>
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
              className="h-9 min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
            />
            <m.button
              type="submit"
              disabled={pending}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              className="shrink-0 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Compartilhar
            </m.button>
          </m.form>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {denunciando && (
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
              {comentarios.map((c, i) => (
                <m.div
                  key={c.id}
                  custom={i}
                  variants={menuItemStagger}
                  layout
                  className="flex items-start gap-2"
                >
                  <Avatar nome={c.autor.nome} avatarUrl={c.autor.avatarUrl} size="xs" />
                  <div className="min-w-0 rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2">
                    <p className="text-xs font-semibold text-[rgb(var(--foreground))]">
                      {c.autor.id === currentUser.id ? 'Você' : (c.autor.nome ?? 'Membro')}
                    </p>
                    <PostConteudoRich
                      conteudo={c.conteudo}
                      className="text-sm text-[rgb(var(--foreground))]"
                    />
                  </div>
                </m.div>
              ))}
            </m.div>

            {comentariosAbertos && (
              <form onSubmit={enviarComentario} className="flex items-center gap-2">
                <Avatar nome={currentUser.nome} avatarUrl={currentUser.avatarUrl} size="xs" />
                <div className="relative min-w-0 flex-1">
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
                    />
                  )}
                </div>
                <m.button
                  type="submit"
                  disabled={pending || !comentario.trim()}
                  whileTap={{ scale: 0.9 }}
                  transition={springSnappy}
                  aria-label="Enviar comentário"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
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
