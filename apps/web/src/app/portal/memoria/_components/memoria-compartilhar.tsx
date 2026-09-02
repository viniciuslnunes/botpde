'use client'

import { useState } from 'react'
import { FileDown, Share2 } from 'lucide-react'
import { toast } from '@torcida/ui'

type Props = {
  diaIso: string
  tituloDia: string
}

export function MemoriaCompartilhar({ diaIso, tituloDia }: Props) {
  const [pending, setPending] = useState(false)

  function montarLink() {
    const url = new URL('/portal/memoria', window.location.origin)
    url.searchParams.set('dia', diaIso)
    const escopo = new URLSearchParams(window.location.search).get('escopo')
    if (escopo) url.searchParams.set('escopo', escopo)
    const cap = new URLSearchParams(window.location.search).get('cap')
    if (cap) url.searchParams.set('cap', cap)
    return url.toString()
  }

  async function compartilhar() {
    if (pending) return
    setPending(true)
    try {
      const link = montarLink()
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: tituloDia, text: 'Memória da torcida', url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      toast.success('Link do dia copiado.')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Não foi possível compartilhar.')
    } finally {
      setPending(false)
    }
  }

  function exportar() {
    window.print()
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={compartilhar}
        className="app-touch-target inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        aria-label="Compartilhar este dia"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        Compartilhar
      </button>
      <button
        type="button"
        onClick={exportar}
        className="app-touch-target inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        aria-label="Exportar dia para PDF"
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        PDF
      </button>
    </div>
  )
}
