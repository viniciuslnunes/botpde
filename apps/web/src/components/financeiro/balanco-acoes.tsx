'use client'

import { useState, useTransition } from 'react'
import { Copy, Printer } from 'lucide-react'

export function BalancoAcoes({ textoResumo }: { textoResumo: string }) {
  const [pending, startTransition] = useTransition()
  const [copiado, setCopiado] = useState(false)

  function copiar() {
    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(textoResumo)
        setCopiado(true)
        window.setTimeout(() => setCopiado(false), 2000)
      } catch {
        setCopiado(false)
      }
    })
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copiar}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
      >
        <Copy className="h-3.5 w-3.5" />
        {copiado ? 'Copiado' : 'Copiar resumo'}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
      >
        <Printer className="h-3.5 w-3.5" />
        Imprimir / salvar PDF
      </button>
    </div>
  )
}
