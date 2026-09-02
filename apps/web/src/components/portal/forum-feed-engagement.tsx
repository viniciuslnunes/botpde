'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ChevronDown, ChevronUp, Loader2, MessageSquare, MessagesSquare, Send } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  aplicarVotoPracaLocal,
  contagemExibidaVotoPraca,
  proximoVotoPraca,
} from '@torcida/types/portal-noticias-forum'
import {
  comentarTopicoFeed,
  listarRespostasTopicoFeed,
  votarTopicoFeed,
  type ForumRespostaFeedDto,
} from '@/app/portal/comunidade/praca-actions'
import { AVISO_MODO_OPERADOR, useModoOperador } from '@/lib/modo-operador'
import { collapsePanel, menuItemStagger, reactionPop, springGentle, springSnappy } from '@/lib/motion-presets'
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

type VotoTopico = 1 | -1 | null

export function ForumFeedEngagement({
  topicoId,
  escopo,
  gostei,
  naoGostei,
  meuVoto,
  totalRespostas,
  currentUser,
}: {
  topicoId: string
  escopo: EscopoComunidade
  gostei: number
  naoGostei: number
  meuVoto: VotoTopico
  totalRespostas: number
  currentUser: CurrentUser
}) {
  const [voto, setVoto] = useState<VotoTopico>(meuVoto)
  const [totalGostei, setTotalGostei] = useState(gostei)
  const [totalNao, setTotalNao] = useState(naoGostei)
  const [totalC, setTotalC] = useState(totalRespostas)
  const [respostas, setRespostas] = useState<ForumRespostaFeedDto[]>([])
  const [abertos, setAbertos] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [pending, startTransition] = useTransition()
  const operador = useModoOperador()
  const carregadasRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const apoios = contagemExibidaVotoPraca(totalGostei, totalNao)

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

  function votar(proximo: 1 | -1) {
    if (operador) {
      toast.error(AVISO_MODO_OPERADOR)
      return
    }
    const anterior = voto
    const novo = proximoVotoPraca(anterior, proximo)
    const snapshot = { voto: anterior, gostei: totalGostei, nao: totalNao }
    const local = aplicarVotoPracaLocal(totalGostei, totalNao, anterior, novo)
    setVoto(novo === 0 ? null : novo)
    setTotalGostei(local.gostei)
    setTotalNao(local.naoGostei)
    startTransition(async () => {
      const r = await votarTopicoFeed(topicoId, novo, escopo)
      if ('error' in r) {
        setVoto(snapshot.voto)
        setTotalGostei(snapshot.gostei)
        setTotalNao(snapshot.nao)
        toast.error(r.error)
      }
    })
  }

  function abrirRespostas() {
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
    'inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-1 text-xs font-medium transition-colors disabled:opacity-50 sm:gap-1.5 sm:px-2 sm:py-1.5 sm:text-sm'
  const btnLabel = 'truncate @max-[26rem]:sr-only'
  const mostrarSecao = abertos || respostas.length > 0 || carregando

  return (
    <div className="mt-1.5">
      <AnimatePresence>
        {totalC > 0 && (
          <m.div
            key="contagens"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
            className="flex items-center gap-3 pb-1 text-xs text-[rgb(var(--foreground-muted))]"
          >
            <span>{totalC} {totalC === 1 ? 'resposta' : 'respostas'}</span>
          </m.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-0.5 border-t border-[rgb(var(--border))] pt-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <m.button
            type="button"
            whileTap={{ scale: 0.9 }}
            animate={voto === 1 ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={voto === 1 ? reactionPop : springSnappy}
            onClick={() => votar(1)}
            disabled={pending || operador}
            title={operador ? AVISO_MODO_OPERADOR : undefined}
            aria-pressed={voto === 1}
            aria-label={voto === 1 ? 'Remover concordância' : 'Concordo com este tópico'}
            className={[
              btnBase,
              voto === 1
                ? 'text-[rgb(var(--color-primary-fg))]'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            <ChevronUp className={['h-4 w-4', voto === 1 ? 'stroke-[2.5]' : ''].join(' ')} />
            <span className={btnLabel}>Concordo</span>
          </m.button>

          <span
            className="min-w-7 px-1 text-center text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]"
            aria-label={`${apoios} de saldo no tópico`}
          >
            {apoios}
          </span>

          <m.button
            type="button"
            whileTap={{ scale: 0.9 }}
            animate={voto === -1 ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={voto === -1 ? reactionPop : springSnappy}
            onClick={() => votar(-1)}
            disabled={pending || operador}
            title={operador ? AVISO_MODO_OPERADOR : undefined}
            aria-pressed={voto === -1}
            aria-label={voto === -1 ? 'Remover discordância' : 'Discordo deste tópico'}
            className={[
              btnBase,
              voto === -1
                ? 'text-[rgb(var(--foreground))]'
                : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
            ].join(' ')}
          >
            <ChevronDown className={['h-4 w-4', voto === -1 ? 'stroke-[2.5]' : ''].join(' ')} />
            <span className={btnLabel}>Discordo</span>
          </m.button>
        </div>

        <m.button
          type="button"
          whileTap={{ scale: 0.9 }}
          transition={springSnappy}
          onClick={abrirRespostas}
          aria-expanded={abertos}
          aria-label={abertos ? 'Ocultar respostas' : 'Responder'}
          className={[
            btnBase,
            abertos
              ? 'text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <MessageSquare className="h-4 w-4" />
          <span className={btnLabel}>{abertos ? 'Ocultar' : 'Responder'}</span>
        </m.button>

        <ComunidadePrefetchLink
          href={linkTopicoForum(topicoId, escopo)}
          aria-label="Abrir este tópico no fórum"
          className={`${btnBase} shrink-0 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]`}
        >
          <MessagesSquare className="h-4 w-4" />
          <span className={btnLabel}>Fórum</span>
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
                  <span className="sr-only">Enviar resposta</span>
                </m.button>
              </form>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
