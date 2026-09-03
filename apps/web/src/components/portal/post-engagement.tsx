'use client'

import { useCallback, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Bookmark, Flag, Heart, Loader2, MessageCircle, Repeat2, RotateCcw, Send, X } from 'lucide-react'
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
import { AVISO_MODO_OPERADOR, useModoOperador } from '@/lib/modo-operador'
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
import { AppButton } from '@/components/ui/button'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'
import {
  achatarRespostasDaArvore,
  contarRespostasNaArvore,
  montarArvoreComentarios,
  type NoComentario,
} from '@/lib/comentario-thread'
import {
  ComentarioRespostasBloco,
  comentarioEstaNaThread,
} from '@/components/portal/comentario-respostas-bloco'

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
  /** Sócio com community:post. Torcedor só curte/comenta/salva. */
  podeCompartilhar?: boolean
  /** Data/hora formatada no servidor (fuso SP). */
  publicadoEm: string
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
  /** Transição usada ao ativar (default: bounce genérico `reactionPop`).
   * Com 3+ keyframes em `activeAnimate`, precisa ser tween — spring só aceita 2. */
  activeTransition?: Transition
  /** Keyframes de ativação (default: `scale: [1, 1.08, 1]`). */
  activeAnimate?: TargetAndTransition
  title?: string
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

function BotaoResponderComentario({
  onClick,
}: {
  onClick: () => void
}) {
  return (
    <AppButton
      variant="none"
      icon={MessageCircle}
      type="button"
      onClick={onClick}
      className="app-touch-line inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
    >
      Responder
    </AppButton>
  )
}

/** Composer de resposta no post — mantém @menções do campo inferior. */
function ComposerRespostaPost({
  valor,
  onChange,
  onKeyUp,
  onSubmit,
  onCancelar,
  respondendoANome,
  pending,
  mencaoQuery,
  onSelectMencao,
  onCloseMencao,
  inputRef,
  campoRef,
}: {
  valor: string
  onChange: (value: string, caret?: number) => void
  onKeyUp: (caret: number) => void
  onSubmit: (e: FormEvent) => void
  onCancelar: () => void
  respondendoANome: string
  pending: boolean
  mencaoQuery: string | null
  onSelectMencao: (m: MencaoSelecionada) => void
  onCloseMencao: () => void
  inputRef: RefObject<HTMLInputElement | null>
  campoRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] p-2.5"
    >
      <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-[rgb(var(--foreground-muted))]">
        <span>
          Respondendo a{' '}
          <span className="font-semibold text-[rgb(var(--foreground))]">{respondendoANome}</span>
        </span>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cancelar resposta"
          className="app-touch-target inline-flex rounded-lg p-1 hover:bg-[rgb(var(--surface))]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <div ref={campoRef} className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={valor}
            onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? undefined)}
            onKeyUp={(e) => onKeyUp(e.currentTarget.selectionStart ?? 0)}
            maxLength={500}
            placeholder="Escreva sua resposta… use @ para mencionar"
            autoFocus
            className="min-h-11 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-base text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))] sm:h-9 sm:py-0 sm:text-sm"
          />
          {mencaoQuery !== null && (
            <MentionPicker
              query={mencaoQuery}
              onSelect={onSelectMencao}
              onClose={onCloseMencao}
              anchorRef={campoRef}
            />
          )}
        </div>
        <m.button
          type="submit"
          disabled={pending || !valor.trim()}
          whileTap={{ scale: 0.9 }}
          transition={springSnappy}
          aria-label="Enviar resposta"
          className="app-action shrink-0 rounded-lg bg-[rgb(var(--color-primary))] px-3 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </m.button>
      </div>
    </form>
  )
}

