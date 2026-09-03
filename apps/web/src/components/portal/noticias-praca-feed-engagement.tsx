'use client'

import { useCallback, useRef, useState, useTransition, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Newspaper, RotateCcw, Send } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  aplicarVotoPracaLocal,
  contagemExibidaVotoPraca,
  proximoVotoPraca,
} from '@torcida/types/portal-noticias-forum'
import {
  comentarNoticiaFeed,
  editarComentarioPraca,
  excluirComentarioPraca,
  listarComentariosNoticiaFeed,
  votarNoticiaFeed,
  type ForumRespostaFeedDto,
} from '@/app/portal/comunidade/praca-actions'
import { AVISO_MODO_OPERADOR, useModoOperador } from '@/lib/modo-operador'
import { collapsePanel, menuItemStagger, reactionPop, springGentle, springSnappy } from '@/lib/motion-presets'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import { Avatar } from './avatar'
import { ComentarioMenu } from './comentario-menu'
import { PostConteudoRich } from './post-conteudo-rich'
import { AppButton } from '@/components/ui/button'
import {
  ComentarioComposerInline,
  ComentarioRespostasBloco,
  comentarioEstaNaThread,
} from '@/components/portal/comentario-respostas-bloco'
import {
  achatarRespostasDaArvore,
  contarRespostasNaArvore,
  montarArvoreComentarios,
  type NoComentario,
} from '@/lib/comentario-thread'
import { PRACA_COMENTARIO_MAX } from '@torcida/types/portal-noticias-forum'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

type VotoPraca = 1 | -1 | null

const btnResponderClass =
  'app-touch-line inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]'

function LinhaRespostaNoticia({
  comentario,
  currentUserId,
  escopo,
  onResponder,
  onEditado,
  onExcluido,
}: {
  comentario: ForumRespostaFeedDto
  currentUserId: string
  escopo: EscopoComunidade
  onResponder: (c: ForumRespostaFeedDto) => void
  onEditado: (id: string, conteudo: string) => void
  onExcluido: (id: string) => void
}) {
  const persistido = !comentario.id.startsWith('tmp-')
  const proprio = comentario.autor.id === currentUserId
  const autorLabel = proprio ? 'Você' : (comentario.autor.nome ?? 'Alguém')
  const conteudo = (
    <PostConteudoRich
      conteudo={comentario.conteudo}
      className="text-sm text-[rgb(var(--foreground))]"
    />
  )

  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <Avatar nome={comentario.autor.nome} avatarUrl={comentario.autor.avatarUrl} size="xs" />
      <div className="min-w-0 flex-1">
        {proprio && persistido ? (
          <ComentarioMenu
            comentarioId={comentario.id}
            conteudoInicial={comentario.conteudo}
            autorLabel={autorLabel}
            comMencoes={false}
            maxLength={PRACA_COMENTARIO_MAX}
            editarAction={async (id, next) => {
              const r = await editarComentarioPraca(id, next, escopo)
              if ('error' in r) throw new Error(r.error)
              return r.conteudo
            }}
            excluirAction={async (id) => {
              const r = await excluirComentarioPraca(id, escopo)
              if ('error' in r) throw new Error(r.error)
            }}
            onEditado={(next) => onEditado(comentario.id, next)}
            onExcluido={() => onExcluido(comentario.id)}
          >
            {conteudo}
          </ComentarioMenu>
        ) : (
          <>
            <p className="text-xs font-semibold text-[rgb(var(--foreground))]">{autorLabel}</p>
            {conteudo}
          </>
        )}
        {persistido ? (
          <AppButton
            variant="none"
            icon={MessageSquare}
            type="button"
            onClick={() => onResponder(comentario)}
            className={btnResponderClass}
          >
            Responder
          </AppButton>
        ) : null}
      </div>
    </div>
  )
}

