'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Heart, MessageCircle, Loader2, Send, MessagesSquare } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  comentarTopicoFeed,
  listarRespostasTopicoFeed,
  votarTopicoFeed,
  type ForumRespostaFeedDto,
} from '@/app/portal/comunidade/praca-actions'
import { AVISO_MODO_OPERADOR, useModoOperador } from '@/lib/modo-operador'
import { collapsePanel, heartBurst, menuItemStagger, reactionPop, springGentle, springSnappy } from '@/lib/motion-presets'
import { linkTopicoForum } from '@/lib/comunidade-social'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { Avatar } from './avatar'
import { PostConteudoRich } from './post-conteudo-rich'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

export function ForumFeedEngagement({
  topicoId,
  escopo,
  totalReacoes,
  totalComentarios,
  minhaReacao,
  currentUser,
}: {
  topicoId: string
  escopo: EscopoComunidade
  totalReacoes: number
  totalComentarios: number
  minhaReacao: 'CURTIR' | null
  currentUser: CurrentUser
}) {
  const [apoiado, setApoiado] = useState(minhaReacao === 'CURTIR')
  const [totalR, setTotalR] = useState(totalReacoes)
  const [totalC, setTotalC] = useState(totalComentarios)
  const [respostas, setRespostas] = useState<ForumRespostaFeedDto[]>([])
  const [abertos, setAbertos] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [justLiked, setJustLiked] = useState(false)
  const [pending, startTransition] = useTransition()
  const operador = useModoOperador()
  const carregadasRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    if (carregadasRef.current) return
    setCarregando(true)
    setErro(null)
    try {
      const lista = await listarRespostasTopicoFeed(topicoId, escopo)
      setRespostas(lista)
      carregadasRef.current = true
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Não foi possível carregar as respostas.'
      setErro(mensagem)
      toast.error(mensagem)
    } finally {
      setCarregando(false)
    }
  }, [escopo, topicoId])

  function toggleApoio() {
    if (operador) {
      toast.error(AVISO_MODO_OPERADOR)
      return
    }
    const anterior = apoiado
    const totalAnterior = totalR
    setApoiado(!anterior)
    setTotalR((n) => Math.max(0, n + (anterior ? -1 : 1)))
    if (!anterior) setJustLiked(true)
    startTransition(async () => {
      const r = await votarTopicoFeed(topicoId, anterior ? 0 : 1, escopo)
      if ('error' in r) {
        setApoiado(anterior)
        setTotalR(totalAnterior)
        toast.error(r.error)
      }
    })
  }

  function abrirComentarios() {
    const next = !abertos
    setAbertos(next)
    if (next) void carregar()
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo || operador) return
    const tmp: ForumRespostaFeedDto = {
      id: `tmp-${Date.now()}`,
      conteudo,
      criadoEm: new Date().toISOString(),
      autor: currentUser,
    }
    setRespostas((prev) => [...prev, tmp])
    setTotalC((n) => n + 1)
    setTexto('')
    startTransition(async () => {
      const r = await comentarTopicoFeed(topicoId, conteudo, escopo)
      if ('error' in r) {
        setRespostas((prev) => prev.filter((x) => x.id !== tmp.id))
        setTotalC((n) => Math.max(0, n - 1))
        toast.error(r.error)
        return
      }
      setRespostas((prev) => prev.map((x) => (x.id === tmp.id ? r : x)))
    })
  }

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50'
  const mostrarSecao = abertos || respostas.length > 0 || carregando

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
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5 fill-[rgb(var(--color-primary-fg))] text-[rgb(var(--color-primary-fg))]" />
                {totalR}
              </span>
            )}
            {totalC > 0 && <span>{totalC} {totalC === 1 ? 'resposta' : 'respostas'}</span>}
          </m.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-1 border-t border-[rgb(var(--border))] pt-2">
        <m.button
          type="button"
          whileTap={{ scale: 0.9 }}
          animate={apoiado ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={apoiado ? reactionPop : springSnappy}
          onClick={toggleApoio}
          disabled={pending || operador}
          title={operador ? AVISO_MODO_OPERADOR : undefined}
          aria-pressed={apoiado}
          aria-label={apoiado ? 'Remover apoio' : 'Apoiar'}
          className={[
            btnBase,
            apoiado
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
            <Heart className={['h-4 w-4', apoiado ? 'fill-current' : ''].join(' ')} />
          </span>
          {apoiado ? 'Apoiado' : 'Apoiar'}
        </m.button>

        <m.button
          type="button"
          whileTap={{ scale: 0.9 }}
          transition={springSnappy}
          onClick={abrirComentarios}
          aria-expanded={abertos}
          className={[
            btnBase,
            abertos
              ? 'text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <MessageCircle className="h-4 w-4" />
          {abertos ? 'Ocultar' : 'Comentar'}
        </m.button>

        <ComunidadePrefetchLink
          href={linkTopicoForum(topicoId, escopo)}
          className={`${btnBase} text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]`}
        >
          <MessagesSquare className="h-4 w-4" />
          Ver discussão
        </ComunidadePrefetchLink>
      </div>

      <AnimatePresence initial={false}>
        {mostrarSecao && (
          <m.div
            key="respostas"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            className="mt-3 space-y-3 overflow-hidden"
          >
            {carregando && respostas.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando respostas…
              </div>
            )}
            {!carregando && erro && respostas.length === 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <span>{erro}</span>
                <button
                  type="button"
                  onClick={() => {
                    carregadasRef.current = false
                    void carregar()
                  }}
                  className="app-touch-target rounded-lg px-2 py-1 font-semibold text-[rgb(var(--color-primary))]"
                >
                  Tentar de novo
                </button>
              </div>
            )}
            <m.div layout className="space-y-3">
              {respostas.map((c, i) => (
                <m.div
                  key={c.id}
                  custom={i}
                  variants={menuItemStagger}
                  className="flex items-start gap-2"
                >
                  <Avatar nome={c.autor.nome} avatarUrl={c.autor.avatarUrl} size="xs" />
                  <div className="min-w-0 flex-1 rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2">
                    <p className="text-xs font-semibold text-[rgb(var(--foreground))]">
                      {c.autor.id === currentUser.id ? 'Você' : (c.autor.nome ?? 'Alguém')}
                    </p>
                    <PostConteudoRich
                      conteudo={c.conteudo}
                      className="text-sm text-[rgb(var(--foreground))]"
                    />
                  </div>
                </m.div>
              ))}
            </m.div>
            {!operador && (
              <form onSubmit={enviar} className="flex min-w-0 items-center gap-2">
                <input
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={2000}
                  placeholder="Responda neste tópico…"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2.5 text-base sm:h-9 sm:py-0 sm:text-sm"
                />
                <m.button
                  type="submit"
                  disabled={pending || texto.trim().length === 0}
                  whileTap={{ scale: 0.96 }}
                  transition={springSnappy}
                  className="app-action shrink-0 rounded-lg bg-[rgb(var(--color-primary))] px-3 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span className="sr-only">Enviar</span>
                </m.button>
              </form>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
