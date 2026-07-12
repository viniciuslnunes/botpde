'use client'

import { useCallback, useEffect, useRef, useState, startTransition } from 'react'
import dynamic from 'next/dynamic'
import { MessageSquarePlus, MessagesSquare, Search, Users, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  tituloConversa,
  type ContatoDto,
  type InboxItemDto,
} from '@/lib/mensageria-client'
import { formatRelative } from '@/lib/format-datetime'
import { useVisibleInterval } from '@/lib/use-visible-interval'
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
}

type Modal = 'nenhum' | 'dm' | 'grupo'

export function MensagensShell({
  initialConversas,
  initialSelecionadaId,
  currentUserId,
  variant = 'full',
}: MensagensShellProps) {
  const embedded = variant === 'embedded'
  const [conversas, setConversas] = useState<InboxItemDto[]>(initialConversas)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(initialSelecionadaId)
  const [modal, setModal] = useState<Modal>('nenhum')
  const [carregando, setCarregando] = useState(initialConversas.length === 0)

  useEffect(() => {
    if (initialConversas.length > 0) {
      startTransition(() => {
        setConversas(initialConversas)
        setCarregando(false)
      })
    }
  }, [initialConversas])

  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null

  const atualizarInbox = useCallback(async () => {
    try {
      const res = await fetch('/api/conversas', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { conversas?: InboxItemDto[] }
      if (data.conversas) {
        startTransition(() => {
          setConversas(data.conversas!)
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
  }, [initialSelecionadaId])

  useEffect(() => {
    if (initialConversas.length === 0) {
      const timer = window.setTimeout(() => void atualizarInbox(), 0)
      return () => window.clearTimeout(timer)
    }
  }, [initialConversas.length, atualizarInbox])

  useVisibleInterval(() => void atualizarInbox(), 15000)

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
          : 'h-[calc(100vh-8.5rem)] min-h-[24rem] rounded-2xl border border-[rgb(var(--border))]',
      ].join(' ')}
    >
      {/* Coluna: inbox */}
      <div
        className={[
          embedded ? 'w-full' : 'w-full md:w-80 md:shrink-0',
          'flex-col border-r border-[rgb(var(--border))]',
          embedded ? 'flex' : 'md:flex',
          selecionada ? (embedded ? 'hidden' : 'hidden md:flex') : 'flex',
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
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--primary))]"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setModal('grupo')}
              title="Novo grupo"
              aria-label="Novo grupo"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--primary))]"
            >
              <Users className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
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
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <MessagesSquare className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
              <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
                Nenhuma conversa ainda
              </p>
              <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                Comece uma conversa com um membro da torcida ou crie um grupo.
              </p>
              <button
                type="button"
                onClick={() => setModal('dm')}
                className="mt-4 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Nova conversa
              </button>
            </div>
          ) : (
            conversas.map((c) => {
              const titulo = tituloConversa(c)
              const avatarUrl =
                c.tipo === 'DIRETA' ? c.outroMembro?.avatarUrl ?? null : c.avatarUrl
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void abrirConversa(c.id)}
                  className={[
                    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                    c.id === selecionadaId
                      ? 'bg-[rgb(var(--primary)_/_0.08)]'
                      : 'hover:bg-[rgb(var(--background-subtle))]',
                  ].join(' ')}
                >
                  <Avatar nome={titulo} avatarUrl={avatarUrl} size="md" />
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
                        {c.ultimaMensagem
                          ? c.ultimaMensagem.removida
                            ? 'Mensagem removida'
                            : c.ultimaMensagem.conteudo || '📎 Anexo'
                          : c.tipo === 'GRUPO' || c.tipo === 'CANAL'
                            ? `${c.totalMembros} participantes`
                            : 'Conversa iniciada'}
                      </p>
                      {c.naoLidas > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary))] px-1.5 text-[11px] font-bold text-white">
                          {c.naoLidas > 99 ? '99+' : c.naoLidas}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Coluna: thread */}
      <div
        className={[
          'min-w-0 flex-1 flex-col',
          embedded ? 'flex' : 'md:flex',
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
          />
        ) : (
          !embedded && (
            <div className="hidden h-full flex-col items-center justify-center px-6 text-center md:flex">
              <MessagesSquare className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
              <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
                Selecione uma conversa
              </p>
              <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                Ou comece uma nova com um membro da torcida.
              </p>
            </div>
          )
        )}
      </div>

      {modal !== 'nenhum' && (
        <NovaConversaModal
          tipo={modal}
          onClose={() => setModal('nenhum')}
          onCriada={criadaNova}
        />
      )}
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
  const [criando, setCriando] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = window.setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/conversas/contatos?q=${encodeURIComponent(busca)}`, {
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
  }, [busca])

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  async function criar(payload: unknown) {
    setCriando(true)
    try {
      const res = await fetch('/api/conversas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { conversaId?: string; error?: string }
      if (!res.ok || !data.conversaId) throw new Error(data.error ?? 'Erro ao criar conversa.')
      onCriada(data.conversaId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar conversa.')
    } finally {
      setCriando(false)
    }
  }

  function escolher(contato: ContatoDto) {
    if (tipo === 'dm') {
      void criar({ tipo: 'DIRETA', destinatarioId: contato.id })
      return
    }
    setSelecionados((prev) =>
      prev.some((c) => c.id === contato.id) ? prev : [...prev, contato],
    )
  }

  const idsSelecionados = new Set(selecionados.map((c) => c.id))

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={tipo === 'dm' ? 'Nova conversa' : 'Novo grupo'}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-xl">
        <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
          <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            {tipo === 'dm' ? 'Nova conversa' : 'Novo grupo'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
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
                <div className="flex flex-wrap gap-1.5">
                  {selecionados.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2.5 py-1 text-xs font-medium text-[rgb(var(--primary))]"
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
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
              placeholder="Buscar membro pelo nome"
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {buscando && resultados.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Buscando…
            </p>
          ) : resultados.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhum membro encontrado.
            </p>
          ) : (
            resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={criando || idsSelecionados.has(c.id)}
                onClick={() => escolher(c)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
              >
                <Avatar nome={c.nome} avatarUrl={c.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-[rgb(var(--foreground))]">
                  {c.nome ?? 'Membro'}
                </span>
                {!c.mesmoTenant && (
                  <span className="shrink-0 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    {c.tenantNome}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {tipo === 'grupo' && (
          <div className="border-t border-[rgb(var(--border))] p-4">
            <button
              type="button"
              disabled={criando || nome.trim().length < 3 || selecionados.length === 0}
              onClick={() =>
                void criar({
                  tipo: 'GRUPO',
                  nome: nome.trim(),
                  membroIds: selecionados.map((c) => c.id),
                })
              }
              className="w-full rounded-xl bg-[rgb(var(--primary))] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {criando ? 'Criando…' : `Criar grupo (${selecionados.length + 1} participantes)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
