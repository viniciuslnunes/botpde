'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { BarChart3, CheckCircle2, Loader2, Plus, X } from 'lucide-react'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import { toast } from '@torcida/ui'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { useConfirmAction } from '@/lib/confirm-action'
import { collapsePanel, springGentle, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

type VotanteEnquete = {
  userId: string
  nome: string | null
  avatarUrl: string | null
}

export type EnqueteSala = {
  id: string
  pergunta: string
  encerradaEm: string | null
  criadoEm: string
  meuVotoOpcaoId: string | null
  totalVotos: number
  opcoes: {
    id: string
    texto: string
    votos: number
    percentual: number
    votantes: VotanteEnquete[]
  }[]
}

interface SalaEnqueteProps {
  salaId: string
  isHost: boolean
}

function InicialAvatar({ nome }: { nome: string | null }) {
  return <>{(nome?.trim()?.[0] ?? '?').toUpperCase()}</>
}

export function SalaEnquete({ salaId, isHost }: SalaEnqueteProps) {
  const confirmAction = useConfirmAction()
  const [enquetes, setEnquetes] = useState<EnqueteSala[]>([])
  const [carregando, setCarregando] = useState(true)
  const [criando, setCriando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [pergunta, setPergunta] = useState('')
  const [opcoes, setOpcoes] = useState(['', ''])
  const [votando, setVotando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      const res = await fetch(`/api/salas/${salaId}/enquetes`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { enquetes?: EnqueteSala[] }
      if (data.enquetes) setEnquetes(data.enquetes)
    } finally {
      setCarregando(false)
    }
  }, [salaId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useVisibleInterval(() => void carregar(), 8000)

  async function criarEnquete(event: React.FormEvent) {
    event.preventDefault()
    const opcoesValidas = opcoes.map((o) => o.trim()).filter(Boolean)
    if (pergunta.trim().length < 3 || opcoesValidas.length < 2) return

    setCriando(true)
    try {
      const res = await fetch(`/api/salas/${salaId}/enquetes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: pergunta.trim(), opcoes: opcoesValidas }),
      })
      const data = (await res.json()) as { enquete?: EnqueteSala; error?: string }
      if (!res.ok || !data.enquete) throw new Error(data.error ?? 'Erro ao criar enquete.')
      setEnquetes((prev) => [data.enquete!, ...prev])
      setPergunta('')
      setOpcoes(['', ''])
      setMostrarForm(false)
      toast.success('Enquete publicada.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar enquete.')
    } finally {
      setCriando(false)
    }
  }

  async function votar(enqueteId: string, opcaoId: string) {
    setVotando(opcaoId)
    try {
      const res = await fetch(`/api/salas/${salaId}/enquetes/${enqueteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcaoId }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Erro ao votar.')
      }
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao votar.')
    } finally {
      setVotando(null)
    }
  }

  async function encerrar(enqueteId: string) {
    await confirmAction({
      titulo: 'Encerrar esta enquete?',
      descricao: 'Ninguém mais poderá votar.',
      labelConfirmar: 'Encerrar',
      variante: 'destructive',
      cancelled: false,
      run: async () => {
        const res = await fetch(`/api/salas/${salaId}/enquetes/${enqueteId}`, {
          method: 'PATCH',
        })
        if (!res.ok) throw new Error('Não foi possível encerrar a enquete.')
        setEnquetes((prev) => prev.filter((e) => e.id !== enqueteId))
      },
      success: 'Enquete encerrada.',
    })
  }

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <BarChart3 className="h-4 w-4" />
          Enquetes
        </h2>
        {isHost && (
          <m.button
            type="button"
            onClick={() => setMostrarForm((v) => !v)}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-xs font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
          >
            {mostrarForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {mostrarForm ? 'Cancelar' : 'Nova enquete'}
          </m.button>
        )}
      </div>

      <AnimatePresence>
        {isHost && mostrarForm && (
          <m.form
            key="form-enquete"
            variants={collapsePanel}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springSnappy}
            onSubmit={criarEnquete}
            className="mb-4 overflow-hidden space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3"
          >
          <input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            placeholder="Pergunta da enquete"
            maxLength={200}
            required
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
          />
          {opcoes.map((opcao, index) => (
            <input
              key={index}
              value={opcao}
              onChange={(e) => {
                const next = [...opcoes]
                next[index] = e.target.value
                setOpcoes(next)
              }}
              placeholder={`Opção ${index + 1}`}
              maxLength={120}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
            />
          ))}
          {opcoes.length < 6 && (
            <button
              type="button"
              onClick={() => setOpcoes((prev) => [...prev, ''])}
              className="text-xs font-semibold text-[rgb(var(--color-primary-fg))]"
            >
              + Adicionar opção
            </button>
          )}
          <m.button
            type="submit"
            disabled={criando}
            whileTap={{ scale: 0.96 }}
            transition={springSnappy}
            className="rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {criando ? 'Publicando…' : 'Publicar enquete'}
          </m.button>
          </m.form>
        )}
      </AnimatePresence>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-[rgb(var(--foreground-muted))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando enquetes…
        </div>
      ) : enquetes.length === 0 ? (
        <MotionEmptyState title="Nenhuma enquete ativa" className="py-4 text-center text-sm" />
      ) : (
        <m.ul variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
          <AnimatePresence mode="popLayout">
            {enquetes.map((enquete) => (
              <m.li
                key={enquete.id}
                layout
                variants={staggerItem}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
                className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-4"
              >
              <div className="mb-3 flex items-start justify-between gap-2">
                <p className="text-base font-semibold text-[rgb(var(--foreground))]">{enquete.pergunta}</p>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => void encerrar(enquete.id)}
                    className="shrink-0 text-xs text-red-500 hover:underline"
                  >
                    Encerrar
                  </button>
                )}
              </div>

              <ul className="space-y-2">
                {enquete.opcoes.map((opcao) => {
                  const selecionada = enquete.meuVotoOpcaoId === opcao.id
                  const lider = enquete.totalVotos > 0 && opcao.votos === Math.max(...enquete.opcoes.map((o) => o.votos))
                  return (
                    <li key={opcao.id}>
                      <button
                        type="button"
                        disabled={votando === opcao.id}
                        onClick={() => void votar(enquete.id, opcao.id)}
                        className={`relative w-full overflow-hidden rounded-xl border text-left transition ${
                          selecionada
                            ? 'border-[rgb(var(--color-primary))] ring-1 ring-[rgb(var(--color-primary))]/40'
                            : 'border-[rgb(var(--border))] hover:border-[rgb(var(--foreground-muted))]'
                        }`}
                      >
                        <m.div
                          layout
                          transition={springGentle}
                          className="absolute inset-y-0 left-0"
                          style={{
                            width: `${Math.max(opcao.percentual, opcao.votos > 0 ? 6 : 0)}%`,
                            backgroundColor: 'rgb(var(--color-primary) / 0.35)',
                          }}
                        />
                        <div className="relative px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              {selecionada && (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
                              )}
                              <span className="text-sm font-medium text-[rgb(var(--foreground))]">
                                {opcao.texto}
                                {lider && enquete.totalVotos > 1 && (
                                  <span className="ml-2 text-xs font-semibold text-emerald-400">Líder</span>
                                )}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold tabular-nums text-[rgb(var(--foreground))]">
                                {opcao.percentual}%
                              </div>
                              <div className="text-xs text-[rgb(var(--foreground-muted))]">
                                {opcao.votos} voto{opcao.votos === 1 ? '' : 's'}
                              </div>
                            </div>
                          </div>

                          {isHost && opcao.votantes.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[rgb(var(--border))]/60 pt-2">
                              <p className="w-full text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                                Votantes
                              </p>
                              {opcao.votantes.map((v) => (
                                <span
                                  key={v.userId}
                                  className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--surface))] px-2 py-0.5 text-xs text-[rgb(var(--foreground))]"
                                >
                                  {v.avatarUrl ? (
                                    <img
                                      src={v.avatarUrl}
                                      alt=""
                                      className="h-4 w-4 rounded-full object-cover"
                                    />
                                  ) : (
                                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-bold">
                                      <InicialAvatar nome={v.nome} />
                                    </span>
                                  )}
                                  {v.nome ?? 'Membro'}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>

              <p className="mt-3 text-xs text-[rgb(var(--foreground-muted))]">
                {enquete.totalVotos} voto(s) no total · toque em uma opção para votar ou alterar
              </p>
            </m.li>
            ))}
          </AnimatePresence>
        </m.ul>
      )}
    </section>
  )
}
