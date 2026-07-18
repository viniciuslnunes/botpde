'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, Check, Copy, Share2 } from 'lucide-react'
import { buildEventoIcs, downloadIcsFile } from '@/lib/evento-ics'

export function EventoAcoesRapidas({
  eventoId,
  titulo,
  descricao,
  local,
  dataIso,
  podePublicarMural = true,
}: {
  eventoId: string
  titulo: string
  descricao?: string | null
  local?: string | null
  dataIso: string
  podePublicarMural?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copiarLink() {
    const url = `${window.location.origin}/portal/eventos/${eventoId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  function baixarIcs() {
    const ics = buildEventoIcs({
      id: eventoId,
      titulo,
      descricao,
      local,
      data: new Date(dataIso),
    })
    downloadIcsFile(`evento-${eventoId}`, ics)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={baixarIcs}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        Adicionar ao calendário
      </button>
      <button
        type="button"
        onClick={() => void copiarLink()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Link copiado' : 'Copiar link'}
      </button>
      {podePublicarMural && (
        <Link
          href={`/portal/comunidade?eventoId=${eventoId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
        >
          <Share2 className="h-3.5 w-3.5" />
          Publicar no mural
        </Link>
      )}
    </div>
  )
}