function LinhaComentarioNoticiaFeed({
  no,
  currentUserId,
  escopo,
  onResponder,
  respondendoA,
  composer,
  onEditado,
  onExcluido,
}: {
  no: NoComentario<ForumRespostaFeedDto>
  currentUserId: string
  escopo: EscopoComunidade
  onResponder: (c: ForumRespostaFeedDto) => void
  respondendoA: string | null
  composer: ReactNode
  onEditado: (id: string, conteudo: string) => void
  onExcluido: (id: string) => void
}) {
  const c = no.comentario
  const persistido = !c.id.startsWith('tmp-')
  const proprio = c.autor.id === currentUserId
  const autorLabel = proprio ? 'Você' : (c.autor.nome ?? 'Alguém')
  const totalRespostas = contarRespostasNaArvore(no)
  const respostas = achatarRespostasDaArvore(no)
  const naThread = comentarioEstaNaThread(
    c.id,
    respostas.map((r) => r.id),
    respondendoA,
  )
  const conteudo = (
    <PostConteudoRich conteudo={c.conteudo} className="text-sm text-[rgb(var(--foreground))]" />
  )

  return (
    <div>
      <m.div variants={menuItemStagger} className="flex items-start gap-2">
        <Avatar nome={c.autor.nome} avatarUrl={c.autor.avatarUrl} size="xs" />
        <div className="min-w-0 flex-1">
          {proprio && persistido ? (
            <ComentarioMenu
              comentarioId={c.id}
              conteudoInicial={c.conteudo}
              autorLabel={autorLabel}
              comMencoes={false}
              maxLength={PRACA_COMENTARIO_MAX}
              editarAction={async (id, next) => {
                const r = await editarComentarioPraca(id, next, escopo)
                if ('error' in r) throw new Error(r.error)
                return r.conteudo
              }}
              excluirAction={async (id) => {
                const r = await excluirComentarioPraca(id, escopo)
                if ('error' in r) throw new Error(r.error)
              }}
              onEditado={(next) => onEditado(c.id, next)}
              onExcluido={() => onExcluido(c.id)}
            >
              {conteudo}
            </ComentarioMenu>
          ) : (
            <div className="rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2">
              <p className="text-xs font-semibold text-[rgb(var(--foreground))]">{autorLabel}</p>
              {conteudo}
            </div>
          )}
          <ComentarioRespostasBloco
            total={totalRespostas}
            forcarAberto={naThread}
            acaoResponder={
              persistido ? (
                <AppButton
                  variant="none"
                  icon={MessageSquare}
                  type="button"
                  onClick={() => onResponder(c)}
                  className={btnResponderClass}
                >
                  Responder
                </AppButton>
              ) : null
            }
            composer={composer}
          >
            {respostas.map((r) => (
              <LinhaRespostaNoticia
                key={r.id}
                comentario={r}
                currentUserId={currentUserId}
                escopo={escopo}
                onResponder={onResponder}
                onEditado={onEditado}
                onExcluido={onExcluido}
              />
            ))}
          </ComentarioRespostasBloco>
        </div>
      </m.div>
    </div>
  )
}