function LinhaRespostaPost({
  comentario,
  currentUser,
  onResponder,
  onEditado,
  onExcluido,
}: {
  comentario: ComentarioPostItem
  currentUser: CurrentUser
  onResponder: (c: ComentarioPostItem) => void
  onEditado: (id: string, conteudo: string) => void
  onExcluido: (id: string) => void
}) {
  const proprio = comentario.autor.id === currentUser.id
  const autorLabel = proprio ? 'Você' : (comentario.autor.nome ?? 'Membro')
  const persistido = !comentario.id.startsWith('tmp-')
  const conteudo = (
    <PostConteudoRich conteudo={comentario.conteudo} className="text-sm text-[rgb(var(--foreground))]" />
  )

  return (
    <div className="flex items-start gap-2.5 py-2.5 pr-3">
      <ComunidadePrefetchLink
        href={`/portal/comunidade/perfil/${comentario.autor.id}`}
        className="shrink-0"
      >
        <Avatar nome={comentario.autor.nome} avatarUrl={comentario.autor.avatarUrl} size="xs" />
      </ComunidadePrefetchLink>
      <div className="min-w-0 flex-1">
        {proprio && persistido ? (
          <ComentarioMenu
            comentarioId={comentario.id}
            conteudoInicial={comentario.conteudo}
            autorLabel={autorLabel}
            onEditado={(next) => onEditado(comentario.id, next)}
            onExcluido={() => onExcluido(comentario.id)}
          >
            {conteudo}
          </ComentarioMenu>
        ) : (
          <>
            <ComunidadePrefetchLink
              href={`/portal/comunidade/perfil/${comentario.autor.id}`}
              className="app-sem-piso-toque text-xs font-semibold text-[rgb(var(--foreground))] hover:text-[rgb(var(--color-primary-fg))]"
            >
              {autorLabel}
            </ComunidadePrefetchLink>
            {conteudo}
          </>
        )}
        {persistido ? (
          <BotaoResponderComentario onClick={() => onResponder(comentario)} />
        ) : null}
      </div>
    </div>
  )
}

