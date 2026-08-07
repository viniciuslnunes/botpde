'use client'

import { useCallback, useEffect, useRef, useState, startTransition } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { AnimatePresence, m } from 'motion/react'
import { MessageSquarePlus, MessagesSquare, Search, Users, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import { formatNomeTorcida } from '@torcida/types'
import {
  tituloConversa,
  type ContatoDto,
  type InboxItemDto,
} from '@/lib/mensageria-client'
import { formatRelative } from '@/lib/format-datetime'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import { useInboxStream } from '@/lib/use-mensagem-stream'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import {
  lightboxBackdrop,
  lightboxContent,
  menuItemStagger,
  springSnappy,
  staggerContainer,
  staggerItem,
} from '@/lib/motion-presets'
import { Avatar } from './avatar'

const MensagemThread = dynamic(
  () => import('./mensagem-thread').then((mod) => mod.MensagemThread),
  {
    loading: () => (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-[rgb(var(--background-subtle))]" />
      </div>
    ),
  },
)

interface MensagensShellProps {
  initialConversas: InboxItemDto[]
  initialSelecionadaId: string | null
  currentUserId: string
  variant?: 'full' | 'embedded'
  /** Pai já buscou a inbox (evita bootstrap duplicado no embed da comunidade). */
  inboxPreloaded?: boolean
  /** Quando false, pausa SSE/polling (painel colapsado). */
  active?: boolean
  onInboxChange?: (conversas: InboxItemDto[]) => void
}

type Modal = 'nenhum' | 'dm' | 'grupo'

export function MensagensShell({
  initialConversas,
  initialSelecionadaId,
  currentUserId,
  variant = 'full',
  inboxPreloaded = false,
  active = true,
  onInboxChange,
}: MensagensShellProps) {
  const embedded = variant === 'embedded'
  const [conversas, setConversas] = useState<InboxItemDto[]>(initialConversas)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(initialSelecionadaId)
  const [modal, setModal] = useState<Modal>('nenhum')
  const [carregando, setCarregando] = useState(!inboxPreloaded && initialConversas.length === 0)

  useEffect(() => {
    if (inboxPreloaded) {
      startTransition(() => {
        setConversas(initialConversas)
        setCarregando(false)
      })
      return
    }
    if (initialConversas.length > 0) {
      startTransition(() => {
        setConversas(initialConversas)
        setCarregando(false)
      })
    }
  }, [inboxPreloaded, initialConversas])

  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null

  const atualizarInbox = useCallback(async () => {
    try {
      const res = await fetch('/api/conversas', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { conversas?: InboxItemDto[] }
      if (data.conversas) {
        startTransition(() => {
          setConversas(data.conversas!)
          onInboxChange?.(data.conversas!)
          if (initialSelecionadaId && data.conversas!.some((c) => c.id === initialSelecionadaId)) {
            setSelecionadaId(initialSelecionadaId)
          }
        })
      }
    } catch {
      // polling silencioso
    } finally {
      startTransition(() => setCarregando(false))
    }
  }, [initialSelecionadaId, onInboxChange])

  useEffect(() => {
    if (inboxPreloaded || initialConversas.length > 0) return
    const timer = window.setTimeout(() => void atualizarInbox(), 0)
    return () => window.clearTimeout(timer)
  }, [inboxPreloaded, initialConversas.length, atualizarInbox])

  // SSE: atualiza inbox na hora; polling 60s só como fallback se o stream cair.
  useInboxStream(() => void atualizarInbox(), active)
  useVisibleInterval(() => void atualizarInbox(), 60_000, active)

  const zerarNaoLidas = useCallback((conversaId: string) => {
    setConversas((prev) =>
      prev.map((c) => (c.id === conversaId ? { ...c, naoLidas: 0 } : c)),
    )
  }, [])

  const removerDaLista = useCallback((conversaId: string) => {
    setConversas((prev) => prev.filter((c) => c.id !== conversaId))
    setSelecionadaId(null)
  }, [])

  async function abrirConversa(conversaId: string) {
    setSelecionadaId(conversaId)
    zerarNaoLidas(conversaId)
  }

  async function criadaNova(conversaId: string) {
    setModal('nenhum')
    await atualizarInbox()
    setSelecionadaId(conversaId)
  }

  return (
    <div
      className={[
        'flex overflow-hidden bg-[rgb(var(--surface))]',
        embedded
          ? 'h-[min(28rem,calc(100vh-12rem))] min-h-[16rem] rounded-xl border border-[rgb(var(--border))]'
          : 'h-[calc(100dvh-8.5rem)] min-h-[22rem] rounded-2xl border border-[rgb(var(--border))] sm:min-h-[24rem]',
      ].join(' ')}
    >
      {/* Coluna: inbox — classes de display exclusivas (nunca flex+hidden juntos). */}
      <div
        className={[
          embedded ? 'w-full' : 'w-full md:w-80 md:shrink-0',
          'flex-col border-r border-[rgb(var(--border))]',
          selecionada
            ? embedded
              ? 'hidden'
              : 'hidden md:flex'
            : 'flex',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-4 py-3">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Conversas</h2>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setModal('dm')}
              title="Nova conversa"
              aria-label="Nova conversa"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-primary-fg))]"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setModal('grupo')}
              title="Novo grupo"
              aria-label="Novo grupo"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-primary-fg))]"
            >
              <Users className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className={[
            'min-h-0 flex-1 overflow-y-auto',
            embedded ? 'app-scrollbar-none' : '',
          ].join(' ')}
        >
          {carregando ? (
            <div className="animate-pulse space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-[rgb(var(--border))]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-[rgb(var(--border))]" />
                    <div className="h-2 w-full rounded bg-[rgb(var(--border))]" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversas.length === 0 ? (
            <MotionEmptyState
              icon={<MessagesSquare className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
              title="Nenhuma conversa ainda"
              description={
                <>
                  <p className="mt-0.5">Comece uma conversa com um membro da torcida ou crie um grupo.</p>
                  <m.button
                    type="button"
                    onClick={() => setModal('dm')}
                    whileTap={{ scale: 0.96 }}
                    transition={springSnappy}
                    className="mt-4 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Nova conversa
                  </m.button>
                </>
              }
              className="flex flex-col items-center justify-center px-6 py-14 text-center"
            />
          ) : (
            <m.div variants={staggerContainer} initial="hidden" animate="show">
              {conversas.map((c) => {
                const titulo = tituloConversa(c)
                const avatarUrl =
                  c.tipo === 'DIRETA' ? c.outroMembro?.avatarUrl ?? null : c.avatarUrl
                return (
                  <m.button
                    key={c.id}
                    variants={staggerItem}
                    type="button"
                    onClick={() => void abrirConversa(c.id)}
                    whileTap={{ scale: 0.99 }}
                    transition={springSnappy}
                    className={[
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                      c.id === selecionadaId
                        ? 'bg-[rgb(var(--primary)_/_0.08)]'
                        : 'hover:bg-[rgb(var(--background-subtle))]',
                    ].join(' ')}
                  >
                  <Avatar
                    nome={titulo}
                    avatarUrl={avatarUrl}
                    size="md"
                    fit={c.tipo === 'DIRETA' ? 'cover' : 'contain'}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                        {titulo}
                      </p>
                      {c.ultimaMensagem && (
                        <span className="shrink-0 text-[11px] text-[rgb(var(--foreground-muted))]" suppressHydrationWarning>
                          {formatRelative(new Date(c.ultimaMensagem.criadoEm))}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                        {c.solicitacaoRecebida
                          ? 'Solicitação de mensagem'
                          : c.aguardandoAprovacao
                            ? 'Aguardando aprovação'
                            : c.ultimaMensagem
                          ? c.ultimaMensagem.removida
                            ? 'Mensagem removida'
                            : c.ultimaMensagem.conteudo || '📎 Anexo'
                          : c.tipo === 'GRUPO' || c.tipo === 'CANAL'
                            ? `${c.totalMembros} participantes`
                            : 'Conversa iniciada'}
                      </p>
                      {(c.naoLidas > 0 || c.solicitacaoRecebida) && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary))] px-1.5 text-[11px] font-bold text-[rgb(var(--color-primary-on))] ring-1 ring-inset ring-[rgb(var(--color-primary-fg)_/_0.35)]">
                          {c.solicitacaoRecebida ? '!' : c.naoLidas > 99 ? '99+' : c.naoLidas}
                        </span>
                      )}
                    </div>
                  </div>
                  </m.button>
                )
              })}
            </m.div>
          )}
        </div>
      </div>

      {/* Coluna: thread — display exclusivo; min-h-0 para o h-full da thread. */}
      <div
        className={[
          'min-h-0 min-w-0 flex-1 flex-col',
          selecionada ? 'flex' : embedded ? 'hidden' : 'hidden md:flex',
        ].join(' ')}
      >
        {selecionada ? (
          <MensagemThread
            key={selecionada.id}
            conversa={selecionada}
            currentUserId={currentUserId}
            onBack={() => setSelecionadaId(null)}
            onLida={zerarNaoLidas}
            onSaiu={removerDaLista}
            showBackButton={embedded}
            hideScrollbar={embedded}
            active={active}
            onMensagemEnviada={(preview) => {
              setConversas((prev) => {
                const next = prev.map((c) =>
                  c.id === selecionada.id
                    ? {
                        ...c,
                        atualizadoEm: preview.criadoEm,
                        ultimaMensagem: {
                          conteudo: preview.conteudo || '📎 Anexo',
                          autorNome: 'Você',
                          criadoEm: preview.criadoEm,
                          removida: false,
                        },
                        naoLidas: 0,
                      }
                    : c,
                )
                return [...next].sort(
                  (a, b) =>
                    new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime(),
                )
              })
            }}
            onSolicitacaoResolvida={() => void atualizarInbox()}
            onAvatarChange={(conversaId, avatarUrl) => {
              setConversas((prev) =>
                prev.map((c) => (c.id === conversaId ? { ...c, avatarUrl } : c)),
              )
            }}
          />
        ) : (
          !embedded && (
            <MotionEmptyState
              icon={<MessagesSquare className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
              title="Selecione uma conversa"
              description="Ou comece uma nova com um membro da torcida."
              className="hidden h-full flex-col items-center justify-center px-6 text-center md:flex"
            />
          )
        )}
      </div>

      <AnimatePresence>
        {modal !== 'nenhum' && (
          <NovaConversaModal
            key={modal}
            tipo={modal}
            onClose={() => setModal('nenhum')}
            onCriada={criadaNova}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function NovaConversaModal({
  tipo,
  onClose,
  onCriada,
}: {
  tipo: 'dm' | 'grupo'
  onClose: () => void
  onCriada: (conversaId: string) => void
}) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ContatoDto[]>([])
  const [buscando, setBuscando] = useState(false)
  const [nome, setNome] = useState('')
  const [selecionados, setSelecionados] = useState<ContatoDto[]>([])
  const [contatoDm, setContatoDm] = useState<ContatoDto | null>(null)
  const [mensagemInicial, setMensagemInicial] = useState('')
  const [criando, setCriando] = useState(false)
  const [mounted, setMounted] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(async () => {
      setBuscando(true)
      try {
        const para = tipo === 'grupo' ? '&para=grupo' : ''
        const res = await fetch(`/api/conversas/contatos?q=${encodeURIComponent(busca)}${para}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = (await res.json()) as { contatos?: ContatoDto[] }
        setResultados(data.contatos ?? [])
      } finally {
        setBuscando(false)
      }
    }, 300)
    return () => window.clearTimeout(id)
  }, [busca, tipo])

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  async function criarDm(payload: {
    destinatarioId: string
    conteudo?: string
  }) {
    setCriando(true)
    try {
      const res = await fetch('/api/conversas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'DIRETA', ...payload }),
      })
      const data = (await res.json()) as {
        conversaId?: string
        error?: string
        precisaMensagem?: boolean
        solicitacao?: boolean
      }
      if (!res.ok || !data.conversaId) {
        if (data.precisaMensagem) {
          setContatoDm(
            resultados.find((c) => c.id === payload.destinatarioId) ?? contatoDm ?? null,
          )
          return
        }
        throw new Error(data.error ?? 'Erro ao criar conversa.')
      }
      if (data.solicitacao) {
        toast.success('Solicitação enviada. Aguarde a aprovação do membro.')
      }
      onCriada(data.conversaId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar conversa.')
    } finally {
      setCriando(false)
    }
  }

  async function criarGrupo() {
    setCriando(true)
    try {
      const res = await fetch('/api/conversas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'GRUPO',
          nome: nome.trim(),
          membroIds: selecionados.map((c) => c.id),
        }),
      })
      const data = (await res.json()) as { conversaId?: string; error?: string }
      if (!res.ok || !data.conversaId) throw new Error(data.error ?? 'Erro ao criar grupo.')
      onCriada(data.conversaId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar grupo.')
    } finally {
      setCriando(false)
    }
  }

  function escolher(contato: ContatoDto) {
    if (tipo === 'dm') {
      if (contato.requerSolicitacao) {
        setContatoDm(contato)
        setMensagemInicial('')
        return
      }
      void criarDm({ destinatarioId: contato.id })
      return
    }
    setSelecionados((prev) =>
      prev.some((c) => c.id === contato.id) ? prev : [...prev, contato],
    )
  }

  const idsSelecionados = new Set(selecionados.map((c) => c.id))

  if (!mounted) return null

  // Portal em document.body: o painel de mensagens fica numa coluna sem z-index
  // enquanto a busca sticky do feed usa z-20 — fixed+z-50 no painel perde o stacking.
  return createPortal(
    <m.div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={tipo === 'dm' ? 'Nova conversa' : 'Novo grupo'}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
      initial="hidden"
      animate="show"
      exit="exit"
      variants={lightboxBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <m.div
        variants={lightboxContent}
        initial="hidden"
        animate="show"
        exit="exit"
        transition={springSnappy}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            {tipo === 'dm' && contatoDm ? 'Solicitar conversa' : tipo === 'dm' ? 'Nova conversa' : 'Novo grupo'}
          </h3>
          <button
            type="button"
            onClick={() => {
              if (contatoDm) {
                setContatoDm(null)
                setMensagemInicial('')
                return
              }
              onClose()
            }}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {tipo === 'dm' && contatoDm ? (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2.5">
                <Avatar nome={contatoDm.nome} avatarUrl={contatoDm.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                    {contatoDm.nome ?? 'Membro'}
                  </p>
                  <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                    {formatNomeTorcida(contatoDm.tenantNome)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Envie uma mensagem inicial. O membro precisa aprovar antes da conversa continuar.
              </p>
              <textarea
                value={mensagemInicial}
                onChange={(e) => setMensagemInicial(e.target.value)}
                autoFocus
                maxLength={2000}
                rows={4}
                placeholder="Olá! Gostaria de conversar com você…"
                className="w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2.5 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
              />
              <button
                type="button"
                disabled={criando || mensagemInicial.trim().length === 0}
                onClick={() =>
                  void criarDm({
                    destinatarioId: contatoDm.id,
                    conteudo: mensagemInicial.trim(),
                  })
                }
                className="w-full rounded-xl bg-[rgb(var(--primary))] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {criando ? 'Enviando…' : 'Enviar solicitação'}
              </button>
            </>
          ) : (
            <>
          {tipo === 'grupo' && (
            <>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={60}
                placeholder="Nome do grupo"
                className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3.5 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
              />
              {selecionados.length > 0 && (
                <m.div layout className="flex flex-wrap gap-1.5">
                  <AnimatePresence mode="popLayout">
                    {selecionados.map((c) => (
                      <m.span
                        key={c.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={springSnappy}
                        className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--color-primary)_/_0.14)] px-2.5 py-1 text-xs font-medium text-[rgb(var(--color-primary-fg))]"
                      >
                        {c.nome ?? 'Membro'}
                        <button
                          type="button"
                          aria-label={`Remover ${c.nome ?? 'membro'}`}
                          onClick={() =>
                            setSelecionados((prev) => prev.filter((x) => x.id !== c.id))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </m.span>
                    ))}
                  </AnimatePresence>
                </m.div>
              )}
            </>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
              placeholder={
                tipo === 'grupo'
                  ? 'Buscar na rede ou na torcida'
                  : 'Buscar membro pelo nome'
              }
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            />
          </div>
          {tipo === 'grupo' && (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Sócios fora da sua rede ou torcida não entram em grupos — use DM com
              solicitação.
            </p>
          )}
            </>
          )}
        </div>

        {!(tipo === 'dm' && contatoDm) && (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {buscando && resultados.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Buscando…
            </p>
          ) : resultados.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
              {tipo === 'grupo'
                ? busca.trim()
                  ? 'Ninguém na sua rede ou torcida com esse nome.'
                  : 'Só entram pessoas da sua rede de conexão ou associadas à sua torcida.'
                : 'Nenhum membro encontrado.'}
            </p>
          ) : (
            <m.div variants={staggerContainer} initial="hidden" animate="show">
              {resultados.map((c, i) => (
                <m.button
                  key={c.id}
                  custom={i}
                  variants={menuItemStagger}
                  type="button"
                  disabled={criando || idsSelecionados.has(c.id)}
                  onClick={() => escolher(c)}
                  whileTap={{ scale: 0.99 }}
                  transition={springSnappy}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                >
                <Avatar nome={c.nome} avatarUrl={c.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-[rgb(var(--foreground))]">
                  {c.nome ?? 'Membro'}
                </span>
                {!c.mesmoTenant && (
                  <span className="shrink-0 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    {formatNomeTorcida(c.tenantNome)}
                  </span>
                )}
              </m.button>
              ))}
            </m.div>
          )}
        </div>
        )}

        {tipo === 'grupo' && (
          <div className="border-t border-[rgb(var(--border))] p-4">
            <m.button
              type="button"
              disabled={criando || nome.trim().length < 3 || selecionados.length === 0}
              whileTap={{ scale: 0.98 }}
              transition={springSnappy}
              onClick={() => void criarGrupo()}
              className="w-full rounded-xl bg-[rgb(var(--primary))] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {criando ? 'Criando…' : `Criar grupo (${selecionados.length + 1} participantes)`}
            </m.button>
          </div>
        )}
      </m.div>
    </m.div>,
    document.body,
  )
}
