'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import {
  alternarRivalidadeAction,
  buscarClubesAction,
  type ClubeSugestao,
} from '../actions'

export interface RivalOpcao {
  id: string
  nome: string
  escudoUrl: string | null
}

const DEBOUNCE_MS = 250

/**
 * Rivais do clube. O seletor é typeahead por Server Action com `take: 10` — o
 * catálogo é nacional, então nunca embarcamos a lista inteira no cliente.
 *
 * A lista aplica o resultado otimista antes do round-trip: adicionar/remover
 * rival é reversível e barato, e esperar o refresh do RSC deixaria o clique sem
 * resposta por um RTT inteiro.
 */
export function ClubeRivais({ clubeId, rivais }: { clubeId: string; rivais: RivalOpcao[] }) {
  const router = useRouter()
  const [lista, setLista] = useState<RivalOpcao[]>(rivais)
  const [termo, setTermo] = useState('')
  const [sugestoes, setSugestoes] = useState<ClubeSugestao[]>([])
  const [buscando, setBuscando] = useState(false)
  const [, iniciar] = useTransition()
  const pedido = useRef(0)

  // Reconcilia com o servidor quando o RSC revalida (outra aba, outro operador).
  useEffect(() => {
    setLista(rivais)
  }, [rivais])

  useEffect(() => {
    const q = termo.trim()
    if (q.length < 2) {
      setSugestoes([])
      setBuscando(false)
      return
    }
    setBuscando(true)
    const atual = ++pedido.current
    const timer = window.setTimeout(async () => {
      try {
        const resultado = await buscarClubesAction(q, clubeId)
        // Resposta fora de ordem não pode sobrescrever a busca mais recente.
        if (pedido.current === atual) setSugestoes(resultado)
      } finally {
        if (pedido.current === atual) setBuscando(false)
      }
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [termo, clubeId])

  function alternar(rival: RivalOpcao, adicionar: boolean) {
    const anterior = lista
    setLista(adicionar ? [...lista, rival] : lista.filter((r) => r.id !== rival.id))
    setTermo('')
    setSugestoes([])

    iniciar(async () => {
      const resultado = await alternarRivalidadeAction(clubeId, rival.id, adicionar)
      if (!resultado.ok) {
        setLista(anterior)
        toast.error(resultado.erro ?? 'Não foi possível salvar a rivalidade.')
        return
      }
      router.refresh()
    })
  }

  const jaRival = (id: string) => lista.some((r) => r.id === id)

  return (
    <div className="space-y-3">
      {lista.length === 0 ? (
        <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum rival cadastrado.</p>
      ) : (
        <ul className="space-y-1">
          {lista.map((rival) => (
            <li
              key={rival.id}
              className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-2 py-1.5"
            >
              <EscudoClube nome={rival.nome} escudoUrl={rival.escudoUrl} size="xs" />
              <span className="min-w-0 flex-1 truncate text-sm text-[rgb(var(--foreground))]">
                {rival.nome}
              </span>
              <button
                type="button"
                onClick={() => alternar(rival, false)}
                aria-label={`Remover rivalidade com ${rival.nome}`}
                className="rounded-md p-1 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-danger-fg))]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar clube para marcar como rival…"
          aria-label="Buscar clube para marcar como rival"
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--color-primary))]"
        />
        {buscando ? (
          <Loader2
            className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-[rgb(var(--foreground-muted))]"
            aria-hidden
          />
        ) : null}

        {termo.trim().length >= 2 && !buscando && sugestoes.length === 0 ? (
          <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
            Nenhum clube encontrado para “{termo.trim()}”.
          </p>
        ) : null}

        {sugestoes.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {sugestoes.map((sugestao) => {
              const marcado = jaRival(sugestao.id)
              return (
                <li key={sugestao.id}>
                  <button
                    type="button"
                    disabled={marcado}
                    onClick={() =>
                      alternar(
                        { id: sugestao.id, nome: sugestao.nome, escudoUrl: sugestao.escudoUrl },
                        true,
                      )
                    }
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
                  >
                    <EscudoClube nome={sugestao.nome} escudoUrl={sugestao.escudoUrl} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-sm text-[rgb(var(--foreground))]">
                      {sugestao.nome}
                      {sugestao.estado ? (
                        <span className="text-[rgb(var(--foreground-muted))]"> · {sugestao.estado}</span>
                      ) : null}
                    </span>
                    {marcado ? (
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">já é rival</span>
                    ) : (
                      <Plus className="h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]" aria-hidden />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
