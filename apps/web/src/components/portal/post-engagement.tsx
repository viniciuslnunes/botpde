'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
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

  useEffect(() => {
    if (totalComentarios > 0) {
      const timer = window.setTimeout(() => void carregarComentarios(), 0)
      return () => window.clearTimeout(timer)
    }
  }, [totalComentarios, carregarComentarios])

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
        const salvo = await comentarPost(postId, texto)
        setComentarios((prev) => prev.map((c) => (c.id === tempId ? salvo : c)))
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
      {(totalR > 0 || totalC > 0) && (
        <div className="flex items-center gap-3 pb-2 text-xs text-[rgb(var(--foreground-muted))]">
          {totalR > 0 && (
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5 fill-[rgb(var(--primary))] text-[rgb(var(--primary))]" />
              {totalR}
            </span>
          )}
          {totalC > 0 && <span>{totalC} comentário{totalC === 1 ? '' : 's'}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-t border-[rgb(var(--border))] pt-2">
        <button
          type="button"
          disabled={pending}
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
        </button>
        <button
          type="button"
          disabled={pending}
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
        </button>
        <button
          type="button"
          disabled={pending}
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
        </button>
        <button
          type="button"
          disabled={pending}
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
        </button>
        <button
          type="button"
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
        </button>
        {!isRepost && (
          <button
            type="button"
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
          </button>
        )}
        <button
          type="button"
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
        </button>
        <button
          type="button"
          onClick={() => setDenunciando((v) => !v)}
          aria-label="Denunciar publicação"
          className={[btnBase, 'ml-auto text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-red-600'].join(' ')}
        >
          <Flag className="h-4 w-4" />
        </button>
      </div>

      {repostando && (
        <form onSubmit={enviarRepost} className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={comentarioRepost}
            onChange={(e) => setComentarioRepost(e.target.value)}
            maxLength={500}
            placeholder="Adicione um comentário (opcional)…"
            className="h-9 min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Compartilhar
          </button>
        </form>
      )}

      {denunciando && (
        <form onSubmit={enviarDenuncia} className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            placeholder="Por que está denunciando?"
            className="h-9 min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm text-[rgb(var(--foreground))] outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Enviar
          </button>
        </form>
      )}

      {mostrarSecaoComentarios && (
        <div className="mt-3 space-y-3">
          {carregandoComentarios && comentarios.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando comentários…
            </div>
          )}

          {comentarios.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
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
            </div>
          ))}

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
              <button
                type="submit"
                disabled={pending || !comentario.trim()}
                aria-label="Enviar comentário"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
