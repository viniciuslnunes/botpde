'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import { EscudoClube } from '@/components/onboarding/escudo-clube'
import { SearchFilterInput, type ReactiveSearchOption } from '@/components/ui/reactive-search'
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
 */
export function ClubeRivais({ clubeId, rivais }: { clubeId: string; rivais: RivalOpcao[] }) {
  const router = useRouter()
  const [lista, setLista] = useState<RivalOpcao[]>(rivais)
  const [termo, setTermo] = useState('')
  const [, iniciar] = useTransition()

  const [rivaisSincronizados, setRivaisSincronizados] = useState(rivais)
  if (rivais !== rivaisSincronizados) {
    setRivaisSincronizados(rivais)
    setLista(rivais)
  }

  async function buscarClubes(termoBusca: string): Promise<ReactiveSearchOption[]> {
    const itens = await buscarClubesAction(termoBusca, clubeId)
    return itens.map((sugestao) => ({
      id: sugestao.id,
      label: sugestao.nome,
      sublabel: sugestao.estado ?? null,
      searchText: [sugestao.nome, sugestao.estado].filter(Boolean).join(' '),
      disabled: lista.some((r) => r.id === sugestao.id),
      leading: (
        <EscudoClube nome={sugestao.nome} escudoUrl={sugestao.escudoUrl} size="xs" />
      ),
      payload: sugestao satisfies ClubeSugestao,
    }))
  }

  function alternar(rival: RivalOpcao, adicionar: boolean) {
    const anterior = lista
    setLista(adicionar ? [...lista, rival] : lista.filter((r) => r.id !== rival.id))
    setTermo('')

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

  function selecionarSugestao(item: ReactiveSearchOption) {
    const sugestao = item.payload as ClubeSugestao | undefined
    if (!sugestao || lista.some((r) => r.id === sugestao.id)) return
    alternar(
      { id: sugestao.id, nome: sugestao.nome, escudoUrl: sugestao.escudoUrl },
      true,
    )
  }

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

      <SearchFilterInput
        value={termo}
        onChange={setTermo}
        placeholder="Buscar clube para marcar como rival…"
        ariaLabel="Buscar clube para marcar como rival"
        onSearch={buscarClubes}
        onSelectSuggestion={selecionarSugestao}
        minChars={2}
        debounceMs={DEBOUNCE_MS}
        noResultsMessage="Nenhum clube encontrado."
        fallbackIcon={Plus}
      />
    </div>
  )
}