export function NoticiasPracaFeedEngagement({
  alvoTipo,
  alvoId,
  escopo,
  href,
  gostei,
  naoGostei,
  meuVoto,
  totalComentarios,
  currentUser,
  publicadoEm,
}: {
  alvoTipo: 'NOTICIA' | 'ARTIGO'
  alvoId: string
  escopo: EscopoComunidade
  href: string
  gostei: number
  naoGostei: number
  meuVoto: VotoPraca
  totalComentarios: number
  currentUser: CurrentUser
  publicadoEm: string
}) {
  const [voto, setVoto] = useState<VotoPraca>(meuVoto)
  const [totalGostei, setTotalGostei] = useState(gostei)
  const [totalNao, setTotalNao] = useState(naoGostei)
  const [totalC, setTotalC] = useState(totalComentarios)
  const [comentarios, setComentarios] = useState<ForumRespostaFeedDto[]>([])
  const [abertos, setAbertos] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [respondendoA, setRespondendoA] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const operador = useModoOperador()
  const carregadasRef = useRef(false)
  const apoios = contagemExibidaVotoPraca(totalGostei, totalNao)

  const carregar = useCallback(async () => {
    if (carregadasRef.current) return
    setCarregando(true)
    setErro(null)
    try {
      const lista = await listarComentariosNoticiaFeed(alvoTipo, alvoId, escopo)
      setComentarios(lista)
      carregadasRef.current = true
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Não foi possível carregar os comentários.'
      setErro(mensagem)
      toast.error(mensagem)
    } finally {
      setCarregando(false)
    }
  }, [alvoId, alvoTipo, escopo])

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
      const r = await votarNoticiaFeed(alvoTipo, alvoId, novo, escopo)
      if ('error' in r) {
        setVoto(snapshot.voto)
        setTotalGostei(snapshot.gostei)
        setTotalNao(snapshot.nao)
        toast.error(r.error)
      }
    })
  }

  function abrirComentarios() {
    const next = !abertos
    setAbertos(next)
    if (next) void carregar()
  }

  const arvore = montarArvoreComentarios(comentarios)
  const respondendoComentario = respondendoA
    ? comentarios.find((c) => c.id === respondendoA) ?? null
    : null

  function cancelarResposta() {
    setRespondendoA(null)
    setTexto('')
  }

  function iniciarResposta(alvo: ForumRespostaFeedDto) {
    const nome = alvo.autor.nome?.trim() || 'Alguém'
    setRespondendoA(alvo.id)
    setTexto(`@${nome} `)
    setAbertos(true)
    void carregar()
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo || operador) return
    const parentId = respondendoA
    const tmp: ForumRespostaFeedDto = {
      id: `tmp-${Date.now()}`,
      conteudo,
      criadoEm: new Date().toISOString(),
      parentId,
      autor: currentUser,
    }
    setComentarios((prev) => [...prev, tmp])
    setTotalC((n) => n + 1)
    setTexto('')
    setRespondendoA(null)
    startTransition(async () => {
      const r = await comentarNoticiaFeed(alvoTipo, alvoId, conteudo, escopo, parentId ?? undefined)
      if ('error' in r) {
        setComentarios((prev) => prev.filter((x) => x.id !== tmp.id))
        setTotalC((n) => Math.max(0, n - 1))
        setTexto(conteudo)
        if (parentId) setRespondendoA(parentId)
        toast.error(r.error)
        return
      }
      setComentarios((prev) => prev.map((x) => (x.id === tmp.id ? r : x)))
    })
  }

  const btnBase =
    'inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-1 text-xs font-medium transition-colors disabled:opacity-50 sm:gap-1.5 sm:px-2 sm:py-1.5 sm:text-sm'
  const btnLabel = 'truncate @max-[26rem]:sr-only'
  const mostrarSecao = abertos || comentarios.length > 0 || carregando

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 pb-1 text-xs text-[rgb(var(--foreground-muted))]">
        <AnimatePresence>
          {totalC > 0 && (
            <m.div
              key="contagens"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={springSnappy}
            >
              <span>
                {totalC} {totalC === 1 ? 'comentário' : 'comentários'}
              </span>
            </m.div>
          )}
        </AnimatePresence>
        <time className="ml-auto shrink-0 tabular-nums">{publicadoEm}</time>
      </div>

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
            aria-label={voto === 1 ? 'Remover concordância' : 'Concordo com esta notícia'}
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
            aria-label={`${apoios} de saldo na notícia`}
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
            aria-label={voto === -1 ? 'Remover discordância' : 'Discordo desta notícia'}
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
          onClick={abrirComentarios}
          aria-expanded={abertos}
          aria-label={abertos ? 'Ocultar comentários' : 'Comentar'}
          className={[
            btnBase,
            abertos
              ? 'text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <MessageSquare className="h-4 w-4" />
          <span className={btnLabel}>{abertos ? 'Ocultar' : 'Comentar'}</span>
        </m.button>

        <ComunidadePrefetchLink
          href={href}
          aria-label="Abrir nas notícias"
          className={`${btnBase} shrink-0 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]`}
        >
          <Newspaper className="h-4 w-4" />
          <span className={btnLabel}>Notícias</span>
        </ComunidadePrefetchLink>
      </div>

      <AnimatePresence initial={false}>
        {mostrarSecao && (
          <m.div
            key="comentarios"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            className="mt-3 space-y-3 overflow-hidden"
          >
            {carregando && comentarios.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando comentários…
              </div>
            )}
            {!carregando && erro && comentarios.length === 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <span>{erro}</span>
                <AppButton
                  variant="none"
                  icon={RotateCcw}
                  type="button"
                  onClick={() => {
                    carregadasRef.current = false
                    void carregar()
                  }}
                  className="app-touch-target rounded-lg px-2 py-1 font-semibold text-[rgb(var(--color-primary))]"
                >
                  Tentar de novo
                </AppButton>
              </div>
            )}
            <m.div layout className="space-y-3">
              {arvore.map((no) => {
                const respostas = achatarRespostasDaArvore(no)
                const naThread = comentarioEstaNaThread(
                  no.comentario.id,
                  respostas.map((r) => r.id),
                  respondendoA,
                )
                return (
                  <LinhaComentarioNoticiaFeed
                    key={no.comentario.id}
                    no={no}
                    currentUserId={currentUser.id}
                    escopo={escopo}
                    onResponder={iniciarResposta}
                    respondendoA={respondendoA}
                    onEditado={(id, conteudo) => {
                      setComentarios((prev) =>
                        prev.map((item) => (item.id === id ? { ...item, conteudo } : item)),
                      )
                    }}
                    onExcluido={(id) => {
                      setComentarios((prev) =>
                        prev
                          .filter((item) => item.id !== id)
                          .map((item) => (item.parentId === id ? { ...item, parentId: null } : item)),
                      )
                      setTotalC((n) => Math.max(0, n - 1))
                      setRespondendoA((atual) => (atual === id ? null : atual))
                    }}
                    composer={
                      !operador && naThread && respondendoComentario ? (
                        <ComentarioComposerInline
                          valor={texto}
                          onChange={setTexto}
                          onSubmit={enviar}
                          onCancelar={cancelarResposta}
                          respondendoANome={respondendoComentario.autor.nome ?? 'Alguém'}
                          pending={pending}
                        />
                      ) : null
                    }
                  />
                )
              })}
            </m.div>
            {!operador && !respondendoA && (
              <form onSubmit={enviar} className="flex min-w-0 items-center gap-2">
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={2000}
                  placeholder="Comente nesta notícia…"
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
                  <span className="sr-only">Enviar comentário</span>
                </m.button>
              </form>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
