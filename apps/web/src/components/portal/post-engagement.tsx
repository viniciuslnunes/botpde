'use client'

import { useRef, useState, useTransition } from 'react'
import { Heart, Flag, MessageCircle, Zap, Send } from 'lucide-react'
import { toast } from '@torcida/ui'
import { comentarPost, denunciarPost, reagirPost } from '@/app/portal/comunidade/actions'
import { Avatar } from './avatar'

type Reacao = 'CURTIR' | 'FORCA'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface ComentarioLocal {
  id: string
  conteudo: string
}

interface PostEngagementProps {
  postId: string
  totalReacoes: number
  totalComentarios: number
  minhaReacao: Reacao | null
  currentUser: CurrentUser
}

export function PostEngagement({
  postId,
  totalReacoes,
  totalComentarios,
  minhaReacao,
  currentUser,
}: PostEngagementProps) {
  const [reacao, setReacao] = useState<Reacao | null>(minhaReacao)
  const [totalR, setTotalR] = useState(totalReacoes)
  const [totalC, setTotalC] = useState(totalComentarios)
  const [novos, setNovos] = useState<ComentarioLocal[]>([])
  const [comentando, setComentando] = useState(false)
  const [comentario, setComentario] = useState('')
  const [denunciando, setDenunciando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleReacao(tipo: Reacao) {
    const anterior = reacao
    // Otimista, espelhando a regra do servidor (uma reação por post/usuário).
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
    setComentando((v) => !v)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function enviarComentario(e: React.FormEvent) {
    e.preventDefault()
    const texto = comentario.trim()
    if (!texto || pending) return
    const tempId = `tmp-${Date.now()}`
    setNovos((prev) => [...prev, { id: tempId, conteudo: texto }])
    setTotalC((n) => n + 1)
    setComentario('')
    startTransition(async () => {
      try {
        await comentarPost(postId, texto)
      } catch (err) {
        setNovos((prev) => prev.filter((c) => c.id !== tempId))
        setTotalC(totalComentarios + novos.length)
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

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50'

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
          onClick={abrirComentarios}
          className={[btnBase, 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]'].join(' ')}
        >
          <MessageCircle className="h-4 w-4" />
          Comentar
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

      {denunciando && (
        <form onSubmit={enviarDenuncia} className="mt-2 flex items-center gap-2">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            placeholder="Por que está denunciando?"
            className="h-9 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 text-sm text-[rgb(var(--foreground))] outline-none focus:border-red-500"
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

      {(comentando || novos.length > 0) && (
        <div className="mt-3 space-y-3">
          {novos.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar nome={currentUser.nome} avatarUrl={currentUser.avatarUrl} size="xs" />
              <div className="rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2">
                <p className="text-xs font-semibold text-[rgb(var(--foreground))]">
                  {currentUser.nome ?? 'Você'}
                </p>
                <p className="whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">{c.conteudo}</p>
              </div>
            </div>
          ))}

          {comentando && (
            <form onSubmit={enviarComentario} className="flex items-center gap-2">
              <Avatar nome={currentUser.nome} avatarUrl={currentUser.avatarUrl} size="xs" />
              <input
                ref={inputRef}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={500}
                placeholder="Escreva um comentário…"
                className="h-9 w-full rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
              />
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
