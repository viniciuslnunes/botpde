'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { MemoriaEscopo } from '@torcida/types'
import { SearchFilterInput, type ReactiveSearchOption } from '@/components/ui/reactive-search'
import { buscarMemoriaAction } from '../actions'
import type { MemoriaBuscaHit } from '../_lib/memoria-busca'

type Props = {
  escopo: MemoriaEscopo
}

function rotuloTipo(tipo: MemoriaBuscaHit['tipo']): string {
  if (tipo === 'partida') return 'Jogo'
  if (tipo === 'evento') return 'Evento'
  if (tipo === 'fato') return 'Memória'
  return 'Publicação'
}

export function MemoriaBusca({ escopo }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [termo, setTermo] = useState('')

  async function buscarNoAcervo(t: string): Promise<ReactiveSearchOption[]> {
    const res = await buscarMemoriaAction({ termo: t, escopo })
    return (res.hits ?? []).map((h) => ({
      id: `${h.dia}-${h.tipo}-${h.titulo}`,
      label: h.titulo,
      sublabel: `${h.dia} · ${rotuloTipo(h.tipo)}${h.subtitulo ? ` — ${h.subtitulo}` : ''}`,
      searchText: [h.titulo, h.subtitulo, h.dia, rotuloTipo(h.tipo)].filter(Boolean).join(' '),
      payload: h satisfies MemoriaBuscaHit,
    }))
  }

  function irPara(item: ReactiveSearchOption) {
    const hit = item.payload as MemoriaBuscaHit
    const p = new URLSearchParams(searchParams.toString())
    p.set('escopo', escopo)
    p.set('dia', hit.dia)
    router.replace(`/portal/memoria?${p.toString()}`, { scroll: false })
    setTermo('')
  }

  return (
    <div className="relative mb-3">
      <SearchFilterInput
        value={termo}
        onChange={setTermo}
        placeholder="Buscar no acervo…"
        ariaLabel="Buscar no acervo"
        onSearch={buscarNoAcervo}
        onSelectSuggestion={irPara}
        minChars={2}
        emptyMessage="Digite ao menos 2 letras."
        noResultsMessage="Nada encontrado neste recorte."
      />
    </div>
  )
}
