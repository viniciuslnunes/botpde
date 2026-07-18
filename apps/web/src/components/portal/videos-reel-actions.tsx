'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  Bookmark,
  Heart,
  Loader2,
  MessageCircle,
  Send,
  Share2,
  X,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  comentarPost,
  listarComentariosPost,
  reagirPost,
  removerPostSalvo,
  salvarPost,
  type ComentarioPostItem,
} from '@/app/portal/comunidade/actions'
import { Avatar } from '@/components/portal/avatar'
import { PostConteudoRich } from '@/components/portal/post-conteudo-rich'
import { linkPostComunidade, type TipoReacaoSocial } from '@/lib/comunidade-social'
import { popoverPanel, reactionPop, springSnappy } from '@/lib/motion-presets'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface VideosReelActionsProps {
  postId: string
  totalReacoes: number
  totalComentarios: number
  minhaReacao: TipoReacaoSocial | null
  currentUser: CurrentUser
  /** Dispara like externo (ex.: double-tap) — incrementa o gerador. */
  likePulse?: number
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')} mil`
  return `${Math.round(n / 1000)} mil`
}

export function VideosReelActions({
  postId,
  totalReacoes,
  totalComentarios,
  minhaReacao,
  currentUser,
  likePulse = 0,
}: VideosReelActionsProps) {
  const [reacao, setReacao] = useState<TipoReacaoSocial | null>(minhaReacao)
  const [totalR, setTotalR] = useState(totalReacoes)
  const [totalC, setTotalC] = useState(totalComentarios)
  const [salvo, setSalvo] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [comentarios, setComentarios] = useState<ComentarioPostItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [texto, setTexto] = useState('')
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const carregadosRef = useRef(false)
  const lastPulseRef = useRef(0)

  const aplicarLike = useCallback(() => {
    const anterior = reacao
    const totalAnterior = totalR
    if (anterior === 'CURTIR') return
    setReacao('CURTIR')
    setTotalR((n) => n + 1)
    startTransition(async () => {
      try {
        const { minhaReacao: next } = await reagirPost(postId, 'CURTIR')
        setReacao(next)
      } catch (e) {
        setReacao(anterior)
        setTotalR(totalAnterior)
        toast.error(e instanceof Error ? e.message : 'Não foi possível curtir.')
      }
    })
  }, [postId, reacao, totalR])

  const toggleLike = useCallback(() => {
    const anterior = reacao
    const totalAnterior = totalR
    if (anterior === 'CURTIR') {
      setReacao(null)
      setTotalR((n) => Math.max(0, n - 1))
    } else {
      setReacao('CURTIR')
      setTotalR((n) => n + 1)
    }
    startTransition(async () => {
      try {
        const { minhaReacao: next } = await reagirPost(postId, 'CURTIR')
        setReacao(next)
      } catch (e) {
        setReacao(anterior)
        setTotalR(totalAnterior)
        toast.error(e instanceof Error ? e.message : 'Não foi possível curtir.')
      }
    })
  }, [postId, reacao, totalR])

  useEffect(() => {
    if (likePulse > 0 && likePulse !== lastPulseRef.current) {
      lastPulseRef.current = likePulse
      aplicarLike()
    }
  }, [likePulse, aplicarLike])

  async function abrirComentarios() {
    setSheetOpen(true)
    if (carregadosRef.current) {
      requestAnimationFrame(() => inputRef.current?.focus())
      return
    }
    setCarregando(true)
    try {
      const lista = await listarComentariosPost(postId)
      setComentarios(lista)
      carregadosRef.current = true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível carregar comentários.')
    } finally {
      setCarregando(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  function enviarComentario(e: React.FormEvent) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo || pending) return
    const tempId = `tmp-${Date.now()}`
    const otimista: ComentarioPostItem = {
      id: tempId,
      conteudo,
      criadoEm: new Date().toISOString(),
      autor: {
        id: currentUser.id,
        nome: currentUser.nome,
        avatarUrl: currentUser.avatarUrl,
      },
    }
    setComentarios((prev) => [...prev, otimista])
    setTotalC((n) => n + 1)
    setTexto('')
    startTransition(async () => {
      try {
        const salvoComentario = await comentarPost(postId, conteudo)
        setComentarios((prev) => prev.map((c) => (c.id === tempId ? salvoComentario : c)))
        carregadosRef.current = true
      } catch (err) {
        setComentarios((prev) => prev.filter((c) => c.id !== tempId))
        setTotalC((n) => Math.max(0, n - 1))
        setTexto(conteudo)
        toast.error(err instanceof Error ? err.message : 'Não foi possível comentar.')
      }
    })
  }

  function toggleSalvar() {
    const anterior = salvo
    setSalvo(!anterior)
    startTransition(async () => {
      try {
        if (anterior) await removerPostSalvo(postId)
        else await salvarPost(postId)
      } catch (e) {
        setSalvo(anterior)
        toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.')
      }
    })
  }

  async function compartilhar() {
    const url = `${window.location.origin}${linkPostComunidade(postId)}`
    try {
      if (navigator.share) {
        await navigator.share({ url, title: 'Vídeo da comunidade' })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado.')
    } catch {
      /* usuário cancelou share */
    }
  }

  const btnClass =
    'flex flex-col items-center gap-0.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        <m.button
          type="button"
          onClick={toggleLike}
          disabled={pending}
          whileTap={{ scale: 0.88 }}
          animate={reacao === 'CURTIR' ? { scale: [1, 1.18, 1] } : { scale: 1 }}
          transition={reacao === 'CURTIR' ? reactionPop : springSnappy}
          aria-pressed={reacao === 'CURTIR'}
          aria-label={reacao === 'CURTIR' ? 'Descurtir' : 'Curtir'}
          className={btnClass}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
            <Heart
              className={[
                'h-6 w-6',
                reacao === 'CURTIR' ? 'fill-red-500 text-red-500' : 'text-white',
              ].join(' ')}
            />
          </span>
          <span className="text-[11px] font-semibold tabular-nums">{formatCount(totalR)}</span>
        </m.button>

        <m.button
          type="button"
          onClick={() => void abrirComentarios()}
          whileTap={{ scale: 0.88 }}
          transition={springSnappy}
          aria-label="Comentários"
          className={btnClass}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
            <MessageCircle className="h-6 w-6 text-white" />
          </span>
          <span className="text-[11px] font-semibold tabular-nums">{formatCount(totalC)}</span>
        </m.button>

        <m.button
          type="button"
          onClick={toggleSalvar}
          disabled={pending}
          whileTap={{ scale: 0.88 }}
          transition={springSnappy}
          aria-pressed={salvo}
          aria-label={salvo ? 'Remover dos salvos' : 'Salvar'}
          className={btnClass}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
            <Bookmark className={['h-6 w-6', salvo ? 'fill-white text-white' : 'text-white'].join(' ')} />
          </span>
          <span className="text-[11px] font-semibold">Salvar</span>
        </m.button>

        <m.button
          type="button"
          onClick={() => void compartilhar()}
          whileTap={{ scale: 0.88 }}
          transition={springSnappy}
          aria-label="Compartilhar"
          className={btnClass}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
            <Share2 className="h-5 w-5 text-white" />
          </span>
          <span className="text-[11px] font-semibold">Enviar</span>
        </m.button>
      </div>

      <AnimatePresence>
        {sheetOpen && (
          <>
            <m.button
              type="button"
              key="sheet-backdrop"
              aria-label="Fechar comentários"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[60] bg-black/50"
              onClick={() => setSheetOpen(false)}
            />
            <m.div
              key="sheet-panel"
              role="dialog"
              aria-label="Comentários"
              variants={popoverPanel}
              initial="hidden"
              animate="show"
              exit="exit"
              className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[70vh] flex-col rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                  Comentários{totalC > 0 ? ` · ${totalC}` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="rounded-full p-1.5 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {carregando && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--foreground-muted))]" />
                  </div>
                )}
                {!carregando && comentarios.length === 0 && (
                  <p className="py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
                    Seja o primeiro a comentar.
                  </p>
                )}
                {comentarios.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <Avatar nome={c.autor.nome} avatarUrl={c.autor.avatarUrl} size="xs" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[rgb(var(--foreground))]">
                        {c.autor.nome ?? 'Membro'}
                      </p>
                      <PostConteudoRich
                        conteudo={c.conteudo}
                        className="text-sm text-[rgb(var(--foreground))]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={enviarComentario}
                className="flex items-center gap-2 border-t border-[rgb(var(--border))] px-3 py-2"
              >
                <Avatar
                  nome={currentUser.nome}
                  avatarUrl={currentUser.avatarUrl}
                  size="xs"
                />
                <input
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Adicione um comentário…"
                  maxLength={500}
                  className="min-w-0 flex-1 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2 text-sm text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))]"
                />
                <m.button
                  type="submit"
                  disabled={pending || !texto.trim()}
                  whileTap={{ scale: 0.92 }}
                  transition={springSnappy}
                  aria-label="Enviar comentário"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-on))] disabled:opacity-40"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </m.button>
              </form>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
