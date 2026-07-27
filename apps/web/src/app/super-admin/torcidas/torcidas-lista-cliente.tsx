'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import type { TorcidaOpcao } from '@/lib/torcida-labels'

export function TorcidasListaCliente({ torcidas }: { torcidas: TorcidaOpcao[] }) {
  const [busca, setBusca] = useState('')

  const filtradas = useMemo(() => {
    const alvo = normalizarTexto(busca)
    if (!alvo) return torcidas
    return torcidas.filter((t) => {
      const haystack = normalizarTexto([t.nome, t.slug, t.clubeNome ?? ''].join(' '))
      return haystack.includes(alvo)
    })
  }, [busca, torcidas])

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por torcida, clube ou slug…"
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] py-1.5 pl-8 pr-3 text-sm text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))]"
          aria-label="Buscar torcida"
        />
      </div>

      {filtradas.length === 0 ? (
        <p className="px-2 py-1 text-sm text-[rgb(var(--foreground-muted))]">Nenhuma torcida encontrada.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-[rgb(var(--foreground-muted))]">
          {filtradas.map((t) => (
            <li
              key={t.id}
              className="flex justify-between gap-2 rounded px-2 py-1 hover:bg-[rgb(var(--background-subtle))]"
            >
              <span className="truncate text-[rgb(var(--foreground))]">{t.nome}</span>
              <span className="shrink-0 font-mono text-xs text-[rgb(var(--foreground-muted))]">{t.slug}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
