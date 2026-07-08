'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Loader2, Plus, X } from 'lucide-react'
import { toast } from '@torcida/ui'

export type EnqueteSala = {
  id: string
  pergunta: string
  encerradaEm: string | null
  criadoEm: string
  meuVotoOpcaoId: string | null
  totalVotos: number
  opcoes: { id: string; texto: string; votos: number; percentual: number }[]
}

interface SalaEnqueteProps {
  salaId: string
  isHost: boolean
}

export function SalaEnquete({ salaId, isHost }: SalaEnqueteProps) {
  const [enquetes, setEnquetes] = useState<EnqueteSala[]>([])
  const [carregando, setCarregando] = useState(true)
  const [criando, setCriando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [pergunta, setPergunta] = useState('')
  const [opcoes, setOpcoes] = useState(['', ''])
  const [votando, setVotando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
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
    const id = window.setInterval(() => void carregar(), 4000)
    return () => window.clearInterval(id)
  }, [carregar])

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
    const res = await fetch(`/api/salas/${salaId}/enquetes/${enqueteId}`, { method: 'PATCH' })
    if (!res.ok) {
      toast.error('Não foi possível encerrar a enquete.')
      return
    }
    setEnquetes((prev) => prev.filter((e) => e.id !== enqueteId))
    toast.success('Enquete encerrada.')
  }

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <BarChart3 className="h-4 w-4" />
          Enquetes
        </h2>
        {isHost && (
          <button
            type="button"
            onClick={() => setMostrarForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-xs font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
          >
            {mostrarForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {mostrarForm ? 'Cancelar' : 'Nova enquete'}
          </button>
        )}
      </div>

      {isHost && mostrarForm && (
        <form onSubmit={criarEnquete} className="mb-4 space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
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
              className="text-xs font-semibold text-[rgb(var(--color-primary))]"
            >
              + Adicionar opção
            </button>
          )}
          <button
            type="submit"
            disabled={criando}
            className="rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {criando ? 'Publicando…' : 'Publicar enquete'}
          </button>
        </form>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-[rgb(var(--foreground-muted))]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando enquetes…
        </div>
      ) : enquetes.length === 0 ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhuma enquete ativa.</p>
      ) : (
        <ul className="space-y-3">
          {enquetes.map((enquete) => (
            <li
              key={enquete.id}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{enquete.pergunta}</p>
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
                  return (
                    <li key={opcao.id}>
                      <button
                        type="button"
                        disabled={votando === opcao.id}
                        onClick={() => void votar(enquete.id, opcao.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                          selecionada
                            ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/10'
                            : 'border-[rgb(var(--border))] hover:bg-[rgb(var(--surface))]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{opcao.texto}</span>
                          <span className="text-xs text-[rgb(var(--foreground-muted))]">
                            {opcao.percentual}% ({opcao.votos})
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border))]">
                          <div
                            className="h-full rounded-full bg-[rgb(var(--color-primary))]"
                            style={{ width: `${opcao.percentual}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                {enquete.totalVotos} voto(s)
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