function LinhaComentarioPost({
  no,
  currentUser,
  onResponder,
  onEditado,
  onExcluido,
  index,
  respondendoA,
  composer,
}: {
  no: NoComentario<ComentarioPostItem>
  currentUser: CurrentUser
  onResponder: (c: ComentarioPostItem) => void
  onEditado: (id: string, conteudo: string) => void
  onExcluido: (id: string) => void
  index: number
  respondendoA: string | null
  composer: ReactNode
}) {
  const comentario = no.comentario
  const proprio = comentario.autor.id === currentUser.id
  const autorLabel = proprio ? 'Você' : (comentario.autor.nome ?? 'Membro')
  const persistido = !comentario.id.startsWith('tmp-')
  const totalRespostas = contarRespostasNaArvore(no)
  const respostas = achatarRespostasDaArvore(no)
  const naThread = comentarioEstaNaThread(
    comentario.id,
    respostas.map((r) => r.id),
    respondendoA,
  )
  const conteudo = (
    <PostConteudoRich conteudo={comentario.conteudo} className="text-sm text-[rgb(var(--foreground))]" />
  )

  return (
    <div>
      <m.div
        custom={index}
        variants={menuItemStagger}
        className="flex items-start gap-2"
      >
        <ComunidadePrefetchLink
          href={`/portal/comunidade/perfil/${comentario.autor.id}`}
          className="shrink-0"
        >
          <Avatar nome={comentario.autor.nome} avatarUrl={comentario.autor.avatarUrl} size="xs" />
        </ComunidadePrefetchLink>
        <div className="min-w-0 flex-1">
          {proprio && persistido ? (
            <ComentarioMenu
              comentarioId={comentario.id}
              conteudoInicial={comentario.conteudo}
              autorLabel={autorLabel}
              onEditado={(next) => onEditado(comentario.id, next)}
              onExcluido={() => onExcluido(comentario.id)}
            >
              {conteudo}
            </ComentarioMenu>
          ) : (
            <div className="rounded-2xl bg-[rgb(var(--background-subtle))] px-3 py-2">
              <ComunidadePrefetchLink
                href={`/portal/comunidade/perfil/${comentario.autor.id}`}
                className="app-sem-piso-toque text-xs font-semibold text-[rgb(var(--foreground))] hover:text-[rgb(var(--color-primary-fg))]"
              >
                {autorLabel}
              </ComunidadePrefetchLink>
              {conteudo}
            </div>
          )}
          <ComentarioRespostasBloco
            total={totalRespostas}
            forcarAberto={naThread}
            acaoResponder={
              persistido ? (
                <BotaoResponderComentario onClick={() => onResponder(comentario)} />
              ) : null
            }
            composer={composer}
          >
            {respostas.map((r) => (
              <LinhaRespostaPost
                key={r.id}
                comentario={r}
                currentUser={currentUser}
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

export function PostEngagement({
  postId,
  totalReacoes,
  totalComentarios,
  minhaReacao,
  currentUser,
  isAuthor = false,
  isRepost = false,
  salvoInicial = false,
  podeCompartilhar = true,
  publicadoEm,
}: PostEngagementProps) {
  const [reacao, setReacao] = useState<TipoReacaoSocial | null>(minhaReacao)
  const [salvo, setSalvo] = useState(salvoInicial)
  const [mencaoQuery, setMencaoQuery] = useState<string | null>(null)
  const [totalR, setTotalR] = useState(totalReacoes)
  const [totalC, setTotalC] = useState(totalComentarios)
  const [comentarios, setComentarios] = useState<ComentarioPostItem[]>([])
  const [comentariosAbertos, setComentariosAbertos] = useState(false)
  const [carregandoComentarios, setCarregandoComentarios] = useState(false)
  // Falha da leitura fica na própria seção (com "Tentar de novo") — o toast
  // some em segundos e o usuário ficava olhando um spinner sem explicação.
  const [erroComentarios, setErroComentarios] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')
  const [mencoesComentario, setMencoesComentario] = useState<MencaoParsed[]>([])
  const [respondendoA, setRespondendoA] = useState<string | null>(null)
  const [denunciando, setDenunciando] = useState(false)
  const [denunciado, setDenunciado] = useState(false)
  const [repostando, setRepostando] = useState(false)
  const [compartilhado, setCompartilhado] = useState(false)
  const [justLiked, setJustLiked] = useState(false)
  const [comentarioRepost, setComentarioRepost] = useState('')
  const [motivo, setMotivo] = useState('')
  const [pending, startTransition] = useTransition()
  // Operador (super-admin sem vínculo) lê o post e não engaja — o servidor já
  // recusa; aqui só evitamos o clique que vira erro.
  const operador = useModoOperador()
  const inputRef = useRef<HTMLInputElement>(null)
  const comentarioCampoRef = useRef<HTMLDivElement>(null)
  const comentariosCarregadosRef = useRef(false)

  const arvoreComentarios = useMemo(() => montarArvoreComentarios(comentarios), [comentarios])

  const respondendoComentario = respondendoA
    ? comentarios.find((c) => c.id === respondendoA) ?? null
    : null

  function cancelarResposta() {
    setRespondendoA(null)
    setComentario('')
    setMencoesComentario([])
    setMencaoQuery(null)
  }

  function iniciarResposta(alvo: ComentarioPostItem) {
    const nome = alvo.autor.nome?.trim() || 'Membro'
    const prefixo = `@${nome} `
    setRespondendoA(alvo.id)
    setComentario(prefixo)
    setMencoesComentario([{ nome, userId: alvo.autor.id }])
    setMencaoQuery(null)
    setComentariosAbertos(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      const el = inputRef.current
      if (el) el.selectionStart = el.selectionEnd = prefixo.length
    })
  }

  const carregarComentarios = useCallback(async () => {
    if (comentariosCarregadosRef.current) return
    setCarregandoComentarios(true)
    setErroComentarios(null)
    try {
      const lista = await listarComentariosPost(postId)
      setComentarios(lista)
      comentariosCarregadosRef.current = true
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Não foi possível carregar comentários.'
      setErroComentarios(mensagem)
      toast.error(mensagem)
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
    const parentId = respondendoA
    const tempId = `tmp-${Date.now()}`
    const otimista: ComentarioPostItem = {
      id: tempId,
      conteudo: persistido,
      criadoEm: new Date().toISOString(),
      parentId,
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
    setRespondendoA(null)
    setComentariosAbertos(true)
    startTransition(async () => {
      try {
        const salvoComentario = await comentarPost(postId, persistido, parentId ?? undefined)
        setComentarios((prev) => prev.map((c) => (c.id === tempId ? salvoComentario : c)))
        comentariosCarregadosRef.current = true
      } catch (err) {
        setComentarios((prev) => prev.filter((c) => c.id !== tempId))
        setTotalC((n) => Math.max(0, n - 1))
        const { texto, mencoes } = paraTextoLegivel(persistido)
        setComentario(texto)
        setMencoesComentario(mencoes)
        if (parentId) setRespondendoA(parentId)
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
    'inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-1 text-xs font-medium transition-colors disabled:opacity-50 sm:gap-1.5 sm:px-2 sm:py-1.5 sm:text-sm'
  const btnAcao = `${btnBase} flex-1 @[26rem]:flex-none`
  const btnLabel = 'truncate @max-[26rem]:sr-only'

  const mostrarSecaoComentarios =
    comentariosAbertos || comentarios.length > 0 || carregandoComentarios

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 pb-1 text-xs text-[rgb(var(--foreground-muted))]">
        <AnimatePresence>
          {(totalR > 0 || totalC > 0) && (
            <m.div
              key="contagens"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={springSnappy}
              className="flex min-w-0 items-center gap-3"
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
        <time className="ml-auto shrink-0 tabular-nums">{publicadoEm}</time>
      </div>

      <div className="flex items-center gap-0.5 border-t border-[rgb(var(--border))] pt-1.5">
        <div className="flex min-w-0 flex-1 items-center">
          <EngajamentoBtn
          disabled={pending || operador}
          title={operador ? AVISO_MODO_OPERADOR : undefined}
          active={reacao === 'CURTIR'}
          onClick={() => handleReacao('CURTIR')}
          aria-pressed={reacao === 'CURTIR'}
          aria-label={reacao === 'CURTIR' ? 'Curtido' : 'Curtir'}
          className={[
            btnAcao,
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
          <span className={btnLabel}>{reacao === 'CURTIR' ? 'Curtido' : 'Curtir'}</span>
        </EngajamentoBtn>
        <EngajamentoBtn
          active={comentariosAbertos}
          onClick={abrirComentarios}
          aria-expanded={comentariosAbertos}
          aria-label={comentariosAbertos ? 'Ocultar comentários' : 'Ver comentários'}
          className={[
            btnAcao,
            comentariosAbertos
              ? 'text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <MessageCircle className="h-4 w-4" />
          <span className={btnLabel}>{comentariosAbertos ? 'Ocultar' : 'Comentar'}</span>
        </EngajamentoBtn>
        {!isRepost && podeCompartilhar && !operador && (
          <EngajamentoBtn
            active={repostando || compartilhado}
            onClick={() => setRepostando((v) => !v)}
            aria-pressed={compartilhado}
            aria-label={compartilhado ? 'Compartilhado' : 'Compartilhar'}
            className={[
              btnAcao,
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
            <span className={btnLabel}>{compartilhado ? 'Compartilhado' : 'Compartilhar'}</span>
          </EngajamentoBtn>
        )}
        <EngajamentoBtn
          active={salvo}
          disabled={operador}
          title={operador ? AVISO_MODO_OPERADOR : undefined}
          activeTransition={bookmarkDrop}
          activeAnimate={{ scale: [1, 1.15, 1], y: [0, -3, 0] }}
          onClick={toggleSalvar}
          aria-pressed={salvo}
          aria-label={salvo ? 'Salvo' : 'Salvar'}
          className={[
            btnAcao,
            salvo
              ? 'text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
          ].join(' ')}
        >
          <Bookmark className={['h-4 w-4', salvo ? 'fill-current' : ''].join(' ')} />
          <span className={btnLabel}>{salvo ? 'Salvo' : 'Salvar'}</span>
        </EngajamentoBtn>
        </div>
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
              'shrink-0',
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
        {repostando && podeCompartilhar && (
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

            {!carregandoComentarios && erroComentarios && comentarios.length === 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <span>{erroComentarios}</span>
                <AppButton
                  variant="none"
                  icon={RotateCcw}
                  type="button"
                  onClick={() => void carregarComentarios()}
                  className="app-touch-target rounded-lg px-2 py-1 font-semibold text-[rgb(var(--color-primary))] hover:bg-[rgb(var(--background-subtle))]"
                >
                  Tentar de novo
                </AppButton>
              </div>
            )}

            <m.div
              layout
              className="space-y-3"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}
              initial="hidden"
              animate="show"
            >
              {arvoreComentarios.map((no, i) => {
                const flat = achatarRespostasDaArvore(no)
                const naThread = comentarioEstaNaThread(
                  no.comentario.id,
                  flat.map((r) => r.id),
                  respondendoA,
                )
                return (
                  <LinhaComentarioPost
                    key={no.comentario.id}
                    no={no}
                    currentUser={currentUser}
                    onResponder={iniciarResposta}
                    respondendoA={respondendoA}
                    composer={
                      !operador && naThread && respondendoComentario ? (
                        <ComposerRespostaPost
                          valor={comentario}
                          onChange={handleComentarioChange}
                          onKeyUp={(caret) => handleComentarioChange(comentario, caret)}
                          onSubmit={enviarComentario}
                          onCancelar={cancelarResposta}
                          respondendoANome={respondendoComentario.autor.nome ?? 'Membro'}
                          pending={pending}
                          mencaoQuery={mencaoQuery}
                          onSelectMencao={inserirMencaoComentario}
                          onCloseMencao={() => setMencaoQuery(null)}
                          inputRef={inputRef}
                          campoRef={comentarioCampoRef}
                        />
                      ) : null
                    }
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
                    index={i}
                  />
                )
              })}
            </m.div>

            {comentariosAbertos && operador && (
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                {AVISO_MODO_OPERADOR}
              </p>
            )}

            {comentariosAbertos && !operador && !respondendoA && (
              <form onSubmit={enviarComentario} className="flex items-center gap-2">
                <Avatar nome={currentUser.nome} avatarUrl={currentUser.avatarUrl} size="xs" />
                <div ref={comentarioCampoRef} className="relative min-w-0 flex-1">
                  <input
                    ref={inputRef}
                    value={comentario}
                    onChange={(e) =>
                      handleComentarioChange(e.target.value, e.target.selectionStart ?? undefined)
                    }
                    onKeyUp={(e) =>
                      handleComentarioChange(comentario, e.currentTarget.selectionStart ?? undefined)
                    }
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
